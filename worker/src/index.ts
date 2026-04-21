import { existsSync } from 'fs'
import cron from 'node-cron'
import { admin } from './db.js'
import { config } from './config.js'
import { loginAccount } from './login.js'
import { getValidSession } from './session.js'
import { discoverProcesses } from './discovery.js'
import { runMonitorCycle } from './monitor.js'
import { runPrecontractualMonitorCycle, monitorOneNow } from './precontractual/monitor.js'

/**
 * Main entry point for the SECOP worker.
 *
 * Full cycle:
 * 1. Login each account ONCE (no per-entity re-login — company switching uses session cookies)
 * 2. Discover contracts for each monitored company (SwitchCompany + parse contracts page)
 * 3. Monitor all enabled processes
 *
 * Usage:
 *   npx tsx src/index.ts          # Run once
 *   npx tsx src/index.ts --loop   # Run continuously on cron schedule
 *
 * Loop mode schedules (Colombia TZ, UTC-5):
 *   • 5 full cycles/día via node-cron: 06:00, 12:00, 17:00, 22:00, 03:00
 *   • Polling cada 30s para sync requests + bootstrap de procesos nuevos
 *   • Un ciclo de arranque al iniciar el servicio
 */

const COLOMBIA_TZ = 'America/Bogota'
const CRON_SCHEDULES: { cron: string; label: string }[] = [
  { cron: '0 6 * * *',  label: '06:00 AM' },
  { cron: '0 12 * * *', label: '12:00 PM' },
  { cron: '0 17 * * *', label: '05:00 PM' },
  { cron: '0 22 * * *', label: '10:00 PM' },
  { cron: '0 3 * * *',  label: '03:00 AM' },
]

// Flag para evitar que un schedule pise un ciclo en curso
let cycleRunning = false

async function tryRunFullCycle(trigger: string): Promise<void> {
  if (cycleRunning) {
    console.log(`[Worker] ${trigger} skipped: cycle already running`)
    return
  }
  cycleRunning = true
  const start = Date.now()
  console.log(`\n╔══ ${trigger} ══════════════════════╗`)
  try {
    await runFullCycle()
  } catch (err) {
    console.error('[Worker] Cycle failed:', err instanceof Error ? err.message : err)
  } finally {
    cycleRunning = false
    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    console.log(`╚══ Cycle done in ${elapsed}s ══════╝\n`)
  }
}

async function main() {
  const loop = process.argv.includes('--loop')

  console.log('╔══════════════════════════════════════╗')
  console.log('║  LiciTrack SECOP Worker              ║')
  console.log('╚══════════════════════════════════════╝')
  console.log(`Mode: ${loop ? 'continuous (cron)' : 'single run'}`)

  // Check Playwright browsers are available
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) {
    console.log(`Browsers: ${process.env.PLAYWRIGHT_BROWSERS_PATH}`)
    if (!existsSync(process.env.PLAYWRIGHT_BROWSERS_PATH)) {
      console.error(`\n[ERROR] PLAYWRIGHT_BROWSERS_PATH does not exist: ${process.env.PLAYWRIGHT_BROWSERS_PATH}`)
      console.error('Run: npx playwright install chromium')
      if (!loop) process.exit(1)
    }
  } else {
    console.log('Browsers: default location (set PLAYWRIGHT_BROWSERS_PATH if running as service)')
  }
  console.log()

  if (!loop) {
    // Single run mode (testing / manual trigger)
    await tryRunFullCycle('single run')
    return
  }

  // Loop mode: register cron schedules + startup cycle + polling loop
  console.log('[Worker] Registering cron schedules (timezone: America/Bogota)')
  for (const s of CRON_SCHEDULES) {
    cron.schedule(s.cron, () => {
      void tryRunFullCycle(`scheduled ${s.label}`)
    }, { timezone: COLOMBIA_TZ })
    console.log(`  • ${s.cron} → ${s.label}`)
  }
  console.log()

  // Run once on startup so we don't wait hours for the first scheduled tick
  void tryRunFullCycle('startup')

  // Polling loop for sync requests + bootstrap (independent of main cycles)
  startPollingLoop()

  // Keep process alive forever — cron will dispatch cycles; polling dispatches fast tasks
  await new Promise<void>(() => {})
}

function startPollingLoop() {
  const POLL_INTERVAL_MS = 30_000
  console.log(`[Worker] Polling loop every ${POLL_INTERVAL_MS / 1000}s for sync + bootstrap`)

  setInterval(() => {
    // Don't compete with a full cycle
    if (cycleRunning) return

    void (async () => {
      try {
        await processPendingSyncs()
      } catch (err) {
        console.error('[Poll] Sync check failed:', err instanceof Error ? err.message : err)
      }
      try {
        await bootstrapNewPrecontractual()
      } catch (err) {
        console.error('[Poll] Precontractual bootstrap failed:',
          err instanceof Error ? err.message : err)
      }
    })()
  }, POLL_INTERVAL_MS)
}

async function runFullCycle() {
  // 1. Get active accounts — prioritize those with sync_requested_at
  const { data: accounts, error: accountsError } = await admin
    .from('secop_accounts')
    .select('id, name, username, monitored_entities, entity_name, sync_requested_at')
    .eq('is_active', true)
    .order('sync_requested_at', { ascending: true, nullsFirst: false })

  if (accountsError) {
    console.error('[Worker] Error fetching accounts:', accountsError.message)
  }

  if (!accounts?.length) {
    console.log('[Worker] No active SECOP accounts configured')
    console.log('[Worker] Add accounts via the LiciTrack UI: /secop/seguimiento')
    console.log()
    return
  }

  console.log(`[Worker] ${accounts.length} active account(s)\n`)

  // 2. For each account: login once, then discover for each monitored company
  for (const acc of accounts) {
    console.log(`[Worker] ${acc.name}`)

    // Login once (SECOP company switching uses session cookies, not re-login)
    const session = await getValidSession(acc.id)
    if (!session) {
      console.log(`  Login...`)
      const ok = await loginAccount(acc.id)
      if (!ok) {
        console.log(`  Login FAILED — skipping this account`)
        continue
      }
    } else {
      console.log(`  Session active`)
    }

    // Helper: run discovery with automatic re-login on session expiry
    const runDiscovery = async (entityName?: string): Promise<number> => {
      const result = await discoverProcesses(acc.id, entityName)
      if (result === -1) {
        // Session expired on SECOP side — re-login and retry once
        console.log(`  Session expired — re-logging in...`)
        const ok = await loginAccount(acc.id)
        if (!ok) {
          console.log(`  Re-login FAILED`)
          return 0
        }
        return await discoverProcesses(acc.id, entityName)
      }
      return result
    }

    // Discovery per entity — each entity has different contracts in SECOP
    const monitored = (acc.monitored_entities as string[] | null) || []

    if (monitored.length === 0) {
      // No entities selected — discover from default view to populate entity list
      console.log(`  No entities selected — discovering from default view`)
      const newCount = await runDiscovery()
      console.log(`  Discovered: ${newCount} new contract(s)`)
      console.log(`  Select entities in "Mis cuentas" to discover entity-specific contracts`)
    } else {
      console.log(`  Processing ${monitored.length} entit${monitored.length === 1 ? 'y' : 'ies'}`)
      for (const entityName of monitored) {
        console.log(`\n  → ${entityName}`)
        const newCount = await runDiscovery(entityName)
        console.log(`    Discovered: ${newCount} new contract(s)`)
        await new Promise(r => setTimeout(r, config.delayBetweenRequestsMs))
      }
    }

    // Clear sync_requested_at flag after processing
    if (acc.sync_requested_at) {
      await admin
        .from('secop_accounts')
        .update({ sync_requested_at: null })
        .eq('id', acc.id)
      console.log(`\n  Sync flag cleared`)
    }
  }

  // 3. Monitor contractual (post-award) processes
  console.log('\n--- Monitoring (contractual) ---')
  const contractualResult = await runMonitorCycle()
  console.log(`[Worker] Contractual: ${contractualResult.checked} checked, ${contractualResult.changes} changes`)

  // 4. Monitor precontractual processes via public API (no login, no captcha)
  console.log('\n--- Monitoring (precontractual) ---')
  try {
    const precontractualResult = await runPrecontractualMonitorCycle()
    console.log(`[Worker] Precontractual: ${precontractualResult.checked} checked, ${precontractualResult.changes} changes`)
  } catch (err) {
    console.error('[Worker] Precontractual cycle failed:', err instanceof Error ? err.message : err)
  }
}

/**
 * Check for accounts with sync_requested_at set and run discovery immediately.
 * Called every 30s during the wait between full cycles.
 */
async function processPendingSyncs() {
  const { data: pending } = await admin
    .from('secop_accounts')
    .select('id, name, monitored_entities')
    .eq('is_active', true)
    .not('sync_requested_at', 'is', null)

  if (!pending?.length) return

  for (const acc of pending) {
    const monitored = (acc.monitored_entities as string[] | null) || []

    const session = await getValidSession(acc.id)
    if (!session) {
      console.log(`[Sync] ${acc.name}: no session — logging in...`)
      const ok = await loginAccount(acc.id)
      if (!ok) {
        console.log(`[Sync] ${acc.name}: login failed`)
        await admin.from('secop_accounts').update({ sync_requested_at: null }).eq('id', acc.id)
        continue
      }
    }

    if (monitored.length === 0) {
      console.log(`[Sync] ${acc.name}: no entities selected — discovering default`)
      const result = await discoverProcesses(acc.id)
      if (result === -1) {
        const ok = await loginAccount(acc.id)
        if (ok) await discoverProcesses(acc.id)
      }
    } else {
      console.log(`[Sync] ${acc.name}: discovering ${monitored.length} entities`)
      for (const entityName of monitored) {
        console.log(`[Sync] → ${entityName}`)
        const result = await discoverProcesses(acc.id, entityName)
        if (result === -1) {
          const ok = await loginAccount(acc.id)
          if (ok) await discoverProcesses(acc.id, entityName)
        }
        await new Promise(r => setTimeout(r, config.delayBetweenRequestsMs))
      }
    }

    await admin.from('secop_accounts').update({ sync_requested_at: null }).eq('id', acc.id)
    console.log(`[Sync] ${acc.name}: done`)
  }
}

/**
 * Detect precontractual processes that were just added (monitoring_enabled=true,
 * tipo_proceso='precontractual', no snapshot yet) and bootstrap them — this
 * triggers the first captcha-protected scrape so the user sees the cronograma
 * with exact hours within ~30 seconds instead of waiting for the next 2h cycle.
 */
async function bootstrapNewPrecontractual() {
  const { data: candidates } = await admin
    .from('secop_processes')
    .select('id, notice_uid')
    .eq('monitoring_enabled', true)
    .eq('tipo_proceso', 'precontractual')
    .is('last_monitored_at', null)
    .not('notice_uid', 'is', null)
    .limit(3) // cap per cycle to avoid hammering the captcha solver

  if (!candidates?.length) return

  for (const cand of candidates) {
    if (!cand.notice_uid) continue
    console.log(`[Bootstrap] ${cand.notice_uid}: first-time capture`)
    const res = await monitorOneNow(cand.id)
    if ('error' in res) {
      console.error(`[Bootstrap] ${cand.notice_uid} failed:`, res.error)
    } else {
      console.log(`[Bootstrap] ${cand.notice_uid}: done (${res.changesFound} changes)`)
    }
  }
}

main().catch(async err => {
  console.error('[Worker] Fatal:', err)
  // In loop mode, don't exit — wait 5 minutes and restart.
  // This prevents NSSM crash loops that eat all server RAM.
  if (process.argv.includes('--loop')) {
    console.error('[Worker] Waiting 5 minutes before restarting...')
    await new Promise(r => setTimeout(r, 300_000))
    main().catch(() => process.exit(1))
  } else {
    process.exit(1)
  }
})
