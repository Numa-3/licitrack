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
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
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
  // Usamos isModal=true&asPopupView=true porque ese modo trae TODO el contenido
  // inline (cronograma, entidad, objeto, valor) vía Azure blob. La variante
  // isModal=false devuelve un shell vacío que depende de scripts que no siempre
  // ejecutamos a tiempo.
  return `https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=${noticeUid}&isFromPublicArea=True&isModal=true&asPopupView=true`
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

        // Esperar que aparezca el contenido real — SECOP mantiene la misma URL
        // después del captcha y solo reemplaza el body. Las señales de éxito son:
        // elemento .CompanyFullName o #fdsRequestSummaryInfo en el DOM.
        // Si vemos URL de ErrorPage, es sesión expirada.
        const contentAppeared = await page.waitForSelector(
          '.CompanyFullName, #fdsRequestSummaryInfo, #cbxBasePriceValue',
          { timeout: 30_000 },
        ).then(() => true).catch(() => false)

        if (!contentAppeared) {
          const currentUrl = page.url()
          console.warn(`[OpportunityScraper] Content never appeared after captcha. URL: ${currentUrl}`)

          if (/\/ErrorPage\/|inactivity/i.test(currentUrl)) {
            console.warn(`[OpportunityScraper] ${noticeUid}: session expired (attempt ${attempt})`)
            if (attempt < MAX_CAPTCHA_ATTEMPTS) continue
            throw new Error(`Session expired after ${MAX_CAPTCHA_ATTEMPTS} captcha attempts`)
          }
          // Si no hay contenido y no es error page, reintentar
          if (attempt < MAX_CAPTCHA_ATTEMPTS) continue
          throw new Error('Content never loaded after captcha (unknown cause)')
        }
      }

      // networkidle por si hay blobs async terminando de cargar
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
      await page.waitForTimeout(1_500)
      html = await page.content()
      break
    }

    if (!html) {
      throw new Error('Failed to load OpportunityDetail after all retry attempts')
    }

    // Guardar el HTML para diagnóstico. Se sobreescribe cada scrape.
    // Esto nos permite iterar los selectores sin volver a consumir créditos
    // de CapSolver.
    try {
      const debugDir = join(process.cwd(), 'debug-html')
      await mkdir(debugDir, { recursive: true })
      const filename = `opportunity-${noticeUid}.html`
      await writeFile(join(debugDir, filename), html, 'utf-8')
      console.log(`[OpportunityScraper] Saved HTML to debug-html/${filename} (${html.length} bytes)`)
    } catch (err) {
      console.warn('[OpportunityScraper] Failed to save debug HTML:',
        err instanceof Error ? err.message : err)
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

  // Selectores basados en el HTML real capturado del popup OpportunityDetail.
  // SECOP usa IDs específicos en forma de prefijo_row_cell_spn*. Los capturamos
  // directamente para robustez — fallback a búsqueda por texto solo si cambia.

  const byId = (id: string): string | null => {
    const el = $(`#${id}`)
    if (el.length === 0) return null
    const v = normalizeText(el.text())
    return v || null
  }

  // Entidad: span class="CompanyFullName" dentro del contentzone del buyer
  const entidad = normalizeText(
    $('#fdsRequestSummaryInfo_tblDetail_trRowBuyer_tdCell1 .CompanyFullName').first().text(),
  ) || normalizeText($('.CompanyFullName').first().text()) || null

  const precio_base = byId('cbxBasePriceValue')

  const referencia = byId('fdsRequestSummaryInfo_tblDetail_trRowRef_tdCell2_spnRequestReference')

  const objeto = byId('fdsRequestSummaryInfo_tblDetail_trRowName_tdCell2_spnRequestName')

  const descripcion = byId('fdsRequestSummaryInfo_tblDetail_trRowDescription_tdCell2_spnDescription')

  const modalidad = byId('fdsRequestSummaryInfo_tblDetail_trRowProcedureType_tdCell2_spnProcedureType')

  const tipo_contrato = byId('fdsObjectOfTheContract_tblDetail_trRowTypeOfContract_tdCell2_spnTypeOfContract')

  const fase = byId('fdsRequestSummaryInfo_tblDetail_trRowPhase_tdCell2_spnPhase')

  const estado = byId('fdsRequestSummaryInfo_tblDetail_trRowState_tdCell2_spnState')

  const duracion = byId('fdsObjectOfTheContract_tblDetail_trRowContractDuration_tdCell2_spnContractDuration')

  const unidad_duracion = byId('fdsObjectOfTheContract_tblDetail_trRowContractDuration_tdCell2_spnContractDurationType')

  const nit_entidad = null // No aparece directamente en el popup; viene del API

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
 * Pull the cronograma from the loaded HTML.
 *
 * Estructura real del popup SECOP (capturada 2026-04-21):
 *   <tr id="trScheduleDateRow_N">
 *     <td class="Label"><label id="lblScheduleDateTimeLabel_N">Nombre del evento</label></td>
 *     <td class="Field">
 *       <div id="dtmbScheduleDateTime_N" class="VortalDateBox">
 *         <span id="dtmbScheduleDateTime_N_txt">4 días de tiempo transcurrido
 *           <font class="DateTimeDetail">(17/04/2026 10:00:00 AM(UTC-05:00) Bogotá, Lima, Quito)</font>
 *         </span>
 *       </div>
 *     </td>
 *   </tr>
 *
 * Las filas con eventos reales NO tienen style="display:none".
 */
function extractCronogramaFromHtml(html: string): CronogramaEvento[] {
  const $ = cheerio.load(html)
  const results: CronogramaEvento[] = []

  const rows = $('tr[id^="trScheduleDateRow_"]').toArray()
  for (const row of rows) {
    const $row = $(row)

    // Skip hidden rows
    const style = $row.attr('style') || ''
    if (/display\s*:\s*none/i.test(style)) continue

    const label = normalizeText($row.find('label[id^="lblScheduleDateTimeLabel_"]').first().text())
    if (!label) continue

    // Extraer la fecha/hora dentro de <font class="DateTimeDetail">(...)</font>
    const detailText = normalizeText($row.find('font.DateTimeDetail').first().text())
    // Típico: "(17/04/2026 10:00:00 AM(UTC-05:00) Bogotá, Lima, Quito)"
    // Sacamos la primera parte antes del segundo paréntesis (UTC...)
    let fecha: string | null = null
    if (detailText) {
      const m = detailText.match(/\(?\s*([\d\/]+\s+[\d:]+\s*[AP]M)/i)
      if (m) fecha = m[1]
    }

    results.push({
      nombre: label,
      fecha_inicio: fecha,
      fecha_fin: fecha, // Un solo campo de fecha en este formato — lo duplicamos
      estado: null,
    })
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
