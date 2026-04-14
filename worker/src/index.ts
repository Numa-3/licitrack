import { existsSync } from 'fs'
import { admin } from './db.js'
import { config } from './config.js'
import { loginAccount } from './login.js'
import { getValidSession } from './session.js'
import { discoverProcesses } from './discovery.js'
import { runMonitorCycle } from './monitor.js'

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
 *   npx tsx src/index.ts --loop   # Run continuously every MONITOR_INTERVAL_MS
 */
async function main() {
  const loop = process.argv.includes('--loop')

  console.log('╔══════════════════════════════════════╗')
  console.log('║  LiciTrack SECOP Worker              ║')
  console.log('╚══════════════════════════════════════╝')
  console.log(`Mode: ${loop ? 'continuous' : 'single run'}`)

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

  do {
    const startTime = Date.now()

    try {
      await runFullCycle()
    } catch (err) {
      console.error('[Worker] Cycle failed:', err instanceof Error ? err.message : err)
    }

    if (loop) {
      const elapsed = Date.now() - startTime
      const waitMs = Math.max(0, config.monitorIntervalMs - elapsed)
      console.log(`\n[Worker] Next cycle in ${Math.round(waitMs / 60_000)} minutes...`)

      // While waiting, check for sync requests every 30s
      const waitStart = Date.now()
      while (Date.now() - waitStart < waitMs) {
        await new Promise(r => setTimeout(r, 30_000))
        try {
          await processPendingSyncs()
        } catch (err) {
          console.error('[Worker] Sync check failed:', err instanceof Error ? err.message : err)
        }
      }
    }
  } while (loop)
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

  // 3. Monitor all enabled processes
  console.log('\n--- Monitoring ---')
  const result = await runMonitorCycle()
  console.log(`[Worker] Cycle complete: ${result.checked} checked, ${result.changes} changes`)
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
