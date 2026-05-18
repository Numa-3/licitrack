/**
 * Reporte de tamaño de la DB en Supabase.
 *
 * Read-only. Estima el peso de cada tabla muestreando filas y multiplicando
 * por el count. Diseñado para usuarios en tier FREE / NANO con cupo de 500 MB
 * que necesitan decidir si pruning de snapshots vale la pena.
 *
 * Uso:
 *   npx tsx scripts/db-size-report.ts
 *
 * No requiere RPC custom — usa solo SELECT con índices existentes.
 */
import { admin } from '../src/db.js'

const NANO_QUOTA_MB = 500

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function pct(part: number, total: number): string {
  if (total === 0) return '0%'
  return `${((part / total) * 100).toFixed(1)}%`
}

async function countOnly(table: string): Promise<number> {
  const { count, error } = await admin
    .from(table)
    .select('*', { count: 'exact', head: true })
  if (error) {
    console.warn(`  ⚠️  count(${table}) falló: ${error.message}`)
    return 0
  }
  return count ?? 0
}

/**
 * Estima el peso de una tabla con JSON grande muestreando N filas y
 * promediando el tamaño serializado de la columna pesada.
 */
async function estimateJsonTable(
  table: string,
  jsonColumn: string,
  sampleSize = 20,
): Promise<{ count: number; avgRowBytes: number; totalBytes: number }> {
  const count = await countOnly(table)
  if (count === 0) return { count: 0, avgRowBytes: 0, totalBytes: 0 }

  const { data: samples, error } = await admin
    .from(table)
    .select(jsonColumn)
    .limit(sampleSize)
  if (error || !samples?.length) {
    console.warn(`  ⚠️  muestra de ${table} falló: ${error?.message ?? 'sin filas'}`)
    return { count, avgRowBytes: 0, totalBytes: 0 }
  }

  const sizes = samples.map(s => {
    const val = (s as unknown as Record<string, unknown>)[jsonColumn]
    return JSON.stringify(val ?? null).length
  })
  const avg = sizes.reduce((a, b) => a + b, 0) / sizes.length
  return { count, avgRowBytes: avg, totalBytes: avg * count }
}

/**
 * Para tablas chicas, asumimos un promedio fijo conservador (~500 B/fila)
 * porque no vale la pena muestrear.
 */
async function estimateSmallTable(table: string, avgRowBytes = 500): Promise<{ count: number; avgRowBytes: number; totalBytes: number }> {
  const count = await countOnly(table)
  return { count, avgRowBytes, totalBytes: avgRowBytes * count }
}

type RowEstimate = {
  table: string
  count: number
  avgRowBytes: number
  totalBytes: number
  isHeavy: boolean
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗')
  console.log(`║  DB Size Report — Supabase NANO (${NANO_QUOTA_MB} MB cupo)`.padEnd(60) + '║')
  console.log('╚═══════════════════════════════════════════════════════════╝')

  // Las tablas con JSON pesado las muestreamos. Las pequeñas asumimos avg fijo.
  const rows: RowEstimate[] = []

  console.log('\nMidiendo...')

  // Pesadas (con JSON)
  const snapshots = await estimateJsonTable('secop_process_snapshots', 'snapshot_json')
  rows.push({ table: 'secop_process_snapshots', ...snapshots, isHeavy: true })

  const changes = await estimateJsonTable('secop_process_changes', 'after_json', 30)
  rows.push({ table: 'secop_process_changes', ...changes, isHeavy: false })

  // Pequeñas (texto + ids)
  const notifs = await estimateSmallTable('notifications', 600)
  rows.push({ table: 'notifications', ...notifs, isHeavy: false })

  const processes = await estimateSmallTable('secop_processes', 2_000)
  rows.push({ table: 'secop_processes', ...processes, isHeavy: false })

  const monitorLog = await estimateSmallTable('secop_monitor_log', 300)
  rows.push({ table: 'secop_monitor_log', ...monitorLog, isHeavy: false })

  const accounts = await estimateSmallTable('secop_accounts', 2_000)
  rows.push({ table: 'secop_accounts', ...accounts, isHeavy: false })

  // Ordenar por tamaño descendente
  rows.sort((a, b) => b.totalBytes - a.totalBytes)

  const grandTotal = rows.reduce((s, r) => s + r.totalBytes, 0)

  // Tabla principal
  console.log('\nTabla                          Filas      Avg/fila      Total estimado')
  console.log('─'.repeat(75))
  for (const r of rows) {
    const flag = r.isHeavy && r.totalBytes > 50 * 1024 * 1024 ? ' ⚠️ grande' : ''
    const tableCell = r.table.padEnd(30)
    const countCell = r.count.toLocaleString('es-CO').padStart(8)
    const avgCell = fmtBytes(r.avgRowBytes).padStart(12)
    const totalCell = fmtBytes(r.totalBytes).padStart(14)
    console.log(`${tableCell} ${countCell}  ${avgCell}  ${totalCell}${flag}`)
  }
  console.log('─'.repeat(75))
  const totalCell = fmtBytes(grandTotal).padStart(14)
  const quotaMB = NANO_QUOTA_MB
  const usedPct = pct(grandTotal, quotaMB * 1024 * 1024)
  console.log(`Total estimado:                                          ${totalCell}`)
  console.log(`Cupo NANO:                                                      ${quotaMB} MB`)
  console.log(`Uso aproximado del cupo:                                       ${usedPct}`)

  // Top procesos por peso de snapshots (sólo si snapshots > 0)
  if (snapshots.count > 0) {
    console.log('\n═══ Top 5 procesos pesados (snapshots) ═══')

    // Traer process_id de cada snapshot. Para 100s de filas es trivial.
    const { data: allSnaps, error: snapErr } = await admin
      .from('secop_process_snapshots')
      .select('process_id')
    if (snapErr) {
      console.log(`  ⚠️ no se pudo agrupar: ${snapErr.message}`)
    } else if (allSnaps) {
      const byProcess = new Map<string, number>()
      for (const s of allSnaps) {
        if (!s.process_id) continue
        byProcess.set(s.process_id, (byProcess.get(s.process_id) ?? 0) + 1)
      }
      const top5 = [...byProcess.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)

      if (top5.length > 0) {
        const ids = top5.map(([id]) => id)
        const { data: procs } = await admin
          .from('secop_processes')
          .select('id, custom_name, secop_process_id, objeto, entidad')
          .in('id', ids)
        const procMap = new Map(procs?.map(p => [p.id, p]) ?? [])

        for (const [id, snapCount] of top5) {
          const p = procMap.get(id)
          const name = p?.custom_name || p?.secop_process_id || (p?.objeto ?? 'desconocido').slice(0, 50)
          const entidad = p?.entidad ?? '—'
          const estBytes = snapCount * snapshots.avgRowBytes
          console.log(`  ${String(snapCount).padStart(3)} snapshots  ${fmtBytes(estBytes).padStart(8)}  ${name}`)
          console.log(`                            (${entidad})`)
        }
      }
    }
  }

  // Rango de fechas de snapshots
  if (snapshots.count > 0) {
    const { data: oldest } = await admin
      .from('secop_process_snapshots')
      .select('captured_at')
      .order('captured_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    const { data: newest } = await admin
      .from('secop_process_snapshots')
      .select('captured_at')
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (oldest && newest) {
      const oldestStr = new Date(oldest.captured_at).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })
      const newestStr = new Date(newest.captured_at).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })
      const spanDays = Math.round((new Date(newest.captured_at).getTime() - new Date(oldest.captured_at).getTime()) / (24 * 60 * 60 * 1000))
      console.log(`\nSnapshots cubren ${spanDays} días: del ${oldestStr} al ${newestStr}`)
    }
  }

  // Lectura recomendada
  console.log('\n═══ Lectura sugerida ═══')
  const totalMB = grandTotal / 1024 / 1024
  if (totalMB < 50) {
    console.log('  ✅ Hay mucho margen (>450 MB libres). No hace falta optimizar nada.')
  } else if (totalMB < 200) {
    console.log('  🟡 Uso moderado. Si los snapshots dominan, considerar podar los >90 días.')
    console.log('     El polling se puede dejar en 30s.')
  } else if (totalMB < 400) {
    console.log('  🟠 Uso alto. Conviene podar snapshots viejos.')
    console.log('     Considerar también bajar polling a 60s.')
  } else {
    console.log('  🔴 Cerca del cupo. Priority: podar snapshots + bajar polling.')
  }
  console.log()
  console.log('Notas:')
  console.log('  • Los tamaños son ESTIMADOS por muestreo, no exactos (no incluyen índices ni overhead).')
  console.log('  • Postgres usa típicamente +20-30% más que el tamaño crudo de datos.')
  console.log('  • Los índices pueden duplicar el tamaño de algunas tablas con FK frecuentes.')
}

main().catch(err => {
  console.error('\nFatal:', err)
  process.exit(1)
})
