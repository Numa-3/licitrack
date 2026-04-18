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

  const contractUrl = SECOP.contractDetailUrl(match[1])
  console.log(`Opening: ${contractUrl}`)

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

  // Skip tab 2 click for now — we need to know structure first
  console.log('\n(skipping tab 2 click — need to identify structure first)')

  // Click tab 2 (info general)
  const tab2Exists = await page.evaluate(() => !!document.querySelector('#stepDiv_2'))
  if (tab2Exists) {
    const resp = page.waitForResponse(
      r => r.url().includes('StepManagerGoToStep'),
      { timeout: 15_000 }
    ).catch(() => null)
    await page.click('#stepDiv_2')
    await resp
    await page.waitForTimeout(2_000)

    const tab2Html = await page.content()
    writeFileSync('debug-tab2.html', tab2Html)
    console.log(`Saved debug-tab2.html (${tab2Html.length} bytes)`)

    // Try to find the selectors we use
    const fields = await page.evaluate(() => {
      const get = (sel: string) => {
        const el = document.querySelector(sel)
        return el ? (el as HTMLElement).innerText?.substring(0, 100) || el.getAttribute('value') || '[empty]' : null
      }
      return {
        spnContractState: get('#spnContractState'),
        txtContractReference1Gen: get('#txtContractReference1Gen'),
        txaContractDescription1Gen: get('#txaContractDescription1Gen'),
        spnContractUniqueIdentifier: get('#spnContractUniqueIdentifier'),
        cbxContractValue1Gen: get('#cbxContractValue1Gen'),
        dtmbContractStartDate_txt: get('#dtmbContractStartDate_txt'),
        dtmbContractEndDate_txt: get('#dtmbContractEndDate_txt'),
        lblSupplierName: get('#lblSupplierName'),
      }
    })
    console.log('\nSelector results:')
    for (const [k, v] of Object.entries(fields)) {
      console.log(`  ${k}: ${v ?? '❌ NOT FOUND'}`)
    }

    // Find any input/span/textarea with contract-related IDs
    const allIds = await page.evaluate(() => {
      const elements = document.querySelectorAll('[id]')
      const ids: string[] = []
      elements.forEach(el => {
        const id = el.id
        if (id && (
          id.toLowerCase().includes('contract') ||
          id.toLowerCase().includes('description') ||
          id.toLowerCase().includes('supplier') ||
          id.toLowerCase().includes('state') ||
          id.toLowerCase().includes('date') ||
          id.toLowerCase().includes('value') ||
          id.toLowerCase().includes('reference')
        )) {
          const text = (el as HTMLElement).innerText?.substring(0, 80) || el.getAttribute('value')?.substring(0, 80) || ''
          ids.push(`${id} = "${text}"`)
        }
      })
      return ids
    })
    console.log(`\nAll contract-related IDs (${allIds.length}):`)
    allIds.forEach(id => console.log(`  ${id}`))
  } else {
    console.log('Tab 2 not found!')
  }

  await browser.close()
  console.log('\nDone')
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
