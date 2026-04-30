/**
 * Diagnóstico: por qué un proceso NO está siendo monitoreado.
 *
 * El ciclo del worker filtra por:
 *   monitoring_enabled = true
 *   tipo_proceso = 'precontractual' (para el ciclo precontractual)
 *   notice_uid IS NOT NULL
 *
 * Si una pestaña aparece en /seguimiento pero el log dice
 * "[Precontractual] N processes to check" con N menor al esperado,
 * algún proceso está fallando uno de esos filtros. Este script lista
 * todos los procesos manuales/radar y muestra exactamente qué falta.
 *
 * Uso (desde C:\licitrack\worker):
 *   npx tsx scripts/diagnose-monitoring.ts
 */
import { admin } from '../src/db.js'

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

  const issues: string[] = []
  for (const p of rows) {
    const name = p.custom_name || p.objeto || p.secop_process_id
    const reasons: string[] = []
    if (!p.monitoring_enabled) reasons.push('monitoring_enabled=FALSE')
    if (!p.notice_uid) reasons.push('notice_uid=NULL')
    if (p.tipo_proceso !== 'precontractual' && p.tipo_proceso !== 'contractual') {
      reasons.push(`tipo_proceso=${p.tipo_proceso ?? 'NULL'}`)
    }

    const monitorable = reasons.length === 0
    const flag = monitorable ? '✓' : '✗'
    const lastMon = p.last_monitored_at
      ? new Date(p.last_monitored_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })
      : 'NUNCA'

    console.log(`${flag} [${p.source}/${p.tipo_proceso ?? '?'}] ${name}`)
    console.log(`    entidad: ${p.entidad ?? '—'}`)
    console.log(`    notice_uid: ${p.notice_uid ?? 'NULL'} · monitoring_enabled: ${p.monitoring_enabled} · last_monitored_at: ${lastMon}`)
    if (!monitorable) {
      console.log(`    ⚠️  no monitoreado: ${reasons.join(', ')}`)
      issues.push(`${name} → ${reasons.join(', ')}`)
    }
    console.log()
  }

  if (issues.length > 0) {
    console.log(`\n═══ ${issues.length} procesos sin monitorear ═══`)
    for (const i of issues) console.log(`  • ${i}`)
  } else {
    console.log(`\n✓ Todos los procesos están siendo monitoreados.`)
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
