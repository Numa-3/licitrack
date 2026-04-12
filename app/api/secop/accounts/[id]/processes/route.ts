import { requireJefe } from '@/lib/admin'
import { NextRequest } from 'next/server'

/**
 * GET /api/secop/accounts/[id]/processes
 * Returns all secop_processes for a given account (both monitored and unmonitored).
 * Used to let the user select which contracts to actively monitor.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireJefe()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { id } = await params

  const { data, error } = await supabase
    .from('secop_processes')
    .select('id, secop_process_id, referencia_proceso, entidad, objeto, estado, valor_estimado, monitoring_enabled, next_deadline, url_publica, entity_name')
    .eq('account_id', id)
    .eq('source', 'account')
    .order('entity_name', { ascending: true })
    .order('monitoring_enabled', { ascending: false })
    .order('entidad', { ascending: true })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ data: data || [] })
}
