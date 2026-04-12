import { admin } from './db.js'
import { config, SECOP, USER_AGENT } from './config.js'
import { getValidSession, invalidateSession, type CookieEntry } from './session.js'
import { parseDashboard, type DiscoveredProcess } from './parsers/dashboard.js'
import { chromium } from 'playwright'

/**
 * Discover contracts visible on the SECOP "Administración de contratos" page for one account.
 *
 * Uses Playwright to switch companies because SECOP's WS-Federation flow requires a real browser
 * context for the company switch to propagate across modules (CO1Marketplace ↔ CO1ContractsManagement).
 *
 * @param accountId  - The account to discover for
 * @param entityName - Company name to switch to (optional)
 */
export async function discoverProcesses(accountId: string, entityName?: string): Promise<number> {
  const session = await getValidSession(accountId)
  if (!session) {
    console.error(`[Discovery] No valid session for account ${accountId}`)
    return 0
  }

  const label = entityName ? `${accountId}/${entityName}` : accountId

  // Launch headless browser with the saved session cookies
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: USER_AGENT,
  })

  // Load saved cookies into browser context
  const playwrightCookies = session.cookies.map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain.startsWith('.') ? c.domain : c.domain,
    path: c.path || '/',
    httpOnly: true,
    secure: true,
    sameSite: 'None' as const,
  }))
  await context.addCookies(playwrightCookies)

  const page = await context.newPage()

  try {
    // Step 1: Navigate to contracts page
    console.log(`[Discovery] ${label}: opening contracts page...`)
    await page.goto(SECOP.contractsUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })

    // Check if redirected to login
    if (page.url().includes('/Login') || page.url().includes('/login')) {
      console.error(`[Discovery] Redirected to login for ${label} — session expired`)
      await browser.close()
      await invalidateSession(accountId)
      return -1
    }

    // Update discovered_entities from the company selector
    const companies = await page.evaluate(() => {
      const sel = document.querySelector('#companiesSelector') as HTMLSelectElement | null
      if (!sel) return []
      return Array.from(sel.options).map(o => ({
        name: (o.getAttribute('title') || o.textContent || '').trim(),
        value: o.value,
      })).filter(c => c.name && c.value)
    })

    if (companies.length > 0) {
      await admin.from('secop_accounts').update({ discovered_entities: companies }).eq('id', accountId)
      console.log(`[Discovery] ${label}: ${companies.length} companies in selector`)
    }

    // Step 2: Switch company if specified
    if (entityName && companies.length > 0) {
      const company = companies.find(c =>
        c.name.toUpperCase() === entityName.toUpperCase() ||
        c.name.toUpperCase().includes(entityName.toUpperCase())
      )

      if (company) {
        console.log(`[Discovery] Switching to: ${company.name} (${company.value})`)

        // Use Playwright's selectOption which properly triggers jQuery/VORTAL event handlers
        await page.selectOption('#companiesSelector', company.value)

        // Wait for navigation to complete (SwitchCompany → ReloadSession → back)
        // ReloadSession.aspx loads 2 invisible images to refresh each SECOP module's session,
        // then after 5s redirects to CO1Marketplace. Total wait: ~10-15s.
        // Wait for final redirect to complete.
        try {
          await page.waitForURL(
            url => !url.toString().includes('ReloadSession') && !url.toString().includes('SwitchCompany'),
            { timeout: 25_000 }
          )
        } catch {
          // If still on ReloadSession after timeout, navigate to contracts directly
          // (the session images already loaded, so the session IS updated)
          console.log(`[Discovery] ReloadSession timeout — navigating to contracts directly`)
        }

        // Ensure we're on the contracts page (not Marketplace)
        if (!page.url().includes('SalesContractManagement')) {
          await page.goto(SECOP.contractsUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 })
        }

        console.log(`[Discovery] Company switched to ${company.name}, page: ${page.url().slice(0, 80)}`)
      } else {
        console.warn(`[Discovery] Company "${entityName}" not found in selector`)
      }
    }

    // Step 3: Load ALL contracts — click "Todos" tab then "Ver más" until exhausted
    // SECOP shows 5 contracts per page. "Ver más" loads more via AJAX (postAction).

    // Click "Todos" (All) folder tab
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

    // Click "Ver más" repeatedly to load all pages
    let verMasClicks = 0
    for (let i = 0; i < 20; i++) {
      const btn = page.locator('[id*="MoreItems"]:visible')
      if (await btn.count() === 0) break
      try {
        const resp = page.waitForResponse(
          (r: { url: () => string }) => r.url().includes('GoToPage'),
          { timeout: 10_000 }
        ).catch(() => null)
        await btn.first().click()
        await resp
        await page.waitForTimeout(1_000)
        verMasClicks++
      } catch { break }
    }

    if (verMasClicks > 0) console.log(`[Discovery] ${label}: clicked "Ver más" ${verMasClicks} times`)

    // Grab full page HTML with all loaded contracts
    const contractsHtml = await page.content()
    console.log(`[Discovery] ${label}: page with all contracts (${contractsHtml.length} bytes)`)

    // DEBUG: save HTML
    if (process.env.DEBUG_HTML) {
      const { writeFileSync } = await import('fs')
      const slug = (entityName || accountId).replace(/[^a-z0-9]/gi, '_').slice(0, 40)
      writeFileSync(`/tmp/secop-contracts-${slug}.html`, contractsHtml)
    }

    // Step 4: Parse contracts
    const discovered = parseDashboard(contractsHtml)
    console.log(`[Discovery] ${label}: ${discovered.length} contracts found`)

    if (discovered.length === 0) {
      console.warn(`[Discovery] No contracts parsed — HTML structure may have changed`)
    }

    // Upsert into secop_processes
    let newCount = 0
    for (const proc of discovered) {
      await upsertContract(proc, accountId, entityName)
        .then(isNew => { if (isNew) newCount++ })
        .catch(err => console.error(`[Discovery] Upsert error for ${proc.secop_process_id}:`, err.message))

      await new Promise(r => setTimeout(r, 100))
    }

    // Update account stats
    await admin
      .from('secop_accounts')
      .update({
        last_sync_at: new Date().toISOString(),
        process_count: discovered.length,
      })
      .eq('id', accountId)

    console.log(`[Discovery] ${label}: ${newCount} new, ${discovered.length - newCount} updated`)
    return newCount
  } catch (err) {
    console.error(`[Discovery] Error for ${label}:`, err instanceof Error ? err.message : err)
    return 0
  } finally {
    await browser.close()
  }
}

async function upsertContract(proc: DiscoveredProcess, accountId: string, entityName?: string): Promise<boolean> {
  const { data: existing } = await admin
    .from('secop_processes')
    .select('id')
    .eq('secop_process_id', proc.secop_process_id)
    .maybeSingle()

  if (existing) {
    // Update mutable fields — do NOT change monitoring_enabled (preserves user's choice)
    const { error: updateError } = await admin
      .from('secop_processes')
      .update({
        account_id: accountId,
        entity_name: entityName || null,
        estado: proc.estado,
        ...(proc.end_date ? { next_deadline: proc.end_date, next_deadline_label: 'Finalización del contrato' } : {}),
        ...(proc.valor ? { valor_estimado: proc.valor } : {}),
        ...(proc.url ? { url_publica: proc.url } : {}),
      })
      .eq('id', existing.id)
    if (updateError) console.error(`[Upsert] Update failed for ${proc.secop_process_id}:`, updateError.message)
    return false
  }

  // New contract — always starts with monitoring_enabled=false so user can review and select
  const { error } = await admin.from('secop_processes').insert({
    secop_process_id: proc.secop_process_id,
    referencia_proceso: proc.referencia,
    entidad: proc.entidad || 'Desconocida',
    objeto: proc.objeto || proc.referencia || proc.secop_process_id,
    estado: proc.estado,
    dataset_hash: '',
    source: 'account',
    account_id: accountId,
    entity_name: entityName || null,
    radar_state: 'followed',
    monitoring_enabled: false,
    url_publica: proc.url,
    ...(proc.end_date ? { next_deadline: proc.end_date, next_deadline_label: 'Finalización del contrato' } : {}),
    ...(proc.valor ? { valor_estimado: proc.valor } : {}),
  })

  if (error) throw new Error(error.message)
  return true
}