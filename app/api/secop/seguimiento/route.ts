import { requireAuth } from '@/lib/admin'
import { fetchUnreadChanges } from '@/lib/secop/unread-changes'

/**
 * GET /api/secop/seguimiento
 * Returns all monitored processes with monitoring data.
 * Query params: limit, offset, urgency ('all' | 'urgent')
 */
export async function GET(request: Request) {
  const auth = await requireAuth()
  if ('error' in auth) return auth.error
  const { supabase, userId } = auth

  const { searchParams } = new URL(request.url)
  const limit = Math.min(Number(searchParams.get('limit')) || 50, 200)
  const offset = Number(searchParams.get('offset')) || 0
  const urgency = searchParams.get('urgency') || 'all'

  let query = supabase
    .from('secop_processes')
    .select('*, secop_accounts!secop_processes_account_id_fkey(name)', { count: 'exact' })
    .eq('monitoring_enabled', true)
    .range(offset, offset + limit - 1)

  if (urgency === 'urgent') {
    // Deadlines within next 48 hours
    const in48h = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    query = query
      .not('next_deadline', 'is', null)
      .lte('next_deadline', in48h)
      .gte('next_deadline', new Date().toISOString())
      .order('next_deadline', { ascending: true })
  } else {
    query = query.order('next_deadline', { ascending: true, nullsFirst: false })
  }

  const { data, error, count } = await query

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Hidratar la última nota activa por proceso (para preview en la tabla).
  // Una sola query por todos los processIds, luego mapeamos en JS quedándonos
  // con la más reciente por proceso. Más simple que un nested select con
  // ordering+limit (que PostgREST no soporta limpio).
  const processIds = (data || []).map(p => p.id)
  const latestNoteByProcess: Record<string, { content: string; created_at: string; author_id: string }> = {}
  if (processIds.length > 0) {
    const { data: notes } = await supabase
      .from('secop_process_notes')
      .select('process_id, content, created_at, author_id')
      .in('process_id', processIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    for (const n of notes || []) {
      // Solo nos quedamos con la primera (más reciente) por process_id
      if (!latestNoteByProcess[n.process_id]) {
        latestNoteByProcess[n.process_id] = {
          content: n.content,
          created_at: n.created_at,
          author_id: n.author_id,
        }
      }
    }
  }

  const unreadByProcess = await fetchUnreadChanges(supabase, userId, processIds)

  const enriched = (data || []).map(p => {
    const unread = unreadByProcess.get(p.id)
    return {
      ...p,
      latest_note: latestNoteByProcess[p.id] || null,
      unread_changes_count: unread?.unread_changes_count ?? 0,
      recent_changes: unread?.recent_changes ?? [],
    }
  })

  return Response.json({ data: enriched, count })
}
