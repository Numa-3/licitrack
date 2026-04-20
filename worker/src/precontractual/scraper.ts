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

export type OpportunityScrapeResult = {
  notice_uid: string
  scraped_at: string
  cronograma: CronogramaEvento[]
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
    const cronograma = await extractCronograma(page)

    console.log(`[OpportunityScraper] ${noticeUid}: ${cronograma.length} eventos del cronograma extraídos`)

    return {
      notice_uid: noticeUid,
      scraped_at: new Date().toISOString(),
      cronograma,
      raw_html_size: html.length,
    }
  } finally {
    await browser.close()
  }
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
