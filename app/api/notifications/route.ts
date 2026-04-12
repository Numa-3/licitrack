import { requireAuth } from '@/lib/admin'

/**
 * GET /api/notifications
 * List notifications for the current user (RLS scoped).
 * Query params: limit, offset, priority ('all'|'high'|'medium'|'low'), unread_only ('true')
 * Returns: { data, count, unread_count }
 */
export async function GET(request: Request) {
  const auth = await requireAuth()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { searchParams } = new URL(request.url)
  const limit = Math.min(Number(searchParams.get('limit')) || 20, 100)
  const offset = Number(searchParams.get('offset')) || 0
  const priority = searchParams.get('priority') || 'all'
  const unreadOnly = searchParams.get('unread_only') === 'true'

  // Build main query
  let query = supabase
    .from('notifications')
    .select(`
      *,
      secop_processes (secop_process_id, entidad, objeto)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (priority !== 'all') {
    query = query.eq('priority', priority)
  }
  if (unreadOnly) {
    query = query.eq('read', false)
  }

  // Fetch list + unread count in parallel
  const [{ data, error, count }, { count: unreadCount }] = await Promise.all([
    query,
    supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('read', false),
  ])

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ data, count, unread_count: unreadCount || 0 })
}
