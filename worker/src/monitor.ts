import { chromium, type Page, type BrowserContext } from 'playwright'
import { admin } from './db.js'
import { config, SECOP, USER_AGENT } from './config.js'
import { getValidSession, invalidateSession, type CookieEntry } from './session.js'
import { loginAccount } from './login.js'
import {
  parseInfoGeneral,
  parseCondiciones,
  parseBienesServicios,
  parseDocsProveedor,
  parseDocsContrato,
  parsePresupuestal,
  parseEjecucion,
  parseModificaciones,
  parseIncumplimientos,
} from './parsers/contract-detail.js'
import {
  hashSnapshot,
  diffSnapshots,
  findNextDeadline,
  type ProcessSnapshot,
} from './diff.js'

type MonitoredProcess = {
  id: string
  secop_process_id: string
  url_publica: string | null
  account_id: string | null
  entity_name: string | null
}

// SECOP uses 10 stepDivs: stepDiv_1 is "Modificación pendiente" (skip),
// actual content tabs are stepDiv_2 through stepDiv_10.
const TABS = [
  { num: 2,  slug: 'info-general',     parser: 'info_general' },
  { num: 3,  slug: 'condiciones',       parser: 'condiciones' },
  { num: 4,  slug: 'bienes-servicios',  parser: 'bienes_servicios' },
  { num: 5,  slug: 'docs-proveedor',    parser: 'docs_proveedor' },
  { num: 6,  slug: 'docs-contrato',     parser: 'docs_contrato' },
  { num: 7,  slug: 'presupuestal',      parser: 'presupuestal' },
  { num: 8,  slug: 'ejecucion',         parser: 'ejecucion' },
  { num: 9,  slug: 'modificaciones',    parser: 'modificaciones' },
  { num: 10, slug: 'incumplimientos',   parser: 'incumplimientos' },
] as const

/**
 * Run full monitoring cycle for all monitored processes.
 *
 * Architecture:
 * 1. Group processes by account_id + entity_name
 * 2. For each account: launch ONE browser, load cookies
 * 3. For each entity within that account: switch company once
 * 4. For each process in that entity: navigate to contract detail, click tabs 2-10, parse
 * 5. Snapshot → diff → save changes
 */
export async function runMonitorCycle(): Promise<{
  checked: number
  changes: number
}> {
  const { data: logEntry } = await admin
    .from('secop_monitor_log')
    .insert({ status: 'running' })
    .select('id')
    .single()

  const logId = logEntry?.id
  let totalChecked = 0
  let totalChanges = 0

  try {
    const { data: processes } = await admin
      .from('secop_processes')
      .select('id, secop_process_id, url_publica, account_id, entity_name')
      .eq('monitoring_enabled', true)

    if (!processes?.length) {
      console.log('[Monitor] No monitored processes found')
      await finishLog(logId, 'success', 0, 0)
      return { checked: 0, changes: 0 }
    }

    console.log(`[Monitor] ${processes.length} processes to check`)

    // Group by account_id → entity_name
    const grouped = groupByAccountAndEntity(processes)

    for (const [accountId, entityMap] of grouped) {
      let session = await getValidSession(accountId)

      if (!session) {
        console.log(`[Monitor] Session expired for account ${accountId}, logging in...`)
        const ok = await loginAccount(accountId)
        if (!ok) {
          const entityCount = [...entityMap.values()].reduce((sum, p) => sum + p.length, 0)
          console.error(`[Monitor] Login failed for ${accountId}, skipping ${entityCount} processes`)
          continue
        }
        session = await getValidSession(accountId)
        if (!session) continue
      }

      // Launch ONE browser per account
      const browser = await chromium.launch({ headless: true })
      const context = await browser.newContext({
        userAgent: USER_AGENT,
      })

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

      try {
        for (const [entityName, procs] of entityMap) {
          console.log(`[Monitor] Account ${accountId} / Entity: ${entityName || '(default)'}`)

          // Switch company if needed
          const switched = await switchToEntity(page, entityName)
          if (!switched) {
            console.error(`[Monitor] Failed to switch to entity "${entityName}", skipping ${procs.length} processes`)
            continue
          }

          for (const proc of procs) {
            try {
              const result = await monitorProcess(page, proc)
              totalChecked++
              totalChanges += result.changesFound
            } catch (err) {
              console.error(`[Monitor] Error on ${proc.secop_process_id}:`, err instanceof Error ? err.message : err)
            }

            await new Promise(r => setTimeout(r, config.delayBetweenRequestsMs))
          }
        }
      } catch (err) {
        console.error(`[Monitor] Fatal for account ${accountId}:`, err instanceof Error ? err.message : err)

        // Check if session expired
        if (page.url().includes('/Login') || page.url().includes('/login')) {
          await invalidateSession(accountId)
        }
      } finally {
        await browser.close()
      }
    }

    await finishLog(logId, 'success', totalChecked, totalChanges)
    console.log(`[Monitor] Done: ${totalChecked} checked, ${totalChanges} changes`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[Monitor] Fatal error:', msg)
    await finishLog(logId, 'error', totalChecked, totalChanges, msg)
  }

  return { checked: totalChecked, changes: totalChanges }
}

/**
 * Group processes by account_id → entity_name for efficient browser reuse.
 */
function groupByAccountAndEntity(
  processes: MonitoredProcess[],
): Map<string, Map<string | null, MonitoredProcess[]>> {
  const grouped = new Map<string, Map<string | null, MonitoredProcess[]>>()

  for (const proc of processes) {
    if (!proc.account_id) continue // Skip processes without an account

    if (!grouped.has(proc.account_id)) {
      grouped.set(proc.account_id, new Map())
    }
    const entityMap = grouped.get(proc.account_id)!
    if (!entityMap.has(proc.entity_name)) {
      entityMap.set(proc.entity_name, [])
    }
    entityMap.get(proc.entity_name)!.push(proc)
  }

  return grouped
}

/**
 * Switch to a specific company using the #companiesSelector dropdown.
 * If entityName is null, no switch needed (use default company).
 */
async function switchToEntity(page: Page, entityName: string | null): Promise<boolean> {
  // Navigate to contracts page to get the company selector
  await page.goto(SECOP.contractsUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })

  if (page.url().includes('/Login') || page.url().includes('/login')) {
    console.error('[Monitor] Redirected to login — session expired')
    return false
  }

  if (!entityName) return true // No switch needed

  // Read companies from selector
  const companies = await page.evaluate(() => {
    const sel = document.querySelector('#companiesSelector') as HTMLSelectElement | null
    if (!sel) return []
    return Array.from(sel.options).map(o => ({
      name: (o.getAttribute('title') || o.textContent || '').trim(),
      value: o.value,
    })).filter(c => c.name && c.value)
  })

  const target = entityName.toUpperCase()
  const company = companies.find(c =>
    c.name.toUpperCase() === target || c.name.toUpperCase().includes(target)
  )

  if (!company) {
    console.warn(`[Monitor] Entity "${entityName}" not found in selector`)
    return false
  }

  // Check if already on correct company
  const currentCompany = await page.evaluate(() => {
    const sel = document.querySelector('#companiesSelector') as HTMLSelectElement | null
    if (!sel) return null
    const opt = sel.options[sel.selectedIndex]
    return opt ? (opt.getAttribute('title') || opt.textContent || '').trim() : null
  })

  if (currentCompany?.toUpperCase().includes(target)) {
    return true // Already on correct company
  }

  console.log(`[Monitor] Switching to: ${company.name}`)
  await page.selectOption('#companiesSelector', company.value)

  try {
    await page.waitForURL(
      url => !url.toString().includes('ReloadSession') && !url.toString().includes('SwitchCompany'),
      { timeout: 25_000 },
    )
  } catch {
    console.log('[Monitor] ReloadSession timeout — navigating directly')
  }

  if (!page.url().includes('SalesContractManagement')) {
    await page.goto(SECOP.contractsUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 })
  }

  return true
}

/**
 * Monitor a single process: navigate to contract detail, click all 9 tabs, parse, diff.
 */
async function monitorProcess(
  page: Page,
  proc: MonitoredProcess,
): Promise<{ changesFound: number }> {
  // Extract docUniqueIdentifier from the stored URL
  const docId = extractDocUniqueId(proc.url_publica)
  if (!docId) {
    console.warn(`[Monitor] No docUniqueIdentifier for ${proc.secop_process_id} (url: ${proc.url_publica})`)
    return { changesFound: 0 }
  }

  const contractUrl = SECOP.contractDetailUrl(docId)
  console.log(`[Monitor] ${proc.secop_process_id}: opening detail...`)

  await page.goto(contractUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForTimeout(2_000)

  // Verify we're on the contract detail page with StepManager
  const hasStepManager = await page.evaluate(() => !!document.querySelector('#stpmStepManager'))
  if (!hasStepManager) {
    console.warn(`[Monitor] No StepManager found for ${proc.secop_process_id} — page may have changed`)
    return { changesFound: 0 }
  }

  // Collect HTML from all 9 tabs
  const tabHtmls: Map<string, string> = new Map()

  for (const tab of TABS) {
    const selector = `#stepDiv_${tab.num}`
    const tabExists = await page.evaluate((sel) => !!document.querySelector(sel), selector)

    if (!tabExists) {
      console.log(`[Monitor]   Tab ${tab.num} not found, skipping`)
      continue
    }

    // Click tab and wait for AJAX response
    const responsePromise = page.waitForResponse(
      r => r.url().includes('StepManagerGoToStep'),
      { timeout: 15_000 },
    ).catch(() => null)

    await page.click(selector)
    await responsePromise
    await page.waitForTimeout(1_500)

    tabHtmls.set(tab.parser, await page.content())
  }

  // Parse all tabs
  const snapshot: ProcessSnapshot = {
    info_general: tabHtmls.has('info_general')
      ? parseInfoGeneral(tabHtmls.get('info_general')!)
      : emptyInfoGeneral(),
    condiciones: tabHtmls.has('condiciones')
      ? parseCondiciones(tabHtmls.get('condiciones')!)
      : { renovable: null, fecha_renovacion: null, metodo_pago: null, plazo_pago: null, opciones_entrega: null },
    bienes_servicios: tabHtmls.has('bienes_servicios')
      ? parseBienesServicios(tabHtmls.get('bienes_servicios')!)
      : { item_count: 0 },
    docs_proveedor: tabHtmls.has('docs_proveedor')
      ? parseDocsProveedor(tabHtmls.get('docs_proveedor')!)
      : { document_names: [] },
    docs_contrato: tabHtmls.has('docs_contrato')
      ? parseDocsContrato(tabHtmls.get('docs_contrato')!)
      : { documents: [] },
    presupuestal: tabHtmls.has('presupuestal')
      ? parsePresupuestal(tabHtmls.get('presupuestal')!)
      : { cdp_balance: null, vigencia_futura_balance: null, budget_origin_total: null },
    ejecucion: tabHtmls.has('ejecucion')
      ? parseEjecucion(tabHtmls.get('ejecucion')!)
      : { pagos: [], execution_docs: [] },
    modificaciones: tabHtmls.has('modificaciones')
      ? parseModificaciones(tabHtmls.get('modificaciones')!)
      : { entries: [] },
    incumplimientos: tabHtmls.has('incumplimientos')
      ? parseIncumplimientos(tabHtmls.get('incumplimientos')!)
      : { entries: [] },
    scraped_at: new Date().toISOString(),
  }

  const snapshotHash = hashSnapshot(snapshot)

  // Get latest snapshot for comparison
  const { data: latestSnapshot } = await admin
    .from('secop_process_snapshots')
    .select('snapshot_json, hash')
    .eq('process_id', proc.id)
    .eq('source_type', 'page_scrape')
    .order('captured_at', { ascending: false })
    .limit(1)
    .single()

  // If hash matches, no changes
  if (latestSnapshot?.hash === snapshotHash) {
    await admin.from('secop_processes')
      .update({ last_monitored_at: new Date().toISOString() })
      .eq('id', proc.id)
    return { changesFound: 0 }
  }

  // Save new snapshot
  await admin.from('secop_process_snapshots').insert({
    process_id: proc.id,
    snapshot_json: snapshot,
    source_type: 'page_scrape',
    hash: snapshotHash,
  })

  // Diff
  const previousSnapshot = latestSnapshot?.snapshot_json as ProcessSnapshot | null
  const changes = diffSnapshots(previousSnapshot, snapshot)

  // Save changes
  if (changes.length > 0) {
    const changeRows = changes.map(c => ({
      process_id: proc.id,
      change_type: c.change_type,
      priority: c.priority,
      before_json: c.before_json,
      after_json: c.after_json,
      summary: c.summary,
    }))
    const { error: insertError } = await admin.from('secop_process_changes').insert(changeRows)
    if (insertError) console.error(`[Monitor] Failed to save changes for ${proc.secop_process_id}:`, insertError.message)
  }

  // Update process with monitoring data
  const { deadline, label } = findNextDeadline(snapshot)
  await admin.from('secop_processes').update({
    last_monitored_at: new Date().toISOString(),
    next_deadline: deadline,
    next_deadline_label: label,
    // Also update estado from latest scrape
    estado: snapshot.info_general.estado,
  }).eq('id', proc.id)

  if (changes.length > 0) {
    console.log(`[Monitor] ${proc.secop_process_id}: ${changes.length} change(s) detected`)
    for (const c of changes) {
      console.log(`[Monitor]   [${c.priority}] ${c.summary}`)
    }
  } else {
    console.log(`[Monitor] ${proc.secop_process_id}: first snapshot saved`)
  }

  return { changesFound: changes.length }
}

/**
 * Extract docUniqueIdentifier from a SECOP contract detail URL.
 *
 * Input: "https://www.secop.gov.co/CO1ContractsManagement/Tendering/SalesContractEdit/View?docUniqueIdentifier=CO1.SLCNTR.12345"
 * Output: "CO1.SLCNTR.12345"
 */
function extractDocUniqueId(url: string | null): string | null {
  if (!url) return null
  const match = url.match(/docUniqueIdentifier=([A-Z0-9.]+)/i)
  return match ? match[1] : null
}

function emptyInfoGeneral(): ProcessSnapshot['info_general'] {
  return {
    estado: null, referencia: null, descripcion: null, unique_id: null,
    version: null, valor: null, fecha_inicio: null, fecha_fin: null,
    fecha_liquidacion_inicio: null, fecha_liquidacion_fin: null,
    proveedor: null, aprobacion_comprador: null, aprobacion_proveedor: null,
  }
}

async function finishLog(
  logId: string | undefined,
  status: 'success' | 'error',
  checked: number,
  changes: number,
  errorMessage?: string,
) {
  if (!logId) return
  await admin.from('secop_monitor_log').update({
    finished_at: new Date().toISOString(),
    status,
    processes_checked: checked,
    changes_found: changes,
    error_message: errorMessage || null,
  }).eq('id', logId)
}
