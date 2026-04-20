import { admin } from '../db.js'
import { snapshotByNoticeUid } from './fetcher.js'
import { diffPrecontractualSnapshots, hashPrecontractualSnapshot, findNextDeadline } from './diff.js'
import { scrapeOpportunityDetail, shouldTriggerRescrape } from './scraper.js'
import type { PrecontractualSnapshot } from './types.js'

type MonitoredProcess = {
  id: string
  notice_uid: string | null
  secop_process_id: string
}

/**
 * Run a full monitoring cycle for precontractual processes.
 *
 * Unlike the contractual monitor, this one uses the public SECOP II API
 * (p6dx-8zbt) — no login, no browser, no captcha. Each process takes ~200ms.
 */
export async function runPrecontractualMonitorCycle(): Promise<{ checked: number; changes: number }> {
  const { data: logEntry } = await admin
    .from('secop_monitor_log')
    .insert({ status: 'running' })
    .select('id')
    .single()

  const logId = logEntry?.id
  let totalChecked = 0
  let totalChanges = 0

  try {
    const { data: processes } = await admin
      .from('secop_processes')
      .select('id, notice_uid, secop_process_id')
      .eq('monitoring_enabled', true)
      .eq('tipo_proceso', 'precontractual')
      .not('notice_uid', 'is', null)

    if (!processes || processes.length === 0) {
      console.log('[Precontractual] No processes to check')
      await finishLog(logId, 'success', 0, 0)
      return { checked: 0, changes: 0 }
    }

    console.log(`[Precontractual] ${processes.length} processes to check`)

    // Load our own company NITs so diff can classify awards as "to us"
    const { data: accounts } = await admin
      .from('secop_accounts')
      .select('monitored_entities, discovered_entities')
    const ourNits = collectNitsFromAccounts(accounts || [])

    for (const proc of (processes as MonitoredProcess[])) {
      if (!proc.notice_uid) continue
      try {
        const result = await monitorOneProcess(proc, ourNits)
        totalChecked++
        totalChanges += result.changesFound
      } catch (err) {
        console.error(`[Precontractual] Error on ${proc.notice_uid}:`,
          err instanceof Error ? err.message : err)
      }
      // Be nice to the API
      await new Promise(r => setTimeout(r, 500))
    }

    await finishLog(logId, 'success', totalChecked, totalChanges)
    console.log(`[Precontractual] Done: ${totalChecked} checked, ${totalChanges} changes`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[Precontractual] Fatal:', msg)
    await finishLog(logId, 'error', totalChecked, totalChanges, msg)
  }

  return { checked: totalChecked, changes: totalChanges }
}

async function monitorOneProcess(
  proc: MonitoredProcess,
  ourNits: Set<string>,
): Promise<{ changesFound: number }> {
  // 1. Pull from the public API (no captcha) — cheap, fast, no cost
  const snapshot = await snapshotByNoticeUid(proc.notice_uid!)

  // 2. Inspect the last snapshot to decide whether to re-scrape with captcha
  const { data: latest } = await admin
    .from('secop_process_snapshots')
    .select('snapshot_json, hash')
    .eq('process_id', proc.id)
    .eq('source_type', 'api_precontractual')
    .order('captured_at', { ascending: false })
    .limit(1)
    .single()

  const previous = (latest?.snapshot_json as PrecontractualSnapshot | null) || null

  // Preserve previous cronograma (captcha-scraped) unless we re-scrape
  if (previous?.cronograma) {
    snapshot.cronograma = previous.cronograma
    snapshot.cronograma_captured_at = previous.cronograma_captured_at
  }

  // 3. Decide whether to re-scrape OpportunityDetail (costs 1 captcha)
  //    We only do this when the API signals something worth re-checking:
  //    new phase, changed key dates, or brand-new award.
  const needsRescrape = previous ? shouldTriggerRescrape({
    faseChanged: previous.fase_actual !== snapshot.fase_actual,
    deadlineChanged:
      previous.phases.at(-1)?.fecha_recepcion !== snapshot.phases.at(-1)?.fecha_recepcion
      || previous.phases.at(-1)?.fecha_apertura_efectiva !== snapshot.phases.at(-1)?.fecha_apertura_efectiva,
    awardedTransitioned: !previous.adjudicado && snapshot.adjudicado,
  }) : false

  // Bootstrap case: first snapshot of this process → capture cronograma with hours
  const isBootstrap = !previous
  if (isBootstrap || needsRescrape) {
    try {
      console.log(`[Precontractual] ${proc.notice_uid}: ${isBootstrap ? 'bootstrap' : 're-scrape'} (captcha)`)
      const scraped = await scrapeOpportunityDetail(proc.notice_uid!)
      snapshot.cronograma = scraped.cronograma
      snapshot.cronograma_captured_at = scraped.scraped_at
    } catch (err) {
      console.error(`[Precontractual] ${proc.notice_uid}: scrape failed, keeping previous cronograma:`,
        err instanceof Error ? err.message : err)
    }
  }

  // 4. Hash (now includes cronograma) — decide if there's anything new to persist
  const snapshotHash = hashPrecontractualSnapshot(snapshot)

  if (latest?.hash === snapshotHash) {
    await admin.from('secop_processes')
      .update({ last_monitored_at: new Date().toISOString() })
      .eq('id', proc.id)
    return { changesFound: 0 }
  }

  // 5. Persist new snapshot
  await admin.from('secop_process_snapshots').insert({
    process_id: proc.id,
    snapshot_json: snapshot,
    source_type: 'api_precontractual',
    hash: snapshotHash,
  })

  // 6. Diff
  const changes = diffPrecontractualSnapshots(previous, snapshot, ourNits)

  if (changes.length > 0) {
    const rows = changes.map(c => ({
      process_id: proc.id,
      change_type: c.change_type,
      priority: c.priority,
      before_json: c.before_json,
      after_json: c.after_json,
      summary: c.summary,
    }))
    const { error: insertError } = await admin.from('secop_process_changes').insert(rows)
    if (insertError) {
      console.error(`[Precontractual] Failed to save changes for ${proc.notice_uid}:`, insertError.message)
    }
  }

  // Keep process row fields in sync for UI display
  const { deadline, label } = findNextDeadline(snapshot)
  await admin.from('secop_processes').update({
    last_monitored_at: new Date().toISOString(),
    next_deadline: deadline,
    next_deadline_label: label,
    entidad: snapshot.entidad,
    objeto: snapshot.nombre_procedimiento,
    estado: snapshot.estado_actual,
    nit_entidad: snapshot.nit_entidad,
    modalidad: snapshot.modalidad,
    fase: snapshot.fase_actual,
    id_portafolio: snapshot.phases[0]?.id_del_portafolio || null,
    precio_base: snapshot.precio_base,
    adjudicado: snapshot.adjudicado,
    nit_adjudicado: snapshot.proveedor_adjudicado?.nit || null,
    nombre_adjudicado: snapshot.proveedor_adjudicado?.nombre || null,
    valor_adjudicado: snapshot.proveedor_adjudicado?.valor || null,
  }).eq('id', proc.id)

  if (changes.length > 0) {
    console.log(`[Precontractual] ${proc.notice_uid}: ${changes.length} change(s) detected`)
    for (const c of changes) {
      console.log(`[Precontractual]   [${c.priority}] ${c.summary}`)
    }
  } else {
    console.log(`[Precontractual] ${proc.notice_uid}: first snapshot saved`)
  }

  return { changesFound: changes.length }
}

function collectNitsFromAccounts(
  accounts: { monitored_entities: unknown; discovered_entities: unknown }[],
): Set<string> {
  const nits = new Set<string>()
  for (const acc of accounts) {
    for (const field of [acc.monitored_entities, acc.discovered_entities]) {
      if (!Array.isArray(field)) continue
      for (const entity of field) {
        if (entity && typeof entity === 'object' && 'nit' in entity) {
          const nit = (entity as { nit: unknown }).nit
          if (typeof nit === 'string' && nit.trim()) nits.add(nit.trim())
        }
      }
    }
  }
  return nits
}

async function finishLog(
  logId: string | undefined,
  status: 'success' | 'error',
  checked: number,
  changes: number,
  errorMessage?: string,
) {
  if (!logId) return
  await admin.from('secop_monitor_log').update({
    finished_at: new Date().toISOString(),
    status,
    processes_checked: checked,
    changes_found: changes,
    error_message: errorMessage || null,
  }).eq('id', logId)
}

/**
 * Run a single process monitoring pass. Used by /api/.../precontractual
 * to bootstrap a newly-added process (first snapshot + captcha-captured
 * cronograma) without waiting for the next full cycle.
 */
export async function monitorOneNow(processId: string): Promise<{ changesFound: number } | { error: string }> {
  const { data: proc } = await admin
    .from('secop_processes')
    .select('id, notice_uid, secop_process_id')
    .eq('id', processId)
    .single()

  if (!proc || !proc.notice_uid) {
    return { error: 'Proceso no encontrado o sin notice_uid' }
  }

  const { data: accounts } = await admin
    .from('secop_accounts')
    .select('monitored_entities, discovered_entities')
  const ourNits = new Set<string>()
  for (const acc of accounts || []) {
    for (const field of [acc.monitored_entities, acc.discovered_entities]) {
      if (!Array.isArray(field)) continue
      for (const entity of field) {
        if (entity && typeof entity === 'object' && 'nit' in entity) {
          const nit = (entity as { nit: unknown }).nit
          if (typeof nit === 'string' && nit.trim()) ourNits.add(nit.trim())
        }
      }
    }
  }

  try {
    return await monitorOneProcess(proc as MonitoredProcess, ourNits)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' }
  }
}
