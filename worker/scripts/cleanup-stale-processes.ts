/**
 * Cleanup: hard delete de procesos viejos con monitoring_enabled=false.
 *
 * Filtra procesos que cumplen ambas:
 *   1. monitoring_enabled = false
 *   2. last_monitored_at < (hoy - STALE_DAYS) ó (last_monitored_at IS NULL Y created_at < cutoff)
 *
 * El segundo OR captura procesos que nunca se monitorearon (basura del descubrimiento
 * inicial), siempre que sean lo bastante viejos como para no estar en uso reciente.
 *
 * Default es DRY-RUN: imprime la lista sin tocar nada. Para borrar de verdad:
 *   npx tsx scripts/cleanup-stale-processes.ts --confirm
 *
 * El borrado en `secop_processes` propaga vía FK ON DELETE CASCADE a
 * `secop_process_snapshots`, `secop_process_changes` y `notifications`.
 */
import { admin } from '../src/db.js'

const STALE_DAYS = 90 // 3 meses
const DRY_RUN = !process.argv.includes('--confirm')

type Candidate = {
  id: string
  secop_process_id: string | null
  custom_name: string | null
  objeto: string | null
  entidad: string | null
  last_monitored_at: string | null
  created_at: string
}

async function main() {
  const cutoffMs = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000
  const cutoff = new Date(cutoffMs).toISOString()

  console.log(`═══ Cleanup procesos stale ═══`)
  console.log(`Cutoff: ${cutoff} (hace ${STALE_DAYS} días)`)
  console.log(`Modo: ${DRY_RUN ? 'DRY-RUN (no borra nada)' : 'CONFIRM (borrado real)'}`)
  console.log()

  // PostgREST .or() con and() anidado:
  //   last_monitored_at < cutoff   OR   (last_monitored_at IS NULL AND created_at < cutoff)
  const orFilter = `last_monitored_at.lt.${cutoff},and(last_monitored_at.is.null,created_at.lt.${cutoff})`

  const { data: candidates, error } = await admin
    .from('secop_processes')
    .select('id, secop_process_id, custom_name, objeto, entidad, last_monitored_at, created_at')
    .eq('monitoring_enabled', false)
    .or(orFilter)
    .order('last_monitored_at', { ascending: true, nullsFirst: true })

  if (error) {
    console.error('SELECT failed:', error.message)
    process.exit(1)
  }

  if (!candidates?.length) {
    console.log('Nada para limpiar — no hay procesos que cumplan los filtros.')
    return
  }

  console.log(`${candidates.length} procesos candidatos a borrar:\n`)
  for (const p of candidates as Candidate[]) {
    const name = p.custom_name || p.objeto || p.secop_process_id || '(sin nombre)'
    const last = p.last_monitored_at
      ? new Date(p.last_monitored_at).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })
      : `nunca (created ${new Date(p.created_at).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })})`
    console.log(`  • ${name.slice(0, 70)}`)
    console.log(`      entidad: ${p.entidad ?? '—'} · last_monitored_at: ${last}`)
  }

  if (DRY_RUN) {
    console.log()
    console.log(`💡 Dry-run. Para borrar de verdad:`)
    console.log(`   npx tsx scripts/cleanup-stale-processes.ts --confirm`)
    return
  }

  console.log()
  console.log(`Borrando ${candidates.length} procesos...`)
  const ids = (candidates as Candidate[]).map(c => c.id)

  const { error: delError, count } = await admin
    .from('secop_processes')
    .delete({ count: 'exact' })
    .in('id', ids)

  if (delError) {
    console.error('DELETE failed:', delError.message)
    process.exit(1)
  }

  console.log(`✓ ${count} procesos borrados`)
  console.log(`  (snapshots, changes y notifications cascadean automáticamente vía FK)`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
