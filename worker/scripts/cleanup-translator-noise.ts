/**
 * One-shot cleanup for the translator/timezone pollution bug.
 *
 *  1. Delete every secop_process_changes row whose summary or before/after JSON
 *     contains "translator.loadFile" or the "((UTC-..." timezone label.
 *     Notifications cascade via FK ON DELETE CASCADE.
 *
 *  2. Sanitize the LATEST snapshot per process (the one used as `before` next
 *     diff). Older snapshots are left alone — they're history, not used for
 *     diffing. Without this step, the first scrape post-fix would diff
 *     polluted-before vs clean-after and produce one final spurious change
 *     per affected field.
 */
import { admin } from '../src/db.js'

const TRANSLATOR_RX = /\s*translator\.loadFile[A-Za-z]*\(\$\('#[^']*'\)\s*,\s*'[^']*'\)\s*/g
const TRANSLATOR_RX_LOOSE = /\s*translator\.loadFile[A-Za-z]*\([^]*?\)\s*/g
const TIMEZONE_RX = /\s*\(\(UTC[^)]*\)[^)]*\)/g

function clean(value: unknown): unknown {
  if (typeof value !== 'string') return value
  let s = value
    .replace(TRANSLATOR_RX, '')
    .replace(TRANSLATOR_RX_LOOSE, '')
    .replace(TIMEZONE_RX, '')
    .replace(/\s+/g, ' ')
    .trim()
  return s.length === 0 ? null : s
}

function isPolluted(value: unknown): boolean {
  return typeof value === 'string'
    && (value.includes('translator.loadFile') || /\(\(UTC/.test(value))
}

function deepHasPollution(obj: unknown): boolean {
  if (typeof obj === 'string') return isPolluted(obj)
  if (Array.isArray(obj)) return obj.some(deepHasPollution)
  if (obj && typeof obj === 'object') return Object.values(obj).some(deepHasPollution)
  return false
}

type Snap = {
  info_general?: Record<string, unknown>
  condiciones?: { garantias?: Record<string, unknown>[] }
  ejecucion?: { pagos?: Record<string, unknown>[]; execution_docs?: unknown[] }
  modificaciones?: { entries?: Record<string, unknown>[] }
  docs_proveedor?: { document_names?: unknown[] }
  docs_contrato?: { documents?: Record<string, unknown>[] }
}

function sanitizeSnapshot(snap: Snap): Snap {
  if (snap.info_general) {
    for (const k of Object.keys(snap.info_general)) {
      snap.info_general[k] = clean(snap.info_general[k])
    }
  }
  for (const g of snap.condiciones?.garantias ?? []) {
    for (const k of Object.keys(g)) g[k] = clean(g[k])
  }
  for (const p of snap.ejecucion?.pagos ?? []) {
    for (const k of Object.keys(p)) p[k] = clean(p[k])
  }
  for (const m of snap.modificaciones?.entries ?? []) {
    for (const k of Object.keys(m)) m[k] = clean(m[k])
  }
  return snap
}

async function step1DeletePollutedChanges() {
  console.log('Step 1: Scan secop_process_changes for translator pollution...')

  let total = 0
  const pageSize = 1000
  const polluted: string[] = []

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from('secop_process_changes')
      .select('id, summary, before_json, after_json')
      .range(from, from + pageSize - 1)
    if (error) { console.error('Select error:', error.message); return }
    if (!data || data.length === 0) break
    total += data.length
    for (const row of data) {
      if (
        isPolluted(row.summary)
        || deepHasPollution(row.before_json)
        || deepHasPollution(row.after_json)
      ) polluted.push(row.id)
    }
    if (data.length < pageSize) break
  }

  console.log(`  Scanned ${total} change rows. Polluted: ${polluted.length}`)
  if (polluted.length === 0) return

  for (let i = 0; i < polluted.length; i += 200) {
    const batch = polluted.slice(i, i + 200)
    const { error } = await admin.from('secop_process_changes').delete().in('id', batch)
    if (error) { console.error('Delete batch error:', error.message); return }
  }
  console.log(`  Deleted ${polluted.length} change rows (notifications cascaded).`)
}

async function step2SanitizeLatestSnapshots() {
  console.log('\nStep 2: Sanitize latest snapshot per process...')

  const { data: processes, error: procErr } = await admin
    .from('secop_processes')
    .select('id, secop_process_id')
  if (procErr) { console.error('Process list error:', procErr.message); return }
  if (!processes) return

  let scanned = 0, sanitized = 0
  for (const p of processes) {
    const { data: snap } = await admin
      .from('secop_process_snapshots')
      .select('id, snapshot_json')
      .eq('process_id', p.id)
      .eq('source_type', 'page_scrape')
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!snap) continue
    scanned++
    if (!deepHasPollution(snap.snapshot_json)) continue

    const cleaned = sanitizeSnapshot(JSON.parse(JSON.stringify(snap.snapshot_json)))
    const { error } = await admin
      .from('secop_process_snapshots')
      .update({ snapshot_json: cleaned })
      .eq('id', snap.id)
    if (error) {
      console.error(`  ${p.secop_process_id}: ${error.message}`)
      continue
    }
    sanitized++
  }
  console.log(`  Scanned ${scanned} latest snapshots, sanitized ${sanitized}.`)
}

async function main() {
  await step1DeletePollutedChanges()
  await step2SanitizeLatestSnapshots()
  console.log('\nDone.')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
