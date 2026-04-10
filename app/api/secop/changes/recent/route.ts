import { requireAuth } from '@/lib/admin'

/**
 * GET /api/secop/changes/recent
 * Returns recent changes across all monitored processes.
 * Query params: limit (default 30), offset (default 0), priority ('all' | 'high' | 'medium')
 */
export async function GET(request: Request) {
  const auth = await requireAuth()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { searchParams } = new URL(request.url)
  const limit = Math.min(Number(searchParams.get('limit')) || 30, 100)
  const offset = Number(searchParams.get('offset')) || 0
  const priority = searchParams.get('priority') || 'all'

  let query = supabase
    .from('secop_process_changes')
    .select(`
      *,
      secop_processes!secop_process_changes_process_id_fkey (
        secop_process_id, entidad, objeto
      )
    `, { count: 'exact' })
    .order('detected_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (priority !== 'all') {
    query = query.eq('priority', priority)
  }

  const { data, error, count } = await query

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ data, count })
}
