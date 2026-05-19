import { requireAuth } from '@/lib/admin'
import { parseCronogramaFromSnapshot } from '@/lib/secop/cronograma'
import { NextRequest } from 'next/server'

/**
 * GET /api/secop/processes/[id]/cronograma
 * Returns the latest cronograma. Handles both contractual (page_scrape) and
 * precontractual (api_precontractual / scraper_bootstrap) snapshots.
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
    .select('snapshot_json, captured_at, source_type')
    .eq('process_id', id)
    .in('source_type', ['page_scrape', 'api_precontractual', 'scraper_bootstrap'])
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !snapshot) {
    return Response.json({ cronograma: [], captured_at: null })
  }

  return Response.json({
    cronograma: parseCronogramaFromSnapshot(snapshot.snapshot_json),
    captured_at: snapshot.captured_at,
  })
}
