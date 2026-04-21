/**
 * Scraper for the public OpportunityDetail page (precontractual).
 *
 * Unlike the contractual monitor (which needs a logged-in session with a
 * specific SECOP proveedor account), the public process detail page is
 * accessible to anyone — BUT it's gated behind reCAPTCHA. So we use
 * Playwright + CapSolver, same as the login flow.
 *
 * We only invoke this when we really need it:
 *   - Bootstrap: the first time a process is added (to capture hora-exacta cronograma)
 *   - On detected change: when the public API indicates something shifted
 *
 * Regular polling uses the free public API (fetcher.ts) to avoid captcha cost.
 */
import { chromium, type Page } from 'playwright'
import * as cheerio from 'cheerio'
import { config, USER_AGENT } from '../config.js'
import { solveCaptcha, injectCaptchaToken } from '../captcha.js'

export type CronogramaEvento = {
  nombre: string                  // "Presentación de oferta"
  fecha_inicio: string | null     // "03/12/2025 8:00:00 AM"
  fecha_fin: string | null        // "03/12/2025 5:00:00 PM"
  estado: string | null           // "Próximo" / "Finalizado" / etc.
}

export type BasicProcessInfo = {
  entidad: string | null
  nit_entidad: string | null
  referencia: string | null
  objeto: string | null
  descripcion: string | null
  modalidad: string | null
  tipo_contrato: string | null
  precio_base: string | null       // string crudo, ej: "4.616.146.330 COP"
  fase: string | null
  estado: string | null
  duracion: string | null
  unidad_duracion: string | null
}

export type OpportunityScrapeResult = {
  notice_uid: string
  scraped_at: string
  cronograma: CronogramaEvento[]
  basic_info: BasicProcessInfo
  raw_html_size: number
}

function buildPublicUrl(noticeUid: string): string {
  return `https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=${noticeUid}&isFromPublicArea=True&isModal=False`
}

/**
 * Full scrape of the OpportunityDetail page.
 * Handles the reCAPTCHA gate automatically if CAPSOLVER_API_KEY is set.
 *
 * Reintenta hasta MAX_CAPTCHA_ATTEMPTS veces si SECOP devuelve el error de
 * "content expired due to inactivity" — esto pasa cuando CapSolver tarda
 * más de lo que SECOP tolera para la sesión del captcha específico.
 */
const MAX_CAPTCHA_ATTEMPTS = 3

export async function scrapeOpportunityDetail(noticeUid: string): Promise<OpportunityScrapeResult> {
  if (!/^CO1\.NTC\.\d+$/.test(noticeUid)) {
    throw new Error(`Invalid noticeUID: ${noticeUid}`)
  }

  const targetUrl = buildPublicUrl(noticeUid)
  console.log(`[OpportunityScraper] Starting ${noticeUid}`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ userAgent: USER_AGENT })
  const page = await context.newPage()

  try {
    let html: string | null = null

    for (let attempt = 1; attempt <= MAX_CAPTCHA_ATTEMPTS; attempt++) {
      if (attempt > 1) {
        console.log(`[OpportunityScraper] ${noticeUid}: retry attempt ${attempt}/${MAX_CAPTCHA_ATTEMPTS}`)
      }

      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })

      // 1. If landed on a captcha gate, solve it
      const gatedUrl = page.url()
      const onCaptchaGate = /GoogleReCaptcha|recaptcha/i.test(gatedUrl)
      const hasCaptchaEl = await page.evaluate('!!document.querySelector(".g-recaptcha, [data-sitekey]")')

      if (onCaptchaGate || hasCaptchaEl) {
        console.log(`[OpportunityScraper] Captcha gate detected, solving...`)
        const token = await solveCaptcha(page.url(), page, '[OpportunityScraper]')
        if (!token) {
          throw new Error('Captcha solving failed — set CAPSOLVER_API_KEY or solve manually within 30s')
        }
        await injectCaptchaToken(page, token)

        const clicked = await page.evaluate(`
          (() => {
            var btn = document.getElementById('btnCaptchaCheckButton');
            if (btn) { btn.click(); return true; }
            var form = document.getElementById('divmainDiv_frmCaptcha') || document.querySelector('form[action*="CaptchaCheck"]');
            if (form) { form.submit(); return true; }
            return false;
          })()
        `) as boolean

        if (!clicked) {
          throw new Error('Could not find captcha submit button/form')
        }

        await page.waitForURL(
          url => !/GoogleReCaptcha/i.test(url.toString()),
          { timeout: 30_000 },
        ).catch(() => {
          console.warn('[OpportunityScraper] Post-captcha navigation did not complete in 30s')
        })
        await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => undefined)
      }

      // 2. Detectar página de error ("content expired due to inactivity")
      const finalUrl = page.url()
      if (/\/ErrorPage\/|content.*expired|inactivity/i.test(finalUrl)) {
        console.warn(`[OpportunityScraper] ${noticeUid}: session expired during captcha (attempt ${attempt})`)
        if (attempt < MAX_CAPTCHA_ATTEMPTS) continue
        throw new Error(`Session expired after ${MAX_CAPTCHA_ATTEMPTS} captcha attempts (SECOP timeout)`)
      }

      if (!finalUrl.includes('OpportunityDetail')) {
        throw new Error(`Unexpected URL after captcha: ${finalUrl}`)
      }

      // Success
      await page.waitForTimeout(2_000)
      html = await page.content()
      break
    }

    if (!html) {
      throw new Error('Failed to load OpportunityDetail after all retry attempts')
    }
    // Extraer con cheerio en vez de page.evaluate() para evitar el problema
    // de `__name is not defined` — tsx/esbuild con keepNames transforma tanto
    // function declarations como const arrow functions cuando corren dentro
    // del callback de evaluate, y eso rompe en el browser context.
    const cronograma = extractCronogramaFromHtml(html)
    const basicInfo = extractBasicInfoFromHtml(html)

    console.log(`[OpportunityScraper] ${noticeUid}: ${cronograma.length} eventos del cronograma, entidad="${basicInfo.entidad || '?'}", valor=${basicInfo.precio_base || '?'}`)

    return {
      notice_uid: noticeUid,
      scraped_at: new Date().toISOString(),
      cronograma,
      basic_info: basicInfo,
      raw_html_size: html.length,
    }
  } finally {
    await browser.close()
  }
}

/**
 * Normalize whitespace in a text fragment.
 */
function normalizeText(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * Extract basic process information from the OpportunityDetail HTML.
 *
 * Corre en Node (no en el browser) usando cheerio — así evitamos el problema
 * de `__name is not defined` que aparece cuando tsx/esbuild con keepNames
 * transpila código que luego se pasa a page.evaluate().
 *
 * SECOP renders labels with `data-sentencecode` attributes and values in
 * sibling cells. Strategy:
 *   1. Map known sentencecode patterns → field name
 *   2. For each label found, find the adjacent "value cell" in the row
 *   3. Fall back to label-text matching if sentencecodes absent
 *
 * Returns nulls for anything we can't find — monitor handles partial data.
 */
function extractBasicInfoFromHtml(html: string): BasicProcessInfo {
  const $ = cheerio.load(html)

  const getValueNear = (labelEl: ReturnType<typeof $>): string | null => {
    const labelText = normalizeText(labelEl.text())
    const labelTd = labelEl.closest('td')
    if (labelTd.length > 0) {
      let next = labelTd.next()
      while (next.length > 0 && !normalizeText(next.text())) next = next.next()
      const t = normalizeText(next.text())
      if (t) return t
    }
    const row = labelEl.closest('tr')
    if (row.length > 0) {
      const cells = row.find('td').toArray()
      for (let i = cells.length - 1; i >= 0; i--) {
        const t = normalizeText($(cells[i]).text())
        if (t && t !== labelText) return t
      }
    }
    return null
  }

  const findBySentenceCode = (patterns: RegExp[]): string | null => {
    let found: string | null = null
    $('[data-sentencecode]').each((_, el) => {
      if (found) return
      const code = $(el).attr('data-sentencecode') || ''
      if (patterns.some(p => p.test(code))) {
        const v = getValueNear($(el))
        if (v) {
          found = v
          return false // break
        }
      }
    })
    return found
  }

  const findByTextLabel = (labelPatterns: RegExp[]): string | null => {
    let found: string | null = null
    $('td, th, span, label, div').each((_, el) => {
      if (found) return
      const text = normalizeText($(el).text())
      if (text.length === 0 || text.length > 80) return
      if (labelPatterns.some(p => p.test(text))) {
        const v = getValueNear($(el))
        if (v && v !== text) {
          found = v
          return false
        }
      }
    })
    return found
  }

  const findById = (ids: string[]): string | null => {
    for (const id of ids) {
      const el = $(`#${id}`)
      if (el.length === 0) continue
      const val = (el.attr('value') || el.text() || '').trim()
      const v = normalizeText(val)
      if (v) return v
    }
    return null
  }

  const entidad = findBySentenceCode([/EntityName/i, /lblEntityLabel/i, /\.Entity\b/])
    || findById(['txtEntityName', 'spnEntidad', 'lblEntidad'])
    || findByTextLabel([/^Entidad( estatal)?$/i, /^Nombre de la entidad$/i])

  const nit_entidad = findBySentenceCode([/NIT|Nit|TaxIdentification/i])
    || findByTextLabel([/^NIT$/i])

  const referencia = findBySentenceCode([/ProcessReference|lblReference|txtReference/i])
    || findById(['txtProcessReference', 'spnProcessReference'])
    || findByTextLabel([/^Referencia( del proceso)?$/i, /^N[úu]mero del proceso$/i])

  const objeto = findBySentenceCode([/ProcureObject|lblObjectLabel|txtObject\b/i])
    || findById(['txtObjectContractsLabel', 'spnObjectContractsLabel', 'txtObjeto'])
    || findByTextLabel([/^Objeto( del contrato)?$/i, /^Nombre del procedimiento$/i, /^T[íi]tulo$/i])

  const descripcion = findBySentenceCode([/Description|lblDescription/i])
    || findByTextLabel([/^Descripci[óo]n( del procedimiento)?$/i])

  const modalidad = findBySentenceCode([/ContractType|ProcurementMethod/i])
    || findByTextLabel([/^Modalidad( de contrataci[óo]n)?$/i, /^Tipo de proceso$/i])

  const tipo_contrato = findBySentenceCode([/TypeOfContract|ContractCategory/i])
    || findByTextLabel([/^Tipo de contrato$/i])

  const precio_base = findBySentenceCode([/EstimatedValue|BaseAmount|BasePrice/i])
    || findById(['txtEstimatedValue', 'spnEstimatedValue', 'txtPrecioBase'])
    || findByTextLabel([/^Valor( estimado| total)?( del contrato)?$/i, /^Precio base$/i, /^Cuant[íi]a$/i])

  const fase = findBySentenceCode([/CurrentPhase|lblPhase|CurrentStep/i])
    || findByTextLabel([/^Fase( actual)?$/i])

  const estado = findBySentenceCode([/CurrentState|lblStatus|ProcedureState/i])
    || findByTextLabel([/^Estado( actual)?$/i])

  const duracion = findBySentenceCode([/Duration\b|lblDuration/i])
    || findByTextLabel([/^Duraci[óo]n( del contrato)?$/i])

  const unidad_duracion = findBySentenceCode([/DurationUnit/i])
    || findByTextLabel([/^Unidad de duraci[óo]n$/i])

  return {
    entidad,
    nit_entidad,
    referencia,
    objeto,
    descripcion,
    modalidad,
    tipo_contrato,
    precio_base,
    fase,
    estado,
    duracion,
    unidad_duracion,
  }
}

/**
 * Pull the cronograma table from the loaded HTML.
 *
 * Strategy: look for any table whose header row mentions schedule-like
 * keywords (fecha, inicio, fin, estado, hito, etapa), then extract rows.
 */
function extractCronogramaFromHtml(html: string): CronogramaEvento[] {
  const $ = cheerio.load(html)
  const results: CronogramaEvento[] = []

  const tables = $('table').toArray()
  for (const table of tables) {
    const $table = $(table)
    const headerCells = $table.find('thead th, tr:first-child th, tr:first-child td').toArray()
    const headers = headerCells
      .map(h => normalizeText($(h).text()).toLowerCase())
      .filter(Boolean)

    if (headers.length < 2) continue

    const hasScheduleKeywords = headers.some(h =>
      /(fecha\s+inicio|fecha\s+fin|hito|etapa|cronograma|scheduled|plazo)/i.test(h),
    )
    if (!hasScheduleKeywords) continue

    const nameIdx = headers.findIndex(h => /(nombre|hito|etapa|descripci|actividad)/i.test(h))
    const startIdx = headers.findIndex(h => /(inicio|desde|start)/i.test(h))
    const endIdx = headers.findIndex(h => /(fin|hasta|end|vencim)/i.test(h))
    const stateIdx = headers.findIndex(h => /(estado|status)/i.test(h))

    const rows = $table.find('tbody tr, tr').toArray()
    for (const row of rows) {
      const $row = $(row)
      const cells = $row.find('td').toArray().map(c => {
        const $c = $(c).clone()
        $c.find('.DateTimeDetail, font.DateTimeDetail').remove()
        return normalizeText($c.text())
      })
      if (cells.length === 0) continue

      // Skip header-like rows
      if (cells.length === headers.length && cells.every(c => /^(fecha|hito|etapa|estado|nombre|inicio|fin)/i.test(c))) continue

      const nombre = nameIdx >= 0 ? cells[nameIdx] : cells[0]
      if (!nombre || nombre.length < 3) continue

      results.push({
        nombre,
        fecha_inicio: startIdx >= 0 ? cells[startIdx] || null : null,
        fecha_fin: endIdx >= 0 ? cells[endIdx] || null : null,
        estado: stateIdx >= 0 ? cells[stateIdx] || null : null,
      })
    }

    if (results.length > 0) break
  }

  return results
}

// ── Heuristic: when to trigger re-scrape ──────────────────────
//
// The caller (monitor) decides whether to invoke scrapeOpportunityDetail()
// based on API-side diffs. Use this helper when you want to make that
// decision consistently:

/**
 * Determine whether we should re-scrape with captcha based on API-side
 * signals. Returns true if ANY of:
 *   - fase changed
 *   - fecha_recepcion or fecha_apertura_efectiva changed
 *   - adjudicado transitioned false → true
 *
 * These are the changes the API can see but that usually imply the
 * human-facing cronograma has new deadlines/hours worth capturing.
 */
export function shouldTriggerRescrape(params: {
  faseChanged: boolean
  deadlineChanged: boolean
  awardedTransitioned: boolean
}): boolean {
  return params.faseChanged || params.deadlineChanged || params.awardedTransitioned
}
