import { requireAuth } from '@/lib/admin'
import { parseCronogramaFromSnapshot } from '@/lib/secop/cronograma'
import type { Phase } from '@/lib/secop/phase'
import type { SupabaseClient } from '@supabase/supabase-js'

export type CalendarEvent = {
  id: string                            // estable: process_id + event_name + date
  process_id: string                    // uuid de secop_processes
  process_name: string                  // custom_name || entidad
  objeto: string
  account_id: string | null
  account_name: string | null
  phase: Phase
  type: 'deadline' | 'change'
  event_name: string
  date: string                          // ISO
  end_date: string | null
  status: 'upcoming' | 'active' | 'past'
  urgency: 'urgent' | 'this_week' | 'upcoming' | 'past'
  priority?: 'high' | 'medium' | 'low'  // solo para type='change'
}

export type CalendarProcess = {
  id: string
  name: string
  account_id: string | null
  account_name: string | null
  phase: Phase
}

export type CalendarResponse = {
  events: CalendarEvent[]
  processes: CalendarProcess[]
}

function deriveUrgency(dateIso: string): CalendarEvent['urgency'] {
  const ms = new Date(dateIso).getTime() - Date.now()
  if (ms < 0) return 'past'
  const days = ms / (24 * 60 * 60 * 1000)
  if (days < 2) return 'urgent'
  if (days < 7) return 'this_week'
  return 'upcoming'
}

function derivePhaseFromRow(row: {
  phase_override: string | null
  tipo_proceso: string | null
}): Phase {
  if (row.phase_override === 'pre' || row.phase_override === 'contractual' || row.phase_override === 'post') {
    return row.phase_override
  }
  if (row.tipo_proceso === 'precontractual') return 'pre'
  return 'contractual'
}

/**
 * Carga todos los eventos del calendario (deadlines del cronograma + cambios
 * detectados) en el rango [from, to]. Se llama desde el route handler GET y
 * directamente desde server components para SSR.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchCalendarEvents(supabase: SupabaseClient<any>, range: {
  from: Date
  to: Date
}): Promise<CalendarResponse> {
  const fromIso = range.from.toISOString()
  const toIso = range.to.toISOString()

  // 1) Todos los procesos monitoreados + cuenta + último snapshot relevante
  const { data: procs } = await supabase
    .from('secop_processes')
    .select(`
      id,
      entidad,
      custom_name,
      objeto,
      tipo_proceso,
      phase_override,
      account_id,
      secop_accounts!secop_processes_account_id_fkey(name)
    `)
    .eq('monitoring_enabled', true)

  const events: CalendarEvent[] = []
  const processes: CalendarProcess[] = []

  for (const p of procs || []) {
    const phase = derivePhaseFromRow({
      phase_override: p.phase_override,
      tipo_proceso: p.tipo_proceso,
    })
    const accountObj = Array.isArray(p.secop_accounts) ? p.secop_accounts[0] : p.secop_accounts
    const accountName: string | null = accountObj?.name ?? null
    const name = p.custom_name || p.entidad
    processes.push({
      id: p.id,
      name,
      account_id: p.account_id,
      account_name: accountName,
      phase,
    })

    // Snapshot más reciente que aporte cronograma
    const { data: snap } = await supabase
      .from('secop_process_snapshots')
      .select('snapshot_json')
      .eq('process_id', p.id)
      .in('source_type', ['page_scrape', 'api_precontractual', 'scraper_bootstrap'])
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!snap?.snapshot_json) continue

    const cronograma = parseCronogramaFromSnapshot(snap.snapshot_json)
    for (const ev of cronograma) {
      const dateIso = ev.end_date || ev.start_date
      if (!dateIso) continue
      const ms = new Date(dateIso).getTime()
      if (isNaN(ms)) continue
      if (ms < range.from.getTime() || ms > range.to.getTime()) continue
      events.push({
        id: `${p.id}-${ev.event_name}-${dateIso}`,
        process_id: p.id,
        process_name: name,
        objeto: p.objeto,
        account_id: p.account_id,
        account_name: accountName,
        phase,
        type: 'deadline',
        event_name: ev.event_name,
        date: dateIso,
        end_date: ev.end_date,
        status: ev.status,
        urgency: deriveUrgency(dateIso),
      })
    }
  }

  // 2) Cambios detectados — SOLO pasados/presentes (backlog #16)
  const now = new Date()
  const changesTo = now < range.to ? now : range.to
  if (changesTo > range.from) {
    const { data: changes } = await supabase
      .from('secop_process_changes')
      .select(`
        id,
        process_id,
        summary,
        priority,
        detected_at,
        secop_processes!inner(
          id,
          entidad,
          custom_name,
          objeto,
          tipo_proceso,
          phase_override,
          account_id,
          secop_accounts!secop_processes_account_id_fkey(name)
        )
      `)
      .gte('detected_at', range.from.toISOString())
      .lte('detected_at', changesTo.toISOString())
      .order('detected_at', { ascending: false })

    for (const ch of changes || []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const proc: any = Array.isArray(ch.secop_processes) ? ch.secop_processes[0] : ch.secop_processes
      if (!proc) continue
      const procAccountObj = Array.isArray(proc.secop_accounts) ? proc.secop_accounts[0] : proc.secop_accounts
      const procAccountName: string | null = procAccountObj?.name ?? null
      const phase = derivePhaseFromRow({
        phase_override: proc.phase_override,
        tipo_proceso: proc.tipo_proceso,
      })
      events.push({
        id: `change-${ch.id}`,
        process_id: ch.process_id,
        process_name: proc.custom_name || proc.entidad,
        objeto: proc.objeto,
        account_id: proc.account_id,
        account_name: procAccountName,
        phase,
        type: 'change',
        event_name: ch.summary,
        date: ch.detected_at,
        end_date: null,
        status: 'past',
        urgency: 'past',
        priority: ch.priority as 'high' | 'medium' | 'low',
      })
    }
  }

  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  return { events, processes }
}

export async function GET(request: Request) {
  const auth = await requireAuth()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { searchParams } = new URL(request.url)
  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')

  if (!fromParam || !toParam) {
    return Response.json({ error: 'from y to son requeridos (YYYY-MM-DD)' }, { status: 400 })
  }

  const from = new Date(fromParam + 'T00:00:00-05:00')
  const to = new Date(toParam + 'T23:59:59-05:00')
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return Response.json({ error: 'Fechas inválidas' }, { status: 400 })
  }

  return Response.json(await fetchCalendarEvents(supabase, { from, to }))
}
