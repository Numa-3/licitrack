import { requireAuth } from '@/lib/admin'
import { NextRequest } from 'next/server'

/**
 * GET /api/secop/processes/[id]/cronograma
 * Returns the latest cronograma from the most recent page_scrape snapshot.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth()
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { id } = await params

  const { data: snapshot, error } = await supabase
    .from('secop_process_snapshots')
    .select('snapshot_json, captured_at')
    .eq('process_id', id)
    .eq('source_type', 'page_scrape')
    .order('captured_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !snapshot) {
    return Response.json({ cronograma: [], captured_at: null })
  }

  const snapshotJson = snapshot.snapshot_json as { cronograma?: unknown[] }

  return Response.json({
    cronograma: snapshotJson?.cronograma || [],
    captured_at: snapshot.captured_at,
  })
}
