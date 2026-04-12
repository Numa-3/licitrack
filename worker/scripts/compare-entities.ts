import { admin } from './db.js'
import { getValidSession } from './session.js'
import { loginAccount } from './login.js'
import { SECOP } from './config.js'
import { chromium } from 'playwright'

/**
 * Compare contracts visible under each entity to determine
 * if they're the same or different.
 */
async function main() {
  // Get account
  const { data: acc } = await admin
    .from('secop_accounts')
    .select('id, name, monitored_entities')
    .eq('is_active', true)
    .limit(1)
    .single()

  if (!acc) { console.log('No active account'); return }
  const entities = (acc.monitored_entities as string[]) || []
  if (entities.length < 2) { console.log('Need at least 2 entities'); return }

  console.log(`Account: ${acc.name}`)
  console.log(`Entities: ${entities.join(', ')}\n`)

  // Get session
  let session = await getValidSession(acc.id)
  if (!session) {
    await loginAccount(acc.id)
    session = await getValidSession(acc.id)
  }
  if (!session) { console.log('Login failed'); return }

  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  })
  await context.addCookies(session.cookies.map(c => ({
    name: c.name, value: c.value, domain: c.domain,
    path: c.path || '/', httpOnly: true, secure: true, sameSite: 'None' as const,
  })))

  const page = await context.newPage()

  const contractsByEntity = new Map<string, string[]>()

  for (const entityName of entities) {
    console.log(`\n═══ ${entityName} ═══`)

    // Navigate to contracts page
    await page.goto(SECOP.contractsUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })

    // Switch company
    const companies = await page.evaluate(() => {
      const sel = document.querySelector('#companiesSelector') as HTMLSelectElement | null
      if (!sel) return []
      return Array.from(sel.options).map(o => ({
        name: (o.getAttribute('title') || o.textContent || '').trim(),
        value: o.value,
      })).filter(c => c.name && c.value)
    })

    const target = entityName.toUpperCase()
    const company = companies.find(c => c.name.toUpperCase().includes(target))
    if (!company) { console.log(`  Not found in selector`); continue }

    await page.selectOption('#companiesSelector', company.value)
    try {
      await page.waitForURL(url => !url.toString().includes('ReloadSession'), { timeout: 20_000 })
    } catch {}
    if (!page.url().includes('SalesContractManagement')) {
      await page.goto(SECOP.contractsUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 })
    }

    // Click "Todos"
    const allTab = page.locator('a:has-text("Todos"), #lnkLinkTopAll')
    if (await allTab.count() > 0) {
      await allTab.first().click()
      await page.waitForTimeout(2000)
    }

    // Extract contract IDs from the page
    const ids = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="docUniqueIdentifier"]')
      const results: string[] = []
      links.forEach(a => {
        const href = a.getAttribute('href') || ''
        const match = href.match(/docUniqueIdentifier=([A-Z0-9.]+)/i)
        if (match) results.push(match[1])
      })
      return results
    })

    console.log(`  Contracts found: ${ids.length}`)
    ids.forEach(id => console.log(`    ${id}`))
    contractsByEntity.set(entityName, ids)
  }

  await browser.close()

  // Compare
  const entityNames = [...contractsByEntity.keys()]
  if (entityNames.length >= 2) {
    const set1 = new Set(contractsByEntity.get(entityNames[0])!)
    const ids2 = contractsByEntity.get(entityNames[1])!
    const shared = ids2.filter(id => set1.has(id))
    const only1 = [...set1].filter(id => !ids2.includes(id))
    const only2 = ids2.filter(id => !set1.has(id))

    console.log(`\n═══ COMPARACION ═══`)
    console.log(`${entityNames[0]}: ${set1.size} contratos`)
    console.log(`${entityNames[1]}: ${ids2.length} contratos`)
    console.log(`Compartidos: ${shared.length}`)
    console.log(`Solo en ${entityNames[0]}: ${only1.length}`)
    console.log(`Solo en ${entityNames[1]}: ${only2.length}`)

    if (only1.length > 0) {
      console.log(`\nExclusivos de ${entityNames[0]}:`)
      only1.forEach(id => console.log(`  ${id}`))
    }
    if (only2.length > 0) {
      console.log(`\nExclusivos de ${entityNames[1]}:`)
      only2.forEach(id => console.log(`  ${id}`))
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
