/**
 * Capture all 9 tabs of a SECOP contract detail page.
 *
 * SECOP uses a VORTAL "StepManager" wizard with 9 tabs (#stepDiv_1..#stepDiv_9).
 * Each tab click triggers postForm() which makes an AJAX call to StepManagerGoToStep,
 * replacing the #stphStepsPlaceHolder content.
 *
 * Usage:
 *   npx tsx src/capture-contract.ts                             # first account, no entity switch
 *   npx tsx src/capture-contract.ts <accountId>                 # specific account
 *   npx tsx src/capture-contract.ts <accountId> "AMAZONAS"      # specific entity
 *
 * Output: /tmp/secop-capture/tab-{1..9}-{name}.html + screenshots
 */

import { chromium } from 'playwright'
import { writeFileSync, mkdirSync, readdirSync, statSync } from 'fs'
import { admin } from './db.js'
import { getValidSession } from './session.js'
import { loginAccount } from './login.js'
import { SECOP } from './config.js'

// SECOP uses 10 stepDivs. stepDiv_1 = "Modificación pendiente" (notification, skip).
// Actual content tabs: stepDiv_2 through stepDiv_10.
const TABS = [
  { num: 2,  name: 'Información general',        slug: 'info-general' },
  { num: 3,  name: 'Condiciones',                slug: 'condiciones' },
  { num: 4,  name: 'Bienes y servicios',         slug: 'bienes-servicios' },
  { num: 5,  name: 'Documentos del Proveedor',   slug: 'docs-proveedor' },
  { num: 6,  name: 'Documentos del contrato',    slug: 'docs-contrato' },
  { num: 7,  name: 'Información presupuestal',   slug: 'presupuestal' },
  { num: 8,  name: 'Ejecución del Contrato',     slug: 'ejecucion' },
  { num: 9,  name: 'Modificaciones del Contrato', slug: 'modificaciones' },
  { num: 10, name: 'Incumplimientos',            slug: 'incumplimientos' },
]

const OUTPUT_DIR = '/tmp/secop-capture'

async function main() {
  const args = process.argv.slice(2)
  const accountIdArg = args[0]
  const entityNameArg = args[1]

  // 1. Find account
  let accountId: string
  let accountName: string

  if (accountIdArg) {
    const { data } = await admin
      .from('secop_accounts')
      .select('id, name')
      .eq('id', accountIdArg)
      .single()
    if (!data) { console.error('Account not found'); process.exit(1) }
    accountId = data.id
    accountName = data.name
  } else {
    const { data } = await admin
      .from('secop_accounts')
      .select('id, name')
      .eq('is_active', true)
      .limit(1)
      .single()
    if (!data) { console.error('No active accounts'); process.exit(1) }
    accountId = data.id
    accountName = data.name
  }

  console.log(`[Capture] Account: ${accountName} (${accountId})`)

  // 2. Ensure valid session
  let session = await getValidSession(accountId)
  if (!session) {
    console.log('[Capture] No valid session — logging in...')
    const ok = await loginAccount(accountId)
    if (!ok) { console.error('Login failed'); process.exit(1) }
    session = await getValidSession(accountId)
    if (!session) { console.error('Session still invalid after login'); process.exit(1) }
  }
  console.log('[Capture] Session active')

  // 3. Launch browser with cookies (visible for debugging)
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  })

  const playwrightCookies = session.cookies.map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path || '/',
    httpOnly: true,
    secure: true,
    sameSite: 'None' as const,
  }))
  await context.addCookies(playwrightCookies)

  const page = await context.newPage()

  try {
    // 4. Go to contracts page
    console.log('[Capture] Opening contracts page...')
    await page.goto(SECOP.contractsUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })

    if (page.url().includes('/Login') || page.url().includes('/login')) {
      console.error('[Capture] Redirected to login — session expired')
      process.exit(1)
    }

    // 5. Switch entity if specified
    if (entityNameArg) {
      const companies = await page.evaluate(`
        (function() {
          var sel = document.querySelector('#companiesSelector');
          if (!sel) return [];
          var result = [];
          for (var i = 0; i < sel.options.length; i++) {
            var o = sel.options[i];
            result.push({ name: (o.getAttribute('title') || o.textContent || '').trim(), value: o.value });
          }
          return result.filter(function(c) { return c.name && c.value; });
        })()
      `) as { name: string; value: string }[]

      const target = entityNameArg.toUpperCase()
      const company = companies.find(c => c.name.toUpperCase().includes(target))

      if (company) {
        console.log(`[Capture] Switching to: ${company.name}`)
        await page.selectOption('#companiesSelector', company.value)
        try {
          await page.waitForURL(
            url => !url.toString().includes('ReloadSession') && !url.toString().includes('SwitchCompany'),
            { timeout: 25_000 }
          )
        } catch {
          console.log('[Capture] ReloadSession timeout — navigating directly')
        }
        if (!page.url().includes('SalesContractManagement')) {
          await page.goto(SECOP.contractsUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 })
        }
        console.log(`[Capture] Switched to ${company.name}`)
      } else {
        console.warn(`[Capture] Entity "${entityNameArg}" not found in selector`)
      }
    }

    // 6. Click "Todos" tab to load all contracts
    const allTab = page.locator('a:has-text("Todos"), #lnkLinkTopAll')
    if (await allTab.count() > 0) {
      const resp = page.waitForResponse(
        (r: { url: () => string }) => r.url().includes('/Folder'),
        { timeout: 10_000 }
      ).catch(() => null)
      await allTab.first().click()
      await resp
      await page.waitForTimeout(1_500)
    }

    // 7. Find a contract detail link (href contains docUniqueIdentifier)
    const detailLink = await page.evaluate(`
      (function() {
        var link = document.querySelector('a[href*="docUniqueIdentifier"]');
        if (!link) return null;
        var row = link.closest('tr');
        return {
          href: link.href,
          text: row ? row.textContent.trim().substring(0, 120) : 'unknown'
        };
      })()
    `) as { href: string; text: string } | null

    if (!detailLink) {
      console.error('[Capture] No contract detail links found')
      mkdirSync(OUTPUT_DIR, { recursive: true })
      writeFileSync(`${OUTPUT_DIR}/debug-contracts-page.html`, await page.content())
      console.log(`[Capture] Saved debug page to ${OUTPUT_DIR}/debug-contracts-page.html`)
      process.exit(1)
    }

    console.log(`[Capture] Contract: ${detailLink.text.slice(0, 80)}...`)
    console.log(`[Capture] URL: ${detailLink.href.slice(0, 120)}`)

    // 8. Open contract detail page
    console.log('[Capture] Opening contract detail...')
    await page.goto(detailLink.href, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForTimeout(3_000)

    console.log(`[Capture] Contract page loaded: ${page.url().slice(0, 120)}`)

    // Create output dir
    mkdirSync(OUTPUT_DIR, { recursive: true })

    // 9. Verify we have the StepManager wizard
    const hasStepManager = await page.evaluate(`!!document.querySelector('#stpmStepManager')`) as boolean
    if (!hasStepManager) {
      console.error('[Capture] No StepManager wizard found — page structure different than expected')
      writeFileSync(`${OUTPUT_DIR}/error-no-wizard.html`, await page.content())
      await page.screenshot({ path: `${OUTPUT_DIR}/error-no-wizard.png`, fullPage: true })
      process.exit(1)
    }

    console.log('[Capture] StepManager wizard found — capturing 9 tabs\n')

    // 10. Click each tab (#stepDiv_1..#stepDiv_9) and capture
    for (const tab of TABS) {
      const selector = `#stepDiv_${tab.num}`
      console.log(`[Capture] Tab ${tab.num}: ${tab.name}`)

      // Check tab exists
      const tabExists = await page.evaluate(
        `!!document.querySelector('${selector}')`,
      ) as boolean

      if (!tabExists) {
        console.log(`  SKIP — ${selector} not found`)
        continue
      }

      // Click the tab div — this triggers postForm() AJAX call
      // Listen for the StepManagerGoToStep response
      const responsePromise = page.waitForResponse(
        (r: { url: () => string }) => r.url().includes('StepManagerGoToStep'),
        { timeout: 15_000 }
      ).catch(() => null)

      await page.click(selector)
      const response = await responsePromise

      if (response) {
        console.log(`  AJAX response: ${(response as any).status?.() || 'ok'}`)
      } else {
        console.log(`  No AJAX response (may already be loaded)`)
      }

      // Wait for content to render
      await page.waitForTimeout(2_000)

      // Save HTML
      const html = await page.content()
      const filename = `tab-${tab.num}-${tab.slug}.html`
      writeFileSync(`${OUTPUT_DIR}/${filename}`, html)
      console.log(`  Saved: ${filename} (${(html.length / 1024).toFixed(1)} KB)`)

      // Save screenshot for visual reference
      await page.screenshot({
        path: `${OUTPUT_DIR}/tab-${tab.num}-${tab.slug}.png`,
        fullPage: true,
      })
      console.log(`  Screenshot: tab-${tab.num}-${tab.slug}.png`)
    }

    // 11. Summary
    console.log(`\n${'═'.repeat(50)}`)
    console.log(`[Capture] DONE! Files in: ${OUTPUT_DIR}/`)
    console.log(`${'═'.repeat(50)}`)

    const files = readdirSync(OUTPUT_DIR).sort()
    for (const f of files) {
      const size = statSync(`${OUTPUT_DIR}/${f}`).size
      console.log(`  ${f} (${(size / 1024).toFixed(1)} KB)`)
    }

  } catch (err) {
    console.error('[Capture] Fatal error:', err instanceof Error ? err.message : err)
    try {
      mkdirSync(OUTPUT_DIR, { recursive: true })
      writeFileSync(`${OUTPUT_DIR}/error-page.html`, await page.content())
      await page.screenshot({ path: `${OUTPUT_DIR}/error-screenshot.png`, fullPage: true })
      console.log(`[Capture] Error state saved to ${OUTPUT_DIR}/`)
    } catch {}
  } finally {
    await browser.close()
  }
}

main().catch(err => {
  console.error('[Capture] Fatal:', err)
  process.exit(1)
})
