import { existsSync } from 'fs'
import { admin } from './db.js'
import { config } from './config.js'
import { loginAccount } from './login.js'
import { getValidSession } from './session.js'
import { discoverProcesses } from './discovery.js'
import { runMonitorCycle } from './monitor.js'
import { runInboxSyncCycle } from './inbox-monitor.js'
import { runPrecontractualMonitorCycle, monitorOneNow } from './precontractual/monitor.js'
import { sendPendingNotifications, sendPendingAlerts } from './telegram/sender.js'
import { pollSetupCommands } from './telegram/poller.js'
import { runAlertChecks } from './alerts.js'
import { runRadarDiscovery } from './radar/discovery.js'

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
 * Loop mode (Colombia TZ, UTC-5):
 *   • Cada 30 min de 06:00 a 22:00 (sin madrugada — SECOP no publica de noche).
 *     Total: 33 ciclos/día. Stale máx: 30 min.
 *   • Polling cada 30s — chequea horarios + sync requests + bootstrap de procesos nuevos
 *   • Un ciclo de arranque al iniciar el servicio
 *   • Self-exit a las MAX_UPTIME_HOURS para forzar reinicio limpio (anti-zombie)
 *
 * IMPORTANTE: NO usamos node-cron. Usa cadenas de setTimeout que se rompen
 * silenciosamente cuando hay handles colgados (sockets keepalive, browsers
 * Playwright). En su lugar, el polling cada 30s chequea contra los horarios
 * y dispara el ciclo cuando hace match. Más simple, más robusto.
 */

type ScheduleSlot = { hour: number; minute: number; label: string }

const SCHEDULES: ScheduleSlot[] = [
  { hour: 6,  minute: 0,  label: '06:00 AM' },
  { hour: 6,  minute: 30, label: '06:30 AM' },
  { hour: 7,  minute: 0,  label: '07:00 AM' },
  { hour: 7,  minute: 30, label: '07:30 AM' },
  { hour: 8,  minute: 0,  label: '08:00 AM' },
  { hour: 8,  minute: 30, label: '08:30 AM' },
  { hour: 9,  minute: 0,  label: '09:00 AM' },
  { hour: 9,  minute: 30, label: '09:30 AM' },
  { hour: 10, minute: 0,  label: '10:00 AM' },
  { hour: 10, minute: 30, label: '10:30 AM' },
  { hour: 11, minute: 0,  label: '11:00 AM' },
  { hour: 11, minute: 30, label: '11:30 AM' },
  { hour: 12, minute: 0,  label: '12:00 PM' },
  { hour: 12, minute: 30, label: '12:30 PM' },
  { hour: 13, minute: 0,  label: '01:00 PM' },
  { hour: 13, minute: 30, label: '01:30 PM' },
  { hour: 14, minute: 0,  label: '02:00 PM' },
  { hour: 14, minute: 30, label: '02:30 PM' },
  { hour: 15, minute: 0,  label: '03:00 PM' },
  { hour: 15, minute: 30, label: '03:30 PM' },
  { hour: 16, minute: 0,  label: '04:00 PM' },
  { hour: 16, minute: 30, label: '04:30 PM' },
  { hour: 17, minute: 0,  label: '05:00 PM' },
  { hour: 17, minute: 30, label: '05:30 PM' },
  { hour: 18, minute: 0,  label: '06:00 PM' },
  { hour: 18, minute: 30, label: '06:30 PM' },
  { hour: 19, minute: 0,  label: '07:00 PM' },
  { hour: 19, minute: 30, label: '07:30 PM' },
  { hour: 20, minute: 0,  label: '08:00 PM' },
  { hour: 20, minute: 30, label: '08:30 PM' },
  { hour: 21, minute: 0,  label: '09:00 PM' },
  { hour: 21, minute: 30, label: '09:30 PM' },
  { hour: 22, minute: 0,  label: '10:00 PM' },
]

// Self-restart cada N horas. NSSM reinicia el servicio automáticamente.
// Esto previene que un proceso quede zombie por leaks acumulados (handles
// de Playwright, sockets, etc) y nos garantiza al menos un ciclo cada
// MAX_UPTIME_HOURS aunque todo lo demás falle.
const MAX_UPTIME_HOURS = 4
const PROCESS_START = Date.now()

// Tracker para no disparar el mismo slot dos veces en el mismo día.
// Clave: "YYYY-MM-DD-<label>" en hora Bogotá. Como el proceso se reinicia
// cada MAX_UPTIME_HOURS, el set nunca crece más de ~33 entradas — no hace
// falta TTL ni cleanup.
const firedSlotKeys = new Set<string>()

// ── Worker health: persistencia del estado del worker en DB ──
// Permite que un chequeo externo (Vercel Cron) detecte si el worker está
// muerto leyendo last_heartbeat_at. También trackea el último ciclo para
// auditoría y para detectar ciclos que se cuelgan.

async function writeHeartbeat(): Promise<void> {
  const { error } = await admin
    .from('worker_health')
    .update({ last_heartbeat_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) console.error('[Worker] Heartbeat update failed:', error.message)
}

async function writeUptimeStart(): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await admin
    .from('worker_health')
    .update({ uptime_started_at: now, last_heartbeat_at: now })
    .eq('id', 1)
  if (error) console.error('[Worker] Uptime start update failed:', error.message)
}

async function markCycleStarted(): Promise<void> {
  const { error } = await admin
    .from('worker_health')
    .update({ last_cycle_started_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) console.error('[Worker] Cycle-start update failed:', error.message)
}

async function markCycleFinished(
  status: 'success' | 'error' | 'timeout',
  durationSec: number,
): Promise<void> {
  const { error } = await admin
    .from('worker_health')
    .update({
      last_cycle_finished_at: new Date().toISOString(),
      last_cycle_status: status,
      last_cycle_duration_seconds: Math.round(durationSec),
    })
    .eq('id', 1)
  if (error) console.error('[Worker] Cycle-finish update failed:', error.message)
}

// Flag para evitar que un schedule pise un ciclo en curso
let cycleRunning = false

// Hard timeout — si un ciclo tarda más que esto, lo damos por colgado y
// liberamos el flag para que el siguiente cron pueda correr. Sin esto, un
// Playwright stuck (página que no carga, captcha en loop) deja cycleRunning
// en true para SIEMPRE y el worker deja de procesar todo aunque siga vivo.
const CYCLE_TIMEOUT_MS = 25 * 60 * 1000 // 25 min

async function tryRunFullCycle(trigger: string): Promise<void> {
  if (cycleRunning) {
    console.log(`[Worker] ${trigger} skipped: cycle already running`)
    return
  }
  cycleRunning = true
  const start = Date.now()
  console.log(`\n╔══ ${trigger} ══════════════════════╗`)

  // Marcar inicio en worker_health (no bloquea el ciclo si falla)
  await markCycleStarted()

  let cycleStatus: 'success' | 'error' | 'timeout' = 'success'

  let timeoutHandle: NodeJS.Timeout | null = null
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(`Cycle hard timeout after ${CYCLE_TIMEOUT_MS / 60000} min`)),
      CYCLE_TIMEOUT_MS,
    )
  })

  try {
    await Promise.race([runFullCycle(), timeoutPromise])
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    cycleStatus = message.includes('hard timeout') ? 'timeout' : 'error'
    console.error('[Worker] Cycle failed:', message)
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
    cycleRunning = false
    const elapsedSec = (Date.now() - start) / 1000
    console.log(`╚══ Cycle done in ${elapsedSec.toFixed(1)}s ══════╝\n`)
    // Persistir resultado del ciclo (status + duración)
    await markCycleFinished(cycleStatus, elapsedSec)
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

  // Loop mode: log schedules + startup cycle + polling loop con scheduler integrado
  console.log('[Worker] Schedules (America/Bogota):')
  for (const s of SCHEDULES) {
    console.log(`  • ${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')} → ${s.label}`)
  }
  console.log(`[Worker] Self-restart después de ${MAX_UPTIME_HOURS}h uptime (NSSM reinicia)`)
  console.log()

  // Marcar uptime_started_at = ahora en worker_health (cada restart resetea esto)
  await writeUptimeStart()

  // Run once on startup so we don't wait hours for the first scheduled tick
  void tryRunFullCycle('startup')

  // Polling loop chequea horarios + sync requests + bootstrap + telegram + watchdog
  startPollingLoop()

  // Keep process alive forever — el polling dispara ciclos y mantiene el loop activo
  await new Promise<void>(() => {})
}

/**
 * Devuelve hora/minuto/fecha actual en America/Bogota usando Intl.DateTimeFormat —
 * no depende de la TZ del sistema (Windows server suele estar en UTC).
 */
function nowInBogota(): { hour: number; minute: number; dateStr: string } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const parts = fmt.formatToParts(new Date())
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00'
  let hour = parseInt(get('hour'), 10)
  if (hour === 24) hour = 0 // hour12: false en algunos engines devuelve "24" para medianoche
  const minute = parseInt(get('minute'), 10)
  const dateStr = `${get('year')}-${get('month')}-${get('day')}`
  return { hour, minute, dateStr }
}

/**
 * Chequea si la hora actual matchea algún slot. Ventana de tolerancia de 5 min
 * desde el horario nominal — con polling cada 30s, tenemos hasta 10 chances
 * de capturar el slot. Set per-slot para no doble-disparar el mismo día.
 */
const SLOT_TOLERANCE_MIN = 5

function checkSchedules() {
  const { hour, minute, dateStr } = nowInBogota()

  for (const s of SCHEDULES) {
    if (hour !== s.hour) continue
    if (minute < s.minute || minute >= s.minute + SLOT_TOLERANCE_MIN) continue

    const key = `${dateStr}-${s.label}`
    if (firedSlotKeys.has(key)) return // ya disparamos este slot hoy
    firedSlotKeys.add(key)
    void tryRunFullCycle(`scheduled ${s.label}`)
    return
  }
}

/**
 * Si el proceso lleva más de MAX_UPTIME_HOURS, salimos limpiamente.
 * NSSM reinicia el servicio. Esto previene zombies por leaks acumulados.
 * NO matamos un ciclo en curso — esperamos a que termine.
 */
function checkMaxUptime() {
  const uptimeMs = Date.now() - PROCESS_START
  if (uptimeMs < MAX_UPTIME_HOURS * 60 * 60 * 1000) return
  if (cycleRunning) {
    // Esperamos a que termine el ciclo en curso antes de reiniciar
    return
  }
  console.log(`[Worker] Max uptime ${MAX_UPTIME_HOURS}h alcanzado — saliendo para reinicio limpio`)
  process.exit(0)
}

/**
 * Heartbeat periódico para que el log muestre signos de vida cuando el
 * worker está idle. Si dejamos de ver heartbeats, el event loop se colgó.
 */
let lastHeartbeatLog = 0
function heartbeatTick() {
  const now = Date.now()
  if (now - lastHeartbeatLog < 5 * 60 * 1000) return
  lastHeartbeatLog = now
  const uptimeMin = Math.floor((now - PROCESS_START) / 60000)
  const { hour, minute } = nowInBogota()
  console.log(`[Worker] alive · uptime ${uptimeMin}min · ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} Bogotá`)
}

// Flag para que dos ticks de polling no corran en paralelo. Sin esto, si un
// bootstrap con captcha tarda > 30s, el siguiente tick arranca en paralelo,
// la query de candidatos devuelve los mismos NTCs (porque last_monitored_at
// sigue NULL hasta que termine el primero), y se duplica el trabajo →
// 2x créditos CapSolver por nada.
let pollRunning = false

// Flag separado para alertas: no se serializa contra cycleRunning porque
// las alertas no compiten con el ciclo (solo lee/escribe system_alerts).
// Pero sí evitamos que se piloten ticks anteriores si una corrida tarda > 30s.
let alertsRunning = false

// Timestamp del último heartbeat persistido en DB. El polling loop corre cada
// 30s (para que Telegram/watchdog/alertas sean rápidos) pero el heartbeat solo
// se escribe cada 60s para reducir Disk IO. El cron externo detecta "muerto"
// con threshold de 30 min, así que 60s entre heartbeats no afecta detección.
const HEARTBEAT_INTERVAL_MS = 60_000
let lastHeartbeatWriteAt = 0

function startPollingLoop() {
  const POLL_INTERVAL_MS = 30_000
  console.log(`[Worker] Polling loop every ${POLL_INTERVAL_MS / 1000}s — schedules, sync, bootstrap, telegram, watchdog`)

  setInterval(() => {
    // 0. Heartbeat persistente en DB cada HEARTBEAT_INTERVAL_MS (no en cada tick).
    //    Esto es lo que el cron externo lee para detectar "worker muerto > 30 min".
    const now = Date.now()
    if (now - lastHeartbeatWriteAt >= HEARTBEAT_INTERVAL_MS) {
      lastHeartbeatWriteAt = now
      void writeHeartbeat()
    }

    // 1. Heartbeat en log (siempre) — para ver signos de vida en log idle
    try { heartbeatTick() } catch {}

    // 2. Watchdog max-uptime (siempre) — exit si pasamos el límite
    try { checkMaxUptime() } catch {}

    // 3. Scheduler de ciclos completos (siempre — tryRunFullCycle ya tiene guard interno)
    try { checkSchedules() } catch (err) {
      console.error('[Poll] Schedule check failed:', err instanceof Error ? err.message : err)
    }

    // 3.5 Alertas de salud (independiente de cycleRunning — queremos alertar incluso
    //     si un ciclo está colgado). Flag propio para que no se solapen.
    if (!alertsRunning) {
      alertsRunning = true
      void (async () => {
        try {
          await runAlertChecks()
        } catch (err) {
          console.error('[Poll] Alert checks failed:', err instanceof Error ? err.message : err)
        } finally {
          alertsRunning = false
        }
      })()
    }

    // 4. Sync + bootstrap + telegram — solo si no hay ciclo grande corriendo
    if (cycleRunning || pollRunning) return
    pollRunning = true

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
      try {
        await pollSetupCommands()
      } catch (err) {
        console.error('[Poll] Telegram setup poller failed:',
          err instanceof Error ? err.message : err)
      }
      try {
        await sendPendingNotifications()
      } catch (err) {
        console.error('[Poll] Telegram sender failed:',
          err instanceof Error ? err.message : err)
      }
      try {
        await sendPendingAlerts()
      } catch (err) {
        console.error('[Poll] Telegram alert sender failed:',
          err instanceof Error ? err.message : err)
      } finally {
        pollRunning = false
      }
    })()
  }, POLL_INTERVAL_MS)
}

// Optimización Disk IO 2026-05-10: discovery cada 2 ciclos (cada 1h en vez
// de cada 30 min). Los procesos ya trackeados siguen siendo monitoreados en
// CADA ciclo (sin cambios). Lo único que se separa es "buscar procesos nuevos
// en SECOP" — eso ahora corre cada hora. Reduce ~25% del IO del worker porque
// el discovery es lo más caro (login + entity switching + scrape de listas).
const DISCOVERY_MIN_INTERVAL_MS = 55 * 60_000  // 55 min (con margen vs el ciclo de 30 min)
let lastDiscoveryAt = 0

// Radar de descubrimiento (buscador público SECOP por región). Independiente
// del discovery de cuentas: corre cada ~1h con su propio timer. Gating a 55 min
// para que enganche con la cadencia de ciclos de 30 min y dé ~1 corrida/hora.
const RADAR_MIN_INTERVAL_MS = 55 * 60_000
let lastRadarAt = 0

async function runFullCycle() {
  // Decidir si este ciclo hace discovery o solo monitoring.
  // Tras un restart del worker, lastDiscoveryAt=0 → primer ciclo SIEMPRE hace
  // discovery (comportamiento razonable: arrancar fresh).
  const now = Date.now()
  const shouldRunDiscovery = now - lastDiscoveryAt >= DISCOVERY_MIN_INTERVAL_MS

  if (!shouldRunDiscovery) {
    const skipMinutes = Math.floor((now - lastDiscoveryAt) / 60_000)
    console.log(`[Worker] Skipping discovery (último corrió hace ${skipMinutes} min) — solo monitoring este ciclo`)
  } else {
    lastDiscoveryAt = now

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
      // No retornamos — todavía hay que correr monitoring (de procesos ya trackeados sin cuenta asociada)
    } else {
      console.log(`[Worker] ${accounts.length} active account(s) — discovery cycle\n`)
      await runDiscoveryForAccounts(accounts)
    }
  }

  // Monitoring SIEMPRE (en cada ciclo de 30 min, sin cambio)
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

  // 5. Sync bandeja de mensajes (per cuenta, una URL global). Genera entradas en
  // secop_inbox_messages y, cuando matchea, dispara secop_process_changes para
  // que el pipeline existente notifique (Telegram + campanita unread).
  console.log('\n--- Inbox sync ---')
  try {
    const inboxResult = await runInboxSyncCycle()
    console.log(`[Worker] Inbox: ${inboxResult.totalNew} mensajes nuevos, ${inboxResult.totalMatched} matched a procesos`)
  } catch (err) {
    console.error('[Worker] Inbox sync failed:', err instanceof Error ? err.message : err)
  }

  // 6. Radar de descubrimiento — buscador público SECOP por región (near-real-time).
  //    Gated a ~1h con su propio timer (independiente del discovery de cuentas).
  const radarNow = Date.now()
  if (radarNow - lastRadarAt >= RADAR_MIN_INTERVAL_MS) {
    lastRadarAt = radarNow
    console.log('\n--- Radar discovery (buscador público) ---')
    try {
      const radar = await runRadarDiscovery()
      console.log(`[Worker] Radar: ${radar.regiones} región(es), ${radar.nuevos} nuevos, ${radar.alertados} alertados`)
    } catch (err) {
      console.error('[Worker] Radar discovery failed:', err instanceof Error ? err.message : err)
    }
  } else {
    const skipMin = Math.floor((radarNow - lastRadarAt) / 60_000)
    console.log(`[Worker] Radar skip (último hace ${skipMin} min)`)
  }
}

type AccountForDiscovery = {
  id: string
  name: string
  username: string
  monitored_entities: string[] | null
  entity_name: string | null
  sync_requested_at: string | null
}

async function runDiscoveryForAccounts(accounts: AccountForDiscovery[]) {
  // For each account: login once, then discover for each monitored company
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
const bootstrappingNotices = new Set<string>()

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

    // Lock por NTC: si ya estamos bootstrappeando este, saltarlo. Esto cubre
    // el caso donde el polling es throttle-d (cycleRunning) pero más adelante
    // un cron también lo levante, o cualquier race condition residual.
    if (bootstrappingNotices.has(cand.notice_uid)) {
      console.log(`[Bootstrap] ${cand.notice_uid}: skip (already bootstrapping)`)
      continue
    }
    bootstrappingNotices.add(cand.notice_uid)

    try {
      console.log(`[Bootstrap] ${cand.notice_uid}: first-time capture`)
      const res = await monitorOneNow(cand.id)
      if ('error' in res) {
        console.error(`[Bootstrap] ${cand.notice_uid} failed:`, res.error)
      } else {
        console.log(`[Bootstrap] ${cand.notice_uid}: done (${res.changesFound} changes)`)
      }
    } finally {
      bootstrappingNotices.delete(cand.notice_uid)
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
