import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchSecopProcesses, deduplicateProcesses, type SecopProcess, type WatchRule } from './dataset'

// ── Radar service ───────────────────────────────────────────
// Orchestrates: fetch rules → query SECOP → upsert processes → log run

type PollResult = {
  recordsFetched: number
  newProcesses: number
  updatedProcesses: number
}

/**
 * Run the full radar poll cycle.
 * Uses a service_role Supabase client (bypasses RLS).
 */
export async function runRadarPoll(admin: SupabaseClient): Promise<PollResult> {
  // 1. Create poll log entry
  const { data: logEntry } = await admin
    .from('secop_poll_log')
    .insert({ status: 'running' })
    .select('id')
    .single()

  const logId = logEntry?.id

  try {
    // 2. Fetch enabled watch rules
    const { data: rules } = await admin
      .from('secop_watch_rules')
      .select('rule_json')
      .eq('enabled', true)

    if (!rules || rules.length === 0) {
      await finishLog(admin, logId, 'success', { recordsFetched: 0, newProcesses: 0, updatedProcesses: 0 })
      return { recordsFetched: 0, newProcesses: 0, updatedProcesses: 0 }
    }

    // 3. Fetch processes for each rule
    const allProcesses: SecopProcess[] = []
    for (const r of rules) {
      const ruleJson = r.rule_json as WatchRule
      const processes = await fetchSecopProcesses(ruleJson)
      allProcesses.push(...processes)
    }

    const unique = deduplicateProcesses(allProcesses)

    // 4. Upsert into database
    const result = await upsertProcesses(admin, unique)

    // 5. Finish log
    await finishLog(admin, logId, 'success', result)

    return result
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await finishLog(admin, logId, 'error', { recordsFetched: 0, newProcesses: 0, updatedProcesses: 0 }, msg)
    throw err
  }
}

// ── Upsert logic ────────────────────────────────────────────

async function upsertProcesses(
  admin: SupabaseClient,
  processes: SecopProcess[],
): Promise<PollResult> {
  if (processes.length === 0) {
    return { recordsFetched: 0, newProcesses: 0, updatedProcesses: 0 }
  }

  // Get existing process IDs and their hashes
  const secopIds = processes.map(p => p.secop_process_id)

  // Fetch in batches of 500 to avoid query size limits
  const existingMap = new Map<string, { id: string; dataset_hash: string; radar_state: string }>()
  for (let i = 0; i < secopIds.length; i += 500) {
    const batch = secopIds.slice(i, i + 500)
    const { data: existing } = await admin
      .from('secop_processes')
      .select('id, secop_process_id, dataset_hash, radar_state')
      .in('secop_process_id', batch)

    if (existing) {
      for (const e of existing) {
        existingMap.set(e.secop_process_id, e)
      }
    }
  }

  let newCount = 0
  let updatedCount = 0

  const toInsert: Record<string, unknown>[] = []
  const toUpdate: { id: string; data: Record<string, unknown> }[] = []

  for (const p of processes) {
    const existing = existingMap.get(p.secop_process_id)

    if (!existing) {
      // New process
      toInsert.push({ ...p, radar_state: 'new', first_seen_at: new Date().toISOString() })
      newCount++
    } else if (existing.dataset_hash !== p.dataset_hash) {
      // Existing process with changes
      toUpdate.push({
        id: existing.id,
        data: {
          fase: p.fase,
          estado: p.estado,
          estado_resumen: p.estado_resumen,
          valor_estimado: p.valor_estimado,
          valor_adjudicacion: p.valor_adjudicacion,
          fecha_ultima_pub: p.fecha_ultima_pub,
          dataset_hash: p.dataset_hash,
          last_seen_at: new Date().toISOString(),
        },
      })
      updatedCount++
    } else {
      // No changes — just bump last_seen_at
      toUpdate.push({
        id: existing.id,
        data: { last_seen_at: new Date().toISOString() },
      })
    }
  }

  // Batch insert new processes
  if (toInsert.length > 0) {
    for (let i = 0; i < toInsert.length; i += 100) {
      const batch = toInsert.slice(i, i + 100)
      const { error } = await admin.from('secop_processes').insert(batch)
      if (error) {
        console.error('[SECOP Radar] Insert error:', error.message)
      }
    }
  }

  // Update existing processes
  for (const u of toUpdate) {
    await admin.from('secop_processes').update(u.data).eq('id', u.id)
  }

  return {
    recordsFetched: processes.length,
    newProcesses: newCount,
    updatedProcesses: updatedCount,
  }
}

// ── Logging helpers ─────────────────────────────────────────

async function finishLog(
  admin: SupabaseClient,
  logId: string | undefined,
  status: 'success' | 'error',
  result: PollResult,
  errorMessage?: string,
) {
  if (!logId) return
  await admin.from('secop_poll_log').update({
    finished_at: new Date().toISOString(),
    status,
    records_fetched: result.recordsFetched,
    new_processes: result.newProcesses,
    updated_processes: result.updatedProcesses,
    error_message: errorMessage || null,
  }).eq('id', logId)
}
