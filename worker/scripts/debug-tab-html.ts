/**
 * Debug script: saves the raw HTML of tab 2 (info_general) for one contract.
 * Run on the server:
 *   cd C:\licitrack\worker
 *   npx tsx scripts/debug-tab-html.ts
 *
 * Saves HTML to C:\licitrack\worker\debug-tab2.html
 */
import 'dotenv/config'
import { chromium } from 'playwright'
import { writeFileSync } from 'fs'
import { admin } from '../src/db.js'
import { getValidSession } from '../src/session.js'
import { SECOP, USER_AGENT } from '../src/config.js'

async function main() {
  // Get first monitored process
  const { data: proc } = await admin
    .from('secop_processes')
    .select('id, secop_process_id, url_publica, entity_name, account_id')
    .eq('monitoring_enabled', true)
    .limit(1)
    .single()

  if (!proc) {
    console.error('No monitored processes found')
    process.exit(1)
  }

  console.log(`Process: ${proc.secop_process_id}`)
  console.log(`URL: ${proc.url_publica}`)

  const session = await getValidSession(proc.account_id)
  if (!session) {
    console.error('No valid session — run login first')
    process.exit(1)
  }

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ userAgent: USER_AGENT })

  await context.addCookies(session.cookies.map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path || '/',
    httpOnly: true,
    secure: true,
    sameSite: 'None' as const,
  })))

  const page = await context.newPage()

  // Extract docUniqueIdentifier from URL
  const match = proc.url_publica?.match(/docUniqueIdentifier=([^&]+)/)
  if (!match) {
    console.error('No docUniqueIdentifier in URL:', proc.url_publica)
    await browser.close()
    process.exit(1)
  }

  // 1. Open contracts page first to load company selector
  console.log(`\nLoading contracts page to get company list...`)
  await page.goto(SECOP.contractsUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForTimeout(2_000)

  // 2. Switch to the correct company for this contract
  if (proc.entity_name) {
    const companies = await page.evaluate(() => {
      const sel = document.querySelector('#companiesSelector') as HTMLSelectElement | null
      if (!sel) return []
      return Array.from(sel.options).map(o => ({
        name: (o.getAttribute('title') || o.textContent || '').trim(),
        value: o.value,
      })).filter(c => c.name && c.value)
    })
    console.log(`Found ${companies.length} companies`)

    const target = proc.entity_name.toUpperCase()
    const company = companies.find(c =>
      c.name.toUpperCase() === target || c.name.toUpperCase().includes(target)
    )
    if (!company) {
      console.error(`❌ Company "${proc.entity_name}" not found`)
      await browser.close()
      process.exit(1)
    }
    console.log(`Switching to: ${company.name} (${company.value})`)

    const switchUrl = `${SECOP.switchCompanyUrl}?companyCode=${company.value}`
    await page.goto(switchUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    try {
      await page.waitForURL(url => {
        const u = url.toString()
        return !u.includes('ReloadSession') && !u.includes('SwitchCompany') && !u.includes('issue.aspx')
      }, { timeout: 20_000 })
    } catch { console.log('Redirect chain timeout — continuing') }
    await page.waitForTimeout(2_000)
    console.log(`After switch, URL: ${page.url()}`)
  }

  // 3. Now navigate to the contract detail
  const contractUrl = SECOP.contractDetailUrl(match[1])
  console.log(`\nOpening contract: ${contractUrl}`)

  await page.goto(contractUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForTimeout(5_000)

  // Where did we end up?
  console.log(`\nFinal URL: ${page.url()}`)
  console.log(`Page title: ${await page.title()}`)

  // Save initial page
  const initialHtml = await page.content()
  writeFileSync('debug-initial.html', initialHtml)
  console.log(`Saved debug-initial.html (${initialHtml.length} bytes)`)

  // Check redirects/login
  if (page.url().toLowerCase().includes('login')) {
    console.log('❌ Redirected to login — session expired')
    await browser.close()
    return
  }

  // Check what tabs exist (broader search)
  console.log('\n--- Looking for step divs ---')
  const stepInfo = await page.evaluate(() => {
    const result: Record<string, unknown> = {}
    result.hasStpmStepManager = !!document.querySelector('#stpmStepManager')
    result.allStepDivs = Array.from(document.querySelectorAll('[id^="stepDiv_"]')).map(e => e.id)
    result.allStpm = Array.from(document.querySelectorAll('[id^="stpm"]')).map(e => e.id).slice(0, 20)
    result.bodyClass = document.body.className
    result.h1Text = document.querySelector('h1')?.textContent?.trim().substring(0, 100)
    result.titleBars = Array.from(document.querySelectorAll('.titleBar, .pageTitle, .formTitle')).map(e => e.textContent?.trim().substring(0, 80))
    // Count all IDs
    result.totalIds = document.querySelectorAll('[id]').length
    return result
  })
  console.log(JSON.stringify(stepInfo, null, 2))

  // If no stepDiv, try iframes (SECOP often renders content inside iframes)
  console.log('\n--- Iframes ---')
  const frames = page.frames()
  console.log(`Total frames: ${frames.length}`)
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i]
    console.log(`  [${i}] URL: ${f.url().substring(0, 120)}`)
    try {
      const stepInFrame = await f.evaluate(() => {
        return {
          stepDivs: Array.from(document.querySelectorAll('[id^="stepDiv_"]')).map(e => e.id),
          hasStpm: !!document.querySelector('#stpmStepManager'),
        }
      })
      if (stepInFrame.stepDivs.length > 0 || stepInFrame.hasStpm) {
        console.log(`    ✓ Found step structure in frame [${i}]:`, stepInFrame)
      }
    } catch (e) {
      // cross-origin frame
    }
  }

  const cheerio = await import('cheerio')

  // Helper: extract relevant IDs from HTML
  const dumpRelevant = (html: string, label: string) => {
    const $ = cheerio.load(html)
    console.log(`\n=== ${label} ===`)
    const relevant: string[] = []
    $('[id]').each((_, el) => {
      const id = $(el).attr('id') || ''
      const low = id.toLowerCase()
      // Focus on things that look like data fields (short IDs, not container wrappers)
      if (id.length > 80) return
      if (
        low.includes('contract') ||
        low.includes('description') ||
        low.includes('supplier') ||
        low.includes('state') ||
        low.includes('value') ||
        low.includes('reference') ||
        low.includes('objet') ||
        low.includes('proveedor') ||
        low.includes('estado') ||
        low.includes('identif') ||
        low.includes('version') ||
        low.startsWith('spn') ||
        low.startsWith('txt') ||
        low.startsWith('txa') ||
        low.startsWith('lbl') ||
        low.startsWith('cbx')
      ) {
        const $el = $(el)
        const text = $el.clone().children().remove().end().text().trim().replace(/\s+/g, ' ').substring(0, 100)
        const val = $el.attr('value')?.substring(0, 100) || ''
        const tag = (el as { tagName?: string }).tagName || '?'
        const content = text || val
        if (content && content !== '[empty]') {
          relevant.push(`  <${tag}> #${id} = "${content}"`)
        }
      }
    })
    console.log(`Total with content: ${relevant.length}`)
    relevant.forEach(s => console.log(s))
  }

  // Click each tab and save HTML
  const tabs: { num: number; html: string }[] = []

  // First: grab initial page content
  tabs.push({ num: 0, html: initialHtml })

  // Click tabs 1, 2, 3, 9 (ones we care about most)
  for (const tabNum of [1, 2, 3, 9]) {
    const tabExists = await page.evaluate((n) => !!document.querySelector(`#stepDiv_${n}`), tabNum)
    if (!tabExists) continue
    try {
      const resp = page.waitForResponse(
        r => r.url().includes('StepManagerGoToStep'),
        { timeout: 15_000 }
      ).catch(() => null)
      await page.click(`#stepDiv_${tabNum}`)
      await resp
      await page.waitForTimeout(2_000)
      const html = await page.content()
      writeFileSync(`debug-tab${tabNum}.html`, html)
      console.log(`Saved debug-tab${tabNum}.html (${html.length} bytes)`)
      tabs.push({ num: tabNum, html })
    } catch (e) {
      console.log(`Error clicking tab ${tabNum}:`, e)
    }
  }

  // Dump relevant IDs from each saved tab
  for (const { num, html } of tabs) {
    dumpRelevant(html, num === 0 ? 'INITIAL PAGE (before any tab click)' : `TAB ${num}`)
  }


  await browser.close()
  console.log('\nDone')
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
