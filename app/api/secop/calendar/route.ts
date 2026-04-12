import { requireAuth } from '@/lib/admin'

type CalendarEvent = {
  date: string
  type: 'deadline' | 'change'
  label: string
  process_id: string
  entidad: string
  objeto: string
  priority: 'high' | 'medium' | 'low'
  secop_process_id: string
}

/**
 * GET /api/secop/calendar?month=2026-04
 * Returns calendar events for a given month.
 */
export async function GET(request: Request) {
  const auth = await requireAuth()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { searchParams } = new URL(request.url)
  const monthParam = searchParams.get('month')

  // Parse month or default to current
  const now = new Date()
  let year = now.getFullYear()
  let month = now.getMonth() // 0-indexed

  if (monthParam) {
    const [y, m] = monthParam.split('-').map(Number)
    if (y && m) { year = y; month = m - 1 }
  }

  const startOfMonth = new Date(year, month, 1).toISOString()
  const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59).toISOString()

  const [{ data: processes }, { data: changes }] = await Promise.all([
    // Monitored processes with deadlines in this month
    supabase
      .from('secop_processes')
      .select('id, secop_process_id, entidad, objeto, next_deadline, next_deadline_label')
      .eq('monitoring_enabled', true)
      .not('next_deadline', 'is', null)
      .gte('next_deadline', startOfMonth)
      .lte('next_deadline', endOfMonth),

    // Changes detected in this month
    supabase
      .from('secop_process_changes')
      .select(`
        id, detected_at, summary, priority, change_type,
        secop_processes!secop_process_changes_process_id_fkey (
          id, secop_process_id, entidad, objeto
        )
      `)
      .gte('detected_at', startOfMonth)
      .lte('detected_at', endOfMonth)
      .order('detected_at', { ascending: true }),
  ])

  const events: CalendarEvent[] = []

  // Deadline events
  if (processes) {
    for (const p of processes) {
      if (!p.next_deadline) continue
      const deadlineDate = new Date(p.next_deadline)
      const hoursLeft = (deadlineDate.getTime() - Date.now()) / (60 * 60 * 1000)
      const isPast = hoursLeft < 0

      events.push({
        date: deadlineDate.toISOString().slice(0, 10),
        type: 'deadline',
        label: p.next_deadline_label || 'Deadline',
        process_id: p.id,
        entidad: p.entidad,
        objeto: (p.objeto || '').slice(0, 80),
        priority: isPast ? 'high' : hoursLeft < 48 ? 'high' : hoursLeft < 168 ? 'medium' : 'low',
        secop_process_id: p.secop_process_id,
      })
    }
  }

  // Change events
  if (changes) {
    for (const c of changes) {
      const raw = c.secop_processes
      const proc = Array.isArray(raw) ? raw[0] : raw
      if (!proc) continue

      events.push({
        date: new Date(c.detected_at).toISOString().slice(0, 10),
        type: 'change',
        label: c.summary,
        process_id: proc.id,
        entidad: proc.entidad,
        objeto: (proc.objeto || '').slice(0, 80),
        priority: c.priority as 'high' | 'medium' | 'low',
        secop_process_id: proc.secop_process_id,
      })
    }
  }

  return Response.json({ events, month: `${year}-${String(month + 1).padStart(2, '0')}` })
}
