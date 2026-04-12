import { admin } from './db.js'

async function main() {
  // 1. Total snapshots & estimated size
  const { count } = await admin
    .from('secop_process_snapshots')
    .select('*', { count: 'exact', head: true })

  console.log(`═══ SNAPSHOTS ═══`)
  console.log(`Total: ${count}`)

  // 2. Get a sample snapshot to estimate size
  const { data: sample } = await admin
    .from('secop_process_snapshots')
    .select('snapshot_json')
    .limit(1)
    .single()

  if (sample) {
    const sizeBytes = JSON.stringify(sample.snapshot_json).length
    const sizeKB = (sizeBytes / 1024).toFixed(1)
    const totalEstMB = ((sizeBytes * (count || 0)) / 1024 / 1024).toFixed(1)
    console.log(`Tamaño por snapshot: ~${sizeKB} KB`)
    console.log(`Tamaño estimado total: ~${totalEstMB} MB`)
  }

  // 3. Snapshots per process
  const { data: perProcess } = await admin
    .from('secop_process_snapshots')
    .select('process_id')

  if (perProcess) {
    const counts = new Map<string, number>()
    for (const s of perProcess) {
      counts.set(s.process_id, (counts.get(s.process_id) || 0) + 1)
    }
    const values = [...counts.values()]
    const avg = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)
    const max = Math.max(...values)
    console.log(`Procesos con snapshots: ${counts.size}`)
    console.log(`Promedio snapshots por proceso: ${avg}`)
    console.log(`Máximo snapshots en un proceso: ${max}`)
  }

  // 4. Last 2 snapshots for a monitored process (to show comparison)
  const { data: monitored } = await admin
    .from('secop_processes')
    .select('id, secop_process_id, entidad, estado')
    .eq('monitoring_enabled', true)
    .limit(1)
    .single()

  if (monitored) {
    console.log(`\n═══ ÚLTIMAS 2 SNAPSHOTS (proceso ${monitored.secop_process_id}) ═══`)
    const { data: lastTwo } = await admin
      .from('secop_process_snapshots')
      .select('id, captured_at, hash, source_type')
      .eq('process_id', monitored.id)
      .order('captured_at', { ascending: false })
      .limit(5)

    if (lastTwo) {
      for (const s of lastTwo) {
        console.log(`  ${s.captured_at} | hash: ${s.hash?.slice(0, 12)}... | ${s.source_type}`)
      }
      if (lastTwo.length >= 2) {
        const diff = new Date(lastTwo[0].captured_at).getTime() - new Date(lastTwo[1].captured_at).getTime()
        const diffMins = Math.floor(diff / 60000)
        console.log(`\n  Diferencia entre última y anterior: ${diffMins} minutos`)
        console.log(`  Hash match: ${lastTwo[0].hash === lastTwo[1].hash ? 'SÍ (sin cambios)' : 'NO (hubo cambios)'}`)
      }
    }
  }

  // 5. Date range
  const { data: oldest } = await admin
    .from('secop_process_snapshots')
    .select('captured_at')
    .order('captured_at', { ascending: true })
    .limit(1)
    .single()

  const { data: newest } = await admin
    .from('secop_process_snapshots')
    .select('captured_at')
    .order('captured_at', { ascending: false })
    .limit(1)
    .single()

  if (oldest && newest) {
    console.log(`\n═══ RANGO ═══`)
    console.log(`  Primera: ${oldest.captured_at}`)
    console.log(`  Última:  ${newest.captured_at}`)
  }

  // 6. Monitor log - last cycles
  const { data: logs } = await admin
    .from('secop_monitor_log')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(5)

  if (logs?.length) {
    console.log(`\n═══ ÚLTIMOS CICLOS DEL WORKER ═══`)
    for (const log of logs) {
      const duration = log.finished_at
        ? `${Math.round((new Date(log.finished_at).getTime() - new Date(log.started_at).getTime()) / 1000)}s`
        : 'en curso'
      console.log(`  ${log.started_at} | ${log.status} | ${duration} | ${log.processes_checked} revisados, ${log.changes_found} cambios`)
    }
  }
}

main()
