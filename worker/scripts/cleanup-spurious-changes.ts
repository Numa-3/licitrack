/**
 * One-shot cleanup para falsos positivos generados por el diff antes del fix
 * `0a93bc6` (Apr 28 10:36). Esos rows quedaron en DB y aparecen en "Cambios
 * recientes" del UI con summaries del tipo:
 *
 *   • "Fecha fin: 09/05/2026 23:59 → 09/05/2026 23:59"  (mismo valor)
 *   • "Fecha fin: fecha desconocida → 09/05/2026 23:59"  (parser flicker)
 *   • "Documento de ejecución: X (antes: 3 docs, ahora: 3)"  (count igual)
 *   • "Nuevo documento: X (antes: 5 docs, ahora: 5)"  (count igual)
 *   • "Proveedor eliminó documento: X (antes: 4, ahora: 4)"  (count igual)
 *
 * Ninguno de estos se generaría con el código actual del diff porque:
 *   - extractCanonicalDate normaliza fechas antes de comparar
 *   - normDocName normaliza nombres de documentos antes de comparar
 *
 * Default es DRY-RUN. Para borrar:
 *   npx tsx scripts/cleanup-spurious-changes.ts --confirm
 */
import { admin } from '../src/db.js'

const DRY_RUN = !process.argv.includes('--confirm')

type ChangeRow = {
  id: string
  process_id: string
  summary: string
  detected_at: string
}

// Patterns que detectan summaries falsos
const PATTERNS = [
  {
    name: 'fecha_fin: same canonical',
    rx: /^Fecha fin: (.+?) → (.+?)$/,
    isSpurious: (m: RegExpMatchArray) => m[1].trim() === m[2].trim(),
  },
  {
    name: 'fecha_fin: from "fecha desconocida"',
    rx: /^Fecha fin: fecha desconocida → /,
    isSpurious: () => true,
  },
  {
    name: 'fecha_fin: to "fecha desconocida"',
    rx: / → fecha desconocida$/,
    isSpurious: (m: RegExpMatchArray) => m.input?.startsWith('Fecha fin:') ?? false,
  },
  {
    name: 'doc count: antes === ahora',
    rx: /\(antes: (\d+)(?:\s+docs?)?,\s+ahora: (\d+)\)$/,
    isSpurious: (m: RegExpMatchArray) => m[1] === m[2],
  },
]

function matchSpurious(summary: string): string | null {
  for (const p of PATTERNS) {
    const m = summary.match(p.rx)
    if (m && p.isSpurious(m)) return p.name
  }
  return null
}

async function main() {
  console.log(`═══ Cleanup spurious changes (pre-fix 0a93bc6) ═══`)
  console.log(`Modo: ${DRY_RUN ? 'DRY-RUN (no borra nada)' : 'CONFIRM (borrado real)'}`)
  console.log()

  const pageSize = 1000
  const spurious: { id: string; summary: string; reason: string }[] = []
  let total = 0

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from('secop_process_changes')
      .select('id, process_id, summary, detected_at')
      .range(from, from + pageSize - 1)

    if (error) {
      console.error('SELECT failed:', error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) break
    total += data.length

    for (const row of data as ChangeRow[]) {
      if (!row.summary) continue
      const reason = matchSpurious(row.summary)
      if (reason) spurious.push({ id: row.id, summary: row.summary, reason })
    }

    if (data.length < pageSize) break
  }

  console.log(`Total changes scaneados: ${total}`)
  console.log(`Spurious detectados: ${spurious.length}`)

  if (spurious.length === 0) {
    console.log('Nada para limpiar.')
    return
  }

  // Agrupar por motivo para preview
  const byReason = new Map<string, number>()
  for (const s of spurious) byReason.set(s.reason, (byReason.get(s.reason) ?? 0) + 1)

  console.log(`\nDesglose por patrón:`)
  for (const [reason, count] of byReason) {
    console.log(`  • ${count}× ${reason}`)
  }

  // Sample (3 por patrón)
  console.log(`\nSamples:`)
  const seen = new Map<string, number>()
  for (const s of spurious) {
    const c = seen.get(s.reason) ?? 0
    if (c >= 3) continue
    seen.set(s.reason, c + 1)
    console.log(`  [${s.reason}]`)
    console.log(`     ${s.summary.slice(0, 110)}`)
  }

  if (DRY_RUN) {
    console.log(`\n💡 Dry-run. Para borrar de verdad:`)
    console.log(`   npx tsx scripts/cleanup-spurious-changes.ts --confirm`)
    return
  }

  console.log(`\nBorrando ${spurious.length} rows...`)
  const ids = spurious.map(s => s.id)

  // Borrar en batches de 200 para no exceder límites
  let deleted = 0
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200)
    const { error, count } = await admin
      .from('secop_process_changes')
      .delete({ count: 'exact' })
      .in('id', batch)
    if (error) {
      console.error(`Batch ${i / 200} failed:`, error.message)
      continue
    }
    deleted += count ?? 0
  }

  console.log(`✓ ${deleted} rows borrados (notifications cascadean por FK)`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
