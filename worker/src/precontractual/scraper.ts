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
 */
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

      // The captcha page has a hidden btnCaptchaCheckButton that triggers verification.
      // Click it to proceed — same flow as login.ts uses.
      const clicked = await page.evaluate(`
        (() => {
          var btn = document.getElementById('btnCaptchaCheckButton');
          if (btn) { btn.click(); return true; }
          // Fallback: submit the captcha form
          var form = document.getElementById('divmainDiv_frmCaptcha') || document.querySelector('form[action*="CaptchaCheck"]');
          if (form) { form.submit(); return true; }
          return false;
        })()
      `) as boolean

      if (!clicked) {
        throw new Error('Could not find captcha submit button/form')
      }

      // Wait for navigation past captcha
      await page.waitForURL(
        url => !/GoogleReCaptcha/i.test(url.toString()),
        { timeout: 30_000 },
      ).catch(() => {
        console.warn('[OpportunityScraper] Post-captcha navigation did not complete in 30s')
      })
      await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => undefined)
    }

    // 2. We should now be on the real OpportunityDetail page
    const finalUrl = page.url()
    if (!finalUrl.includes('OpportunityDetail')) {
      throw new Error(`Unexpected URL after captcha: ${finalUrl}`)
    }

    // Give the page a moment for async content
    await page.waitForTimeout(2_000)

    const html = await page.content()
    const [cronograma, basicInfo] = await Promise.all([
      extractCronograma(page),
      extractBasicInfo(page),
    ])

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
 * Extract basic process information from the OpportunityDetail page DOM.
 * Used during bootstrap when the public API dataset hasn't indexed the
 * process yet — gives us enough data to populate the UI until the API
 * catches up.
 *
 * SECOP renders labels with `data-sentencecode` attributes and values in
 * sibling cells. Strategy:
 *   1. Map known sentencecode patterns → field name
 *   2. For each label found, find the adjacent "value cell" in the row
 *   3. Fall back to label-text matching if sentencecodes absent
 *
 * Returns nulls for anything we can't find — monitor handles partial data.
 */
async function extractBasicInfo(page: Page): Promise<BasicProcessInfo> {
  return await page.evaluate(() => {
    // Find the value cell associated with a label element.
    // Label and value are typically sibling <td> inside the same <tr>,
    // or the value is in the NEXT sibling td of the label's parent td.
    function getValueNear(labelEl: Element): string | null {
      // Strategy A: next sibling of the label's closest <td>
      const labelTd = labelEl.closest('td')
      if (labelTd) {
        let next = labelTd.nextElementSibling
        while (next && !next.textContent?.trim()) next = next.nextElementSibling
        if (next?.textContent?.trim()) return normalize(next.textContent)
      }
      // Strategy B: label's parent row, last cell with content
      const row = labelEl.closest('tr')
      if (row) {
        const cells = Array.from(row.querySelectorAll('td'))
        for (let i = cells.length - 1; i >= 0; i--) {
          const t = normalize(cells[i].textContent || '')
          if (t && !cells[i].contains(labelEl)) return t
        }
      }
      return null
    }

    function normalize(s: string): string {
      return s.replace(/\s+/g, ' ').trim()
    }

    function findBySentenceCode(patterns: RegExp[]): string | null {
      const labels = Array.from(document.querySelectorAll('[data-sentencecode]'))
      for (const label of labels) {
        const code = label.getAttribute('data-sentencecode') || ''
        if (patterns.some(p => p.test(code))) {
          const v = getValueNear(label)
          if (v) return v
        }
      }
      return null
    }

    function findByTextLabel(labelPatterns: RegExp[]): string | null {
      const all = Array.from(document.querySelectorAll('td, th, span, label, div'))
      for (const el of all) {
        const text = normalize(el.textContent || '')
        if (text.length > 80) continue // skip paragraphs
        if (labelPatterns.some(p => p.test(text))) {
          const v = getValueNear(el)
          if (v && v !== text) return v
        }
      }
      return null
    }

    // Try selectors for common ID-based inputs (readonly display fields)
    function findById(ids: string[]): string | null {
      for (const id of ids) {
        const el = document.getElementById(id)
        if (!el) continue
        const input = el as HTMLInputElement
        const v = normalize(input.value || el.textContent || '')
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
  })
}

/**
 * Pull the cronograma table from the loaded page.
 *
 * The scraper runs inside Playwright so we can leverage the browser's DOM
 * (more robust than static cheerio parsing for dynamically-hydrated content).
 *
 * Strategy: look for any table whose header row mentions schedule-like
 * keywords (fecha, inicio, fin, estado, hito, etapa), then extract rows.
 */
async function extractCronograma(page: Page): Promise<CronogramaEvento[]> {
  const events = await page.evaluate(() => {
    type Ev = { nombre: string; fecha_inicio: string | null; fecha_fin: string | null; estado: string | null }

    const results: Ev[] = []

    const tables = Array.from(document.querySelectorAll('table'))
    for (const table of tables) {
      const headers = Array.from(table.querySelectorAll('thead th, tr:first-child th, tr:first-child td'))
        .map(h => (h.textContent || '').toLowerCase().trim())
        .filter(Boolean)

      if (headers.length < 2) continue

      const hasScheduleKeywords = headers.some(h =>
        /(fecha\s+inicio|fecha\s+fin|hito|etapa|cronograma|scheduled|plazo)/i.test(h),
      )
      if (!hasScheduleKeywords) continue

      // Identify column indexes (fuzzy)
      const nameIdx = headers.findIndex(h => /(nombre|hito|etapa|descripci|actividad)/i.test(h))
      const startIdx = headers.findIndex(h => /(inicio|desde|start)/i.test(h))
      const endIdx = headers.findIndex(h => /(fin|hasta|end|vencim)/i.test(h))
      const stateIdx = headers.findIndex(h => /(estado|status)/i.test(h))

      const rows = Array.from(table.querySelectorAll('tbody tr, tr'))
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll('td')).map(c => {
          const clone = c.cloneNode(true) as HTMLElement
          clone.querySelectorAll('.DateTimeDetail, font.DateTimeDetail').forEach(el => el.remove())
          return (clone.textContent || '').replace(/\s+/g, ' ').trim()
        })
        if (cells.length === 0) continue

        // Skip rows that look like headers (all cells match header count and contain labels)
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

      // First matching table wins (usually the cronograma table is unique)
      if (results.length > 0) break
    }

    return results
  })

  return events
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
