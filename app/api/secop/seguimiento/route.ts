import { requireAuth } from '@/lib/admin'

/**
 * GET /api/secop/seguimiento
 * Returns all monitored processes with monitoring data.
 * Query params: limit, offset, urgency ('all' | 'urgent')
 */
export async function GET(request: Request) {
  const auth = await requireAuth()
  if ('error' in auth) return auth.error
  const { supabase } = auth

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

  return Response.json({ data, count })
}
