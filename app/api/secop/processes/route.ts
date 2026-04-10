import { requireAuth } from '@/lib/admin'

/**
 * GET /api/secop/processes
 *
 * Query params:
 *   radar_state — filter by state (new, reviewing, followed, dismissed)
 *   q           — text search on objeto/entidad
 *   limit       — page size (default 50)
 *   offset      — pagination offset
 */
export async function GET(request: Request) {
  const auth = await requireAuth()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { searchParams } = new URL(request.url)
  const radarState = searchParams.get('radar_state')
  const q = searchParams.get('q')
  const limit = Math.min(Number(searchParams.get('limit')) || 50, 200)
  const offset = Number(searchParams.get('offset')) || 0

  let query = supabase
    .from('secop_processes')
    .select('*', { count: 'exact' })
    .order('first_seen_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (radarState) {
    query = query.eq('radar_state', radarState)
  }

  if (q) {
    query = query.or(`objeto.ilike.%${q}%,entidad.ilike.%${q}%,referencia_proceso.ilike.%${q}%`)
  }

  const { data, error, count } = await query

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ data, count })
}
