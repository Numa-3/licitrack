import { admin } from '../db.js'
import { snapshotByNoticeUid } from './fetcher.js'
import { diffPrecontractualSnapshots, hashPrecontractualSnapshot, findNextDeadline } from './diff.js'
import { scrapeOpportunityDetail, shouldTriggerRescrape, type BasicProcessInfo, type CronogramaEvento } from './scraper.js'
import type { PrecontractualSnapshot } from './types.js'

type MonitoredProcess = {
  id: string
  notice_uid: string | null
  secop_process_id: string
  api_pending?: boolean
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
      .select('id, notice_uid, secop_process_id, api_pending')
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
  // 1. Try the public API first (cheap, fast, no captcha cost)
  let snapshot: PrecontractualSnapshot | null = null
  let apiFound = false
  try {
    snapshot = await snapshotByNoticeUid(proc.notice_uid!)
    apiFound = true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // "No records found" → proceso aún no indexado, caemos a scraper-first
    if (!/No records found/i.test(msg)) throw err
    console.log(`[Precontractual] ${proc.notice_uid}: API vacía, fallback a scraper-first`)
  }

  // 2. Load latest snapshot to compare / preserve cronograma
  const { data: latest } = await admin
    .from('secop_process_snapshots')
    .select('snapshot_json, hash')
    .eq('process_id', proc.id)
    .in('source_type', ['api_precontractual', 'scraper_bootstrap'])
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const previous = (latest?.snapshot_json as PrecontractualSnapshot | null) || null
  const isBootstrap = !previous

  // 3. Decidir si necesitamos scrapear con captcha
  let needsScrape = false
  if (!apiFound) {
    // API vacía → siempre scrape si no tenemos snapshot aún (bootstrap).
    // Si ya tenemos snapshot del scraper, el throttle depende de si la
    // extracción anterior fue completa: 6h normal, 30 min si faltaba entidad
    // (probablemente por selectores desactualizados o página parcialmente cargada).
    if (isBootstrap) {
      needsScrape = true
    } else {
      const lastCaptured = previous?.cronograma_captured_at
      const age = lastCaptured ? Date.now() - new Date(lastCaptured).getTime() : Infinity
      const wasComplete = !!previous?.entidad
      const throttleMs = wasComplete ? 6 * 60 * 60 * 1000 : 30 * 60 * 1000
      needsScrape = age > throttleMs
    }
  } else if (isBootstrap) {
    // API encontró el proceso y es la primera vez: scrape para capturar cronograma con horas
    needsScrape = true
  } else if (previous && snapshot) {
    // API + snapshot previo: scrape solo si cambió algo relevante
    needsScrape = shouldTriggerRescrape({
      faseChanged: previous.fase_actual !== snapshot.fase_actual,
      deadlineChanged:
        previous.phases.at(-1)?.fecha_recepcion !== snapshot.phases.at(-1)?.fecha_recepcion
        || previous.phases.at(-1)?.fecha_apertura_efectiva !== snapshot.phases.at(-1)?.fecha_apertura_efectiva,
      awardedTransitioned: !previous.adjudicado && snapshot.adjudicado,
    })
  }

  let scrapedCronograma: CronogramaEvento[] | null = null
  let scrapedBasicInfo: BasicProcessInfo | null = null
  let scrapedAt: string | null = null
  if (needsScrape) {
    try {
      const reason = !apiFound ? 'scraper-first' : (isBootstrap ? 'bootstrap' : 're-scrape')
      console.log(`[Precontractual] ${proc.notice_uid}: ${reason} (captcha)`)
      const scraped = await scrapeOpportunityDetail(proc.notice_uid!)
      scrapedCronograma = scraped.cronograma
      scrapedBasicInfo = scraped.basic_info
      scrapedAt = scraped.scraped_at
    } catch (err) {
      console.error(`[Precontractual] ${proc.notice_uid}: scrape falló:`,
        err instanceof Error ? err.message : err)
    }
  }

  // 4. Si no hay snapshot de la API y no pudimos scrapear, no hay nada que persistir
  if (!snapshot && !scrapedCronograma && !scrapedBasicInfo) {
    console.log(`[Precontractual] ${proc.notice_uid}: sin datos de API ni scraper — skip`)
    await admin.from('secop_processes')
      .update({ last_monitored_at: new Date().toISOString() })
      .eq('id', proc.id)
    return { changesFound: 0 }
  }

  // 5. Si API vacía pero scraper funcionó, construir snapshot mínimo desde scraper
  if (!snapshot && (scrapedCronograma || scrapedBasicInfo)) {
    snapshot = buildMinimalSnapshotFromScraper(proc.notice_uid!, scrapedBasicInfo, scrapedCronograma, scrapedAt)
  } else if (snapshot) {
    // Preservar cronograma previo si el scrape no nos dio uno nuevo
    if (scrapedCronograma) {
      snapshot.cronograma = scrapedCronograma
      snapshot.cronograma_captured_at = scrapedAt
    } else if (previous?.cronograma) {
      snapshot.cronograma = previous.cronograma
      snapshot.cronograma_captured_at = previous.cronograma_captured_at
    }
  }

  if (!snapshot) {
    // Defensive: should never happen after above branches
    return { changesFound: 0 }
  }

  // 4. Hash (now includes cronograma) — decide if there's anything new to persist
  const snapshotHash = hashPrecontractualSnapshot(snapshot)

  if (latest?.hash === snapshotHash) {
    // Aunque el snapshot no cambió, recalculamos next_deadline porque depende
    // de Date.now() — eventos que eran futuros ayer pueden ser pasado hoy.
    // Sin esto, el "Próximo deadline" del UI queda anclado a la fecha vieja
    // y muestra eventos ya vencidos hasta que SECOP cambie algo.
    const { deadline, label } = findNextDeadline(snapshot)
    await admin.from('secop_processes')
      .update({
        last_monitored_at: new Date().toISOString(),
        next_deadline: deadline,
        next_deadline_label: label,
      })
      .eq('id', proc.id)
    return { changesFound: 0 }
  }

  // Persist new snapshot — distinct source_type to flag scraper-only records
  const { error: insertError } = await admin.from('secop_process_snapshots').insert({
    process_id: proc.id,
    snapshot_json: snapshot,
    source_type: apiFound ? 'api_precontractual' : 'scraper_bootstrap',
    hash: snapshotHash,
  })
  if (insertError) {
    console.error(`[Precontractual] ${proc.notice_uid}: snapshot insert FAILED:`, insertError.message, insertError.code)
    // No seguimos con diff/update si el snapshot no se pudo persistir
    return { changesFound: 0 }
  }

  // Diff
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

  // Keep process row fields in sync for UI display.
  // CRÍTICO: entidad y objeto son NOT NULL en el schema → si el scrape
  // devuelve null (extracción parcial), escribir null tumba el UPDATE entero
  // silenciosamente. Por eso solo asignamos campos con valor no-null: así
  // preservamos datos anteriores y nunca perdemos info por un scrape parcial.
  const { deadline, label } = findNextDeadline(snapshot)
  const updatePayload: Record<string, unknown> = {
    last_monitored_at: new Date().toISOString(),
    next_deadline: deadline,
    next_deadline_label: label,
    adjudicado: snapshot.adjudicado,
  }
  const setIfPresent = <T>(key: string, value: T | null | undefined) => {
    if (value !== null && value !== undefined && value !== '') {
      updatePayload[key] = value
    }
  }
  setIfPresent('entidad', snapshot.entidad)
  setIfPresent('objeto', snapshot.nombre_procedimiento)
  setIfPresent('estado', snapshot.estado_actual)
  setIfPresent('nit_entidad', snapshot.nit_entidad)
  setIfPresent('modalidad', snapshot.modalidad)
  setIfPresent('fase', snapshot.fase_actual)
  setIfPresent('id_portafolio', snapshot.phases[0]?.id_del_portafolio)
  setIfPresent('precio_base', snapshot.precio_base)
  setIfPresent('nit_adjudicado', snapshot.proveedor_adjudicado?.nit)
  setIfPresent('nombre_adjudicado', snapshot.proveedor_adjudicado?.nombre)
  setIfPresent('valor_adjudicado', snapshot.proveedor_adjudicado?.valor)

  // Si la API ahora sí encontró el proceso, limpiamos el flag pending
  if (apiFound && proc.api_pending) {
    updatePayload.api_pending = false
    console.log(`[Precontractual] ${proc.notice_uid}: api_pending → false (API lo indexó)`)
  }
  const { error: updateError } = await admin.from('secop_processes').update(updatePayload).eq('id', proc.id)
  if (updateError) {
    console.error(`[Precontractual] ${proc.notice_uid}: update FAILED:`, updateError.message, updateError.code)
  }

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

/**
 * Build a minimal PrecontractualSnapshot from scraper data when the public
 * API hasn't indexed the process yet. Fields absent from the scraper are
 * left null — the monitor keeps retrying the API and enriches when it appears.
 */
function buildMinimalSnapshotFromScraper(
  noticeUid: string,
  basic: BasicProcessInfo | null,
  cronograma: CronogramaEvento[] | null,
  scrapedAt: string | null,
): PrecontractualSnapshot {
  return {
    notice_uid: noticeUid,
    url_publica: `https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=${noticeUid}&isFromPublicArea=True&isModal=False`,
    entidad: basic?.entidad || null,
    nit_entidad: basic?.nit_entidad || null,
    departamento: null,
    ciudad: null,
    orden_entidad: null,
    unidad_contratacion: null,
    nombre_procedimiento: basic?.objeto || null,
    descripcion: basic?.descripcion || null,
    modalidad: basic?.modalidad || null,
    justificacion_modalidad: null,
    tipo_contrato: basic?.tipo_contrato || null,
    categoria_principal: null,
    precio_base: basic?.precio_base || null,
    fase_actual: basic?.fase || null,
    estado_actual: basic?.estado || null,
    adjudicado: false,
    proveedor_adjudicado: null,
    phases: [],
    cronograma: cronograma || null,
    cronograma_captured_at: scrapedAt,
    scraped_at: scrapedAt || new Date().toISOString(),
  }
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
