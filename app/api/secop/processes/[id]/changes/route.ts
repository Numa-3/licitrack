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

  const [{ data, error, count }, { data: snapshots }] = await Promise.all([
    supabase
      .from('secop_process_changes')
      .select('*', { count: 'exact' })
      .eq('process_id', id)
      .order('detected_at', { ascending: false })
      .range(offset, offset + limit - 1),
    supabase
      .from('secop_process_snapshots')
      .select('id, captured_at, hash, source_type')
      .eq('process_id', id)
      .order('captured_at', { ascending: false })
      .limit(2),
  ])

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Build snapshot comparison info
  const last_snapshot = snapshots?.[0] || null
  const prev_snapshot = snapshots?.[1] || null
  const snapshot_match = last_snapshot && prev_snapshot
    ? last_snapshot.hash === prev_snapshot.hash
    : null

  return Response.json({ data, count, last_snapshot, prev_snapshot, snapshot_match })
}
