import { getAuthUser } from '@/lib/supabase/server'
import CalendarClient from '@/components/features/CalendarClient'
import { fetchCalendarEvents } from '@/app/api/secop/calendar/events/route'

export const dynamic = 'force-dynamic'

export default async function CalendarioPage() {
  const { supabase } = await getAuthUser()

  // Cargar el mes actual + márgenes para que la grid 6-semanas tenga datos
  // aún en los días "fuera del mes" que el grid también renderiza.
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  from.setDate(from.getDate() - 7)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  to.setDate(to.getDate() + 7)

  const { events, processes } = await fetchCalendarEvents(supabase, { from, to })

  return (
    <CalendarClient
      initialEvents={events}
      initialProcesses={processes}
      initialMonth={`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`}
    />
  )
}
