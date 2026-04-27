/**
 * Diagnóstico: ver qué tiene actualmente la página de login de SECOP.
 *
 * Abre con Playwright (browser real, evita bot detection del cliente) la URL
 * configurada como loginUrl, sigue redirects automáticos, y reporta:
 *   - URL final tras redirects
 *   - Cadena de redirects (cada navegación)
 *   - Todos los <input> visibles con id, name, type
 *   - Todos los <form> con action y method
 *   - Si hay reCAPTCHA, reporta el sitekey y el data-callback
 *   - Guarda HTML completo + screenshot en worker/debug-html/login-diagnose-*
 *
 * Uso:
 *   cd worker
 *   npx tsx scripts/diagnose-login.ts
 *
 * No usa CapSolver: solo carga la página y reporta su estructura.
 */
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { chromium, type Page } from 'playwright'
import { SECOP, USER_AGENT } from '../src/config.js'

async function main() {
  console.log(`\n═══ Login Diagnose ═══`)
  console.log(`Target URL (config): ${SECOP.loginUrl}\n`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    locale: 'es-CO',
  })
  const page = await context.newPage()

  // Track every navigation/redirect
  const navigations: { ts: number; url: string }[] = []
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      navigations.push({ ts: Date.now(), url: frame.url() })
    }
  })

  try {
    console.log(`Navegando a la loginUrl...`)
    await page.goto(SECOP.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    // Pequeña espera por si hay JS que mete inputs después del DOM ready
    await page.waitForTimeout(3_000)

    const finalUrl = page.url()
    console.log(`\n── Cadena de redirects ──`)
    for (const n of navigations) {
      console.log(`  → ${n.url}`)
    }
    console.log(`\nURL final: ${finalUrl}`)

    // Dump inputs
    const inputs = await page.evaluate(`
      Array.from(document.querySelectorAll('input')).map(el => ({
        id: el.id || null,
        name: el.getAttribute('name') || null,
        type: el.type || null,
        placeholder: el.placeholder || null,
        visible: el.offsetParent !== null,
      }))
    `) as Array<{ id: string | null; name: string | null; type: string | null; placeholder: string | null; visible: boolean }>

    console.log(`\n── Inputs encontrados (${inputs.length}) ──`)
    for (const inp of inputs) {
      console.log(`  [${inp.visible ? 'visible' : 'hidden'}]  type=${inp.type}  id=${inp.id}  name=${inp.name}  placeholder="${inp.placeholder || ''}"`)
    }

    // Dump forms
    const forms = await page.evaluate(`
      Array.from(document.querySelectorAll('form')).map(el => ({
        id: el.id || null,
        action: el.getAttribute('action') || null,
        method: el.getAttribute('method') || 'GET',
      }))
    `) as Array<{ id: string | null; action: string | null; method: string }>

    console.log(`\n── Forms encontrados (${forms.length}) ──`)
    for (const f of forms) {
      console.log(`  ${f.method.toUpperCase()}  ${f.action || '(no action)'}  id=${f.id}`)
    }

    // reCAPTCHA detection
    const captcha = await page.evaluate(`
      (() => {
        var el = document.querySelector('.g-recaptcha, [data-sitekey]');
        if (!el) return null;
        return {
          sitekey: el.getAttribute('data-sitekey'),
          callback: el.getAttribute('data-callback'),
          theme: el.getAttribute('data-theme'),
        };
      })()
    `) as { sitekey: string; callback: string | null; theme: string | null } | null

    console.log(`\n── reCAPTCHA ──`)
    if (captcha) {
      console.log(`  sitekey: ${captcha.sitekey}`)
      console.log(`  data-callback: ${captcha.callback || '(none)'}`)
      console.log(`  theme: ${captcha.theme || '(default)'}`)
    } else {
      console.log(`  (no reCAPTCHA detectado en esta página)`)
    }

    // Page title + a snippet of body text
    const title = await page.title()
    const bodySnippet = await page.evaluate(`
      (document.body.innerText || '').slice(0, 400).replace(/\\s+/g, ' ').trim()
    `) as string
    console.log(`\n── Página ──`)
    console.log(`  title: "${title}"`)
    console.log(`  body (primeros 400 chars): "${bodySnippet}"`)

    // Save HTML + screenshot
    const debugDir = join(process.cwd(), 'debug-html')
    await mkdir(debugDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const htmlPath = join(debugDir, `login-diagnose-${stamp}.html`)
    const pngPath = join(debugDir, `login-diagnose-${stamp}.png`)

    await writeFile(htmlPath, await page.content(), 'utf-8')
    await page.screenshot({ path: pngPath, fullPage: true })

    console.log(`\n── Artifacts guardados ──`)
    console.log(`  HTML:       ${htmlPath}`)
    console.log(`  Screenshot: ${pngPath}`)
  } catch (err) {
    console.error(`\n[ERROR]`, err instanceof Error ? err.message : err)
  } finally {
    await browser.close()
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
