/**
 * Radar de descubrimiento: scrapea el buscador público de SECOP II para
 * encontrar procesos NUEVOS por región (ej. Amazonas) en near-real-time.
 *
 * A diferencia del feed de datos abiertos (diario, ~1 día de atraso), el
 * buscador público refleja la plataforma en tiempo real — muestra procesos
 * publicados hace minutos. Por eso es la fuente correcta para frescura horaria.
 *
 * El buscador está detrás de reCAPTCHA → reusamos Playwright + CapSolver
 * (captcha.ts), igual que precontractual/scraper.ts.
 *
 * Flujo (verificado en recon 2026-06-13):
 *   1. GET ContractNoticeManagement/Index → gate de captcha
 *   2. Resolver captcha
 *   3. Llenar Región + Estado + Fecha de publicación desde
 *   4. Click Buscar → grilla grdResultList (orden: más nuevo primero)
 *   5. parseSearchResults(html)
 */
import { chromium, type Page } from 'playwright'
import { config, USER_AGENT } from '../config.js'
import { solveCaptcha, injectCaptchaToken } from '../captcha.js'
import { parseSearchResults, type RadarSearchRow } from './parse-search-results.js'

const SEARCH_URL =
  'https://community.secop.gov.co/Public/Tendering/ContractNoticeManagement/Index?currentLanguage=es-CO&Country=CO&SkinName=CCE'

// Estados del selRequestStatus (verificado en recon)
export const ESTADO = {
  PUBLICADO: '50',
  EN_EVALUACION: '60',
  ADJUDICADO: '70',
  CANCELADO: '100',
} as const

export type RadarSearchParams = {
  region: string                 // "Amazonas"
  status?: string                // ESTADO.PUBLICADO por defecto
  publishedFrom?: Date           // filtro "Fecha de publicación desde"
}

const MAX_CAPTCHA_ATTEMPTS = 3

/** Date → "DD/MM/YYYY h:mm AM/PM" (formato del datetimebox de SECOP). */
function formatSecopDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  let h = d.getHours()
  const min = String(d.getMinutes()).padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${dd}/${mm}/${yyyy} ${h}:${min} ${ampm}`
}

/** Resuelve el gate de captcha si está presente. Devuelve true si pasó. */
async function passCaptchaGate(page: Page, logPrefix: string): Promise<boolean> {
  const onGate = /GoogleReCaptcha|recaptcha/i.test(page.url())
  const hasCaptchaEl = await page.evaluate('!!document.querySelector(".g-recaptcha, [data-sitekey]")')
  if (!onGate && !hasCaptchaEl) return true

  const token = await solveCaptcha(page.url(), page, logPrefix)
  if (!token) return false
  await injectCaptchaToken(page, token)
  await page.evaluate(`(() => {
    var b = document.getElementById('btnCaptchaCheckButton'); if (b) { b.click(); return; }
    var f = document.querySelector('form[action*="CaptchaCheck"]'); if (f) f.submit();
  })()`).catch(() => {})
  // Tras el captcha, vuelve a la página de búsqueda (mismo URL, body reemplazado)
  const ok = await page.waitForSelector('#txtRegion, #btnSearchButton', { timeout: 30_000 })
    .then(() => true).catch(() => false)
  return ok
}

/**
 * Busca procesos en el buscador público de SECOP II.
 * Devuelve las filas de la primera página (las más recientes, orden desc por fecha).
 */
export async function searchSecopProcesses(params: RadarSearchParams): Promise<RadarSearchRow[]> {
  const { region, status = ESTADO.PUBLICADO, publishedFrom } = params
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    locale: 'es-CO',
    extraHTTPHeaders: { 'Accept-Language': 'es-CO,es;q=0.9,en;q=0.5' },
  })
  await context.addCookies([
    { name: 'CurrentLanguage', value: 'es-CO', domain: 'community.secop.gov.co', path: '/' },
  ])
  const page = await context.newPage()
  page.setDefaultTimeout(45_000)

  try {
    for (let attempt = 1; attempt <= MAX_CAPTCHA_ATTEMPTS; attempt++) {
      await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 })

      const passed = await passCaptchaGate(page, '[RadarSearch]')
      if (!passed) {
        if (/\/ErrorPage\/|inactivity/i.test(page.url()) && attempt < MAX_CAPTCHA_ATTEMPTS) continue
        if (attempt < MAX_CAPTCHA_ATTEMPTS) continue
        throw new Error('No se pudo pasar el captcha del buscador')
      }

      // Asegurar que el form está presente
      await page.waitForSelector('#txtRegion', { timeout: 20_000 })

      // Llenar criterios
      await page.fill('#txtRegion', region)
      await page.waitForTimeout(1_000)
      await page.selectOption('#selRequestStatus', status).catch(() => {})
      if (publishedFrom) {
        await page.fill('#dtmbPublishDateFrom_txt', formatSecopDate(publishedFrom)).catch(() => {})
      }

      await page.click('#btnSearchButton')
      await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
      await page.waitForTimeout(2_500)

      const html = await page.content()
      const rows = parseSearchResults(html)
      console.log(`[RadarSearch] region="${region}" status=${status} → ${rows.length} filas`)
      return rows
    }
    return []
  } finally {
    await browser.close()
  }
}
