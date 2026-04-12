import { getAuthUser } from '@/lib/supabase/server'
import CalendarClient from '@/components/features/CalendarClient'

export const dynamic = 'force-dynamic'

export default async function CalendarioPage() {
  const { supabase } = await getAuthUser()

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const startOfMonth = new Date(year, month, 1).toISOString()
  const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59).toISOString()

  const [{ data: processes }, { data: changes }] = await Promise.all([
    supabase
      .from('secop_processes')
      .select('id, secop_process_id, entidad, objeto, next_deadline, next_deadline_label')
      .eq('monitoring_enabled', true)
      .not('next_deadline', 'is', null)
      .gte('next_deadline', startOfMonth)
      .lte('next_deadline', endOfMonth),
    supabase
      .from('secop_process_changes')
      .select(`
        id, detected_at, summary, priority,
        secop_processes!secop_process_changes_process_id_fkey (
          id, secop_process_id, entidad, objeto
        )
      `)
      .gte('detected_at', startOfMonth)
      .lte('detected_at', endOfMonth)
      .order('detected_at', { ascending: true }),
  ])

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

  const events: CalendarEvent[] = []

  if (processes) {
    for (const p of processes) {
      if (!p.next_deadline) continue
      const d = new Date(p.next_deadline)
      const hoursLeft = (d.getTime() - Date.now()) / 3600000
      events.push({
        date: d.toISOString().slice(0, 10),
        type: 'deadline',
        label: p.next_deadline_label || 'Deadline',
        process_id: p.id,
        entidad: p.entidad,
        objeto: (p.objeto || '').slice(0, 80),
        priority: hoursLeft < 0 ? 'high' : hoursLeft < 48 ? 'high' : hoursLeft < 168 ? 'medium' : 'low',
        secop_process_id: p.secop_process_id,
      })
    }
  }

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

  return (
    <CalendarClient
      initialEvents={events}
      initialMonth={`${year}-${String(month + 1).padStart(2, '0')}`}
    />
  )
}
