/**
 * Reporte semanal del worker.
 *
 * Agrega métricas de:
 *   - secop_monitor_log     → ciclos corridos, duración, success/error
 *   - secop_process_changes → cambios detectados por tipo/prioridad/proceso
 *   - secop_process_snapshots → snapshots guardados
 *   - notifications         → notificaciones generadas + estado Telegram
 *
 * Por default cubre 7 días. Pasar otro número como argumento:
 *   npx tsx scripts/weekly-report.ts        # 7 días
 *   npx tsx scripts/weekly-report.ts 3      # 3 días
 *   npx tsx scripts/weekly-report.ts 30     # 30 días
 *
 * Script read-only — no modifica nada.
 */
import { admin } from '../src/db.js'

const DAYS = parseInt(process.argv[2] || '7', 10)
const SINCE_MS = Date.now() - DAYS * 24 * 60 * 60 * 1000
const SINCE_ISO = new Date(SINCE_MS).toISOString()

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function fmtNumber(n: number): string {
  return n.toLocaleString('es-CO')
}

function fmtDuration(ms: number): string {
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min}m`
  return `${(min / 60).toFixed(1)}h`
}

function section(title: string) {
  console.log()
  console.log(`═══ ${title} ═══`)
}

async function reportCycles() {
  section('Ciclos del worker')
  const { data: cycles, error } = await admin
    .from('secop_monitor_log')
    .select('*')
    .gte('started_at', SINCE_ISO)
    .order('started_at', { ascending: false })

  if (error) { console.error('Error:', error.message); return }
  if (!cycles?.length) { console.log('  Sin ciclos registrados en el período.'); return }

  const byStatus = { success: 0, error: 0, running: 0 }
  let totalChecked = 0
  let totalChanges = 0
  const durations: number[] = []

  for (const c of cycles) {
    if (c.status === 'success') byStatus.success++
    else if (c.status === 'error') byStatus.error++
    else byStatus.running++

    totalChecked += c.processes_checked || 0
    totalChanges += c.changes_found || 0

    if (c.started_at && c.finished_at) {
      const ms = new Date(c.finished_at).getTime() - new Date(c.started_at).getTime()
      if (ms > 0) durations.push(ms)
    }
  }

  const avgDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0
  const maxDuration = durations.length > 0 ? Math.max(...durations) : 0

  console.log(`  Total ciclos:        ${cycles.length}`)
  console.log(`    ✓ Success:         ${byStatus.success}`)
  console.log(`    ✗ Error:           ${byStatus.error}`)
  console.log(`    ⏳ En curso:        ${byStatus.running}`)
  console.log(`  Procesos chequeados: ${fmtNumber(totalChecked)} (acumulado)`)
  console.log(`  Cambios detectados:  ${fmtNumber(totalChanges)} (acumulado)`)
  console.log(`  Duración promedio:   ${fmtDuration(avgDuration)}`)
  console.log(`  Duración máxima:     ${fmtDuration(maxDuration)}`)

  // Errores recientes
  const errors = cycles.filter(c => c.status === 'error').slice(0, 5)
  if (errors.length > 0) {
    console.log(`\n  Últimos errores:`)
    for (const e of errors) {
      console.log(`    ${fmtDate(e.started_at)} — ${(e.error_message || 'sin mensaje').slice(0, 80)}`)
    }
  }

  // Ciclos por día
  const byDay = new Map<string, number>()
  for (const c of cycles) {
    const day = c.started_at.slice(0, 10)
    byDay.set(day, (byDay.get(day) ?? 0) + 1)
  }
  console.log(`\n  Ciclos por día:`)
  const sortedDays = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  for (const [day, count] of sortedDays) {
    const bar = '█'.repeat(Math.min(count, 30))
    console.log(`    ${day}: ${String(count).padStart(3)} ${bar}`)
  }
}

async function reportChanges() {
  section('Cambios detectados')
  const { data: changes, error } = await admin
    .from('secop_process_changes')
    .select('change_type, priority, process_id, detected_at, summary')
    .gte('detected_at', SINCE_ISO)
    .order('detected_at', { ascending: false })

  if (error) { console.error('Error:', error.message); return }
  if (!changes?.length) { console.log('  Sin cambios detectados en el período.'); return }

  const byType = new Map<string, number>()
  const byPriority = { high: 0, medium: 0, low: 0 }
  const byProcess = new Map<string, number>()

  for (const c of changes) {
    byType.set(c.change_type, (byType.get(c.change_type) ?? 0) + 1)
    if (c.priority === 'high') byPriority.high++
    else if (c.priority === 'medium') byPriority.medium++
    else byPriority.low++
    if (c.process_id) byProcess.set(c.process_id, (byProcess.get(c.process_id) ?? 0) + 1)
  }

  console.log(`  Total cambios:       ${changes.length}`)
  console.log(`    🔴 Alta:           ${byPriority.high}`)
  console.log(`    🟡 Media:          ${byPriority.medium}`)
  console.log(`    ⚪ Baja:           ${byPriority.low}`)

  console.log(`\n  Por tipo:`)
  const sortedTypes = [...byType.entries()].sort((a, b) => b[1] - a[1])
  for (const [type, count] of sortedTypes) {
    console.log(`    ${count.toString().padStart(4)}× ${type}`)
  }

  // Top procesos con más actividad
  console.log(`\n  Top 5 procesos con más cambios:`)
  const topIds = [...byProcess.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  if (topIds.length > 0) {
    const { data: procs } = await admin
      .from('secop_processes')
      .select('id, custom_name, secop_process_id, objeto, entidad')
      .in('id', topIds.map(([id]) => id))
    const procMap = new Map(procs?.map(p => [p.id, p]) ?? [])
    for (const [id, count] of topIds) {
      const p = procMap.get(id)
      const name = p?.custom_name || p?.secop_process_id || (p?.objeto || 'desconocido').slice(0, 50)
      const entidad = p?.entidad ?? '—'
      console.log(`    ${count.toString().padStart(3)}× ${name}`)
      console.log(`         (${entidad})`)
    }
  }

  // Sample de cambios HIGH recientes
  const highRecent = changes.filter(c => c.priority === 'high').slice(0, 10)
  if (highRecent.length > 0) {
    console.log(`\n  Últimos cambios de prioridad alta:`)
    for (const c of highRecent) {
      console.log(`    ${fmtDate(c.detected_at)} — ${(c.summary || '').slice(0, 100)}`)
    }
  }
}

async function reportSnapshots() {
  section('Snapshots guardados')
  const { count: total, error } = await admin
    .from('secop_process_snapshots')
    .select('*', { count: 'exact', head: true })
    .gte('captured_at', SINCE_ISO)

  if (error) { console.error('Error:', error.message); return }

  const { data: byType } = await admin
    .from('secop_process_snapshots')
    .select('source_type')
    .gte('captured_at', SINCE_ISO)

  const types = new Map<string, number>()
  for (const s of byType ?? []) {
    types.set(s.source_type, (types.get(s.source_type) ?? 0) + 1)
  }

  console.log(`  Total snapshots:     ${fmtNumber(total || 0)}`)
  for (const [type, count] of types) {
    console.log(`    ${type.padEnd(25)} ${count}`)
  }
}

async function reportNotifications() {
  section('Notificaciones')
  const { data: notifs, error } = await admin
    .from('notifications')
    .select('priority, telegram_sent_at, telegram_attempts, created_at')
    .gte('created_at', SINCE_ISO)

  if (error) { console.error('Error:', error.message); return }
  if (!notifs?.length) { console.log('  Sin notificaciones generadas.'); return }

  const byPriority = { high: 0, medium: 0, low: 0 }
  let tgSent = 0
  let tgPending = 0
  let tgFailed = 0

  for (const n of notifs) {
    if (n.priority === 'high') byPriority.high++
    else if (n.priority === 'medium') byPriority.medium++
    else byPriority.low++

    if (n.telegram_sent_at) tgSent++
    else if (n.telegram_attempts && n.telegram_attempts >= 3) tgFailed++
    else tgPending++
  }

  console.log(`  Total generadas:     ${notifs.length}`)
  console.log(`    🔴 Alta:           ${byPriority.high}`)
  console.log(`    🟡 Media:          ${byPriority.medium}`)
  console.log(`    ⚪ Baja:           ${byPriority.low}`)
  console.log(`\n  Telegram:`)
  console.log(`    ✓ Enviadas:        ${tgSent}`)
  console.log(`    ⏳ Pendientes:      ${tgPending}`)
  console.log(`    ✗ Fallaron (3+):   ${tgFailed}`)
}

async function main() {
  console.log(`╔═══════════════════════════════════════════════════════════╗`)
  console.log(`║  Reporte LiciTrack — últimos ${DAYS} días`.padEnd(60) + '║')
  console.log(`║  Desde ${fmtDate(SINCE_ISO)}`.padEnd(60) + '║')
  console.log(`║  Hasta ${fmtDate(new Date().toISOString())}`.padEnd(60) + '║')
  console.log(`╚═══════════════════════════════════════════════════════════╝`)

  await reportCycles()
  await reportChanges()
  await reportSnapshots()
  await reportNotifications()
}

main().catch(err => {
  console.error('\nFatal:', err)
  process.exit(1)
})
