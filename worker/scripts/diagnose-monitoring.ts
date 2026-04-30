/**
 * Diagnóstico: qué procesos están siendo monitoreados y cuáles no, y por qué.
 *
 * El worker corre 2 cycles independientes con filtros distintos:
 *
 *   Precontractual (worker/src/precontractual/monitor.ts):
 *     monitoring_enabled = true
 *     tipo_proceso       = 'precontractual'
 *     notice_uid         IS NOT NULL
 *
 *   Contractual (worker/src/monitor.ts):
 *     monitoring_enabled = true
 *     tipo_proceso       IS NULL OR = 'contractual'
 *     (notice_uid no requerido)
 *
 * Un proceso está monitoreado si CALIFICA para alguno de los dos. Este script
 * replica esa lógica para flagear correctamente: ✓ con la etiqueta del cycle
 * que lo agarra, ✗ con el motivo concreto si no entra a ninguno.
 *
 * Uso (desde C:\licitrack\worker):
 *   npx tsx scripts/diagnose-monitoring.ts
 */
import { admin } from '../src/db.js'

type ProcessRow = {
  id: string
  secop_process_id: string | null
  notice_uid: string | null
  tipo_proceso: string | null
  monitoring_enabled: boolean
  source: string | null
  custom_name: string | null
  objeto: string | null
  entidad: string | null
  last_monitored_at: string | null
}

type Cycle = 'precontractual' | 'contractual' | null

function classify(p: ProcessRow): { cycle: Cycle; reasons: string[] } {
  if (!p.monitoring_enabled) {
    return { cycle: null, reasons: ['monitoring_enabled=FALSE'] }
  }
  if (p.tipo_proceso === 'precontractual') {
    if (!p.notice_uid) {
      return { cycle: null, reasons: ['notice_uid=NULL (requerido para precontractual)'] }
    }
    return { cycle: 'precontractual', reasons: [] }
  }
  // tipo_proceso === 'contractual' o NULL → cycle contractual
  return { cycle: 'contractual', reasons: [] }
}

function cycleLabel(cycle: Cycle): string {
  if (cycle === 'precontractual') return '[precontractual]'
  if (cycle === 'contractual')    return '[contractual]   '
  return '[—]              '
}

async function main() {
  const { data: rows, error } = await admin
    .from('secop_processes')
    .select('id, secop_process_id, notice_uid, tipo_proceso, monitoring_enabled, source, custom_name, objeto, entidad, last_monitored_at')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }

  if (!rows?.length) {
    console.log('No hay procesos en la DB.')
    return
  }

  console.log(`═══ ${rows.length} procesos en total ═══\n`)

  const byCycle = { precontractual: 0, contractual: 0, none: 0 }
  const issues: { name: string; reason: string }[] = []

  for (const p of rows as ProcessRow[]) {
    const name = p.custom_name || p.objeto || p.secop_process_id || '(sin nombre)'
    const { cycle, reasons } = classify(p)

    if (cycle === 'precontractual') byCycle.precontractual++
    else if (cycle === 'contractual') byCycle.contractual++
    else byCycle.none++

    const flag = cycle ? '✓' : '✗'
    const lastMon = p.last_monitored_at
      ? new Date(p.last_monitored_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })
      : 'NUNCA'

    console.log(`${flag} ${cycleLabel(cycle)} ${name}`)
    console.log(`    entidad: ${p.entidad ?? '—'} · source: ${p.source ?? '—'}`)
    console.log(`    notice_uid: ${p.notice_uid ?? 'NULL'} · monitoring_enabled: ${p.monitoring_enabled} · last_monitored_at: ${lastMon}`)
    if (reasons.length > 0) {
      console.log(`    ⚠️  ${reasons.join(', ')}`)
      issues.push({ name, reason: reasons.join(', ') })
    }
    console.log()
  }

  console.log(`═══ Resumen ═══`)
  console.log(`  ✓ Precontractual: ${byCycle.precontractual}`)
  console.log(`  ✓ Contractual:    ${byCycle.contractual}`)
  console.log(`  ✗ Sin monitorear: ${byCycle.none}`)

  if (issues.length > 0) {
    // Agrupar por motivo para ver el patrón rápido
    const grouped = new Map<string, number>()
    for (const i of issues) grouped.set(i.reason, (grouped.get(i.reason) ?? 0) + 1)
    console.log(`\nMotivos:`)
    for (const [reason, count] of grouped) {
      console.log(`  • ${count}× ${reason}`)
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
