import { requireAuth } from '@/lib/admin'
import { NextRequest } from 'next/server'

/**
 * GET /api/secop/processes/[id]/changes
 * Returns change history for a process.
 * Query params: limit (default 20), offset (default 0)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth()
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { id } = await params

  const { searchParams } = new URL(request.url)
  const limit = Math.min(Number(searchParams.get('limit')) || 20, 100)
  const offset = Number(searchParams.get('offset')) || 0

  const { data, error, count } = await supabase
    .from('secop_process_changes')
    .select('*', { count: 'exact' })
    .eq('process_id', id)
    .order('detected_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ data, count })
}
