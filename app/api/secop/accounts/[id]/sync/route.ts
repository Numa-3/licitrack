import { requireJefe } from '@/lib/admin'
import { NextRequest } from 'next/server'

/**
 * POST /api/secop/accounts/[id]/sync
 * Marks an account for immediate discovery on the next worker cycle.
 * Sets sync_requested_at = now().
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireJefe()
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { id } = await params

  const { error } = await supabase
    .from('secop_accounts')
    .update({ sync_requested_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({
    ok: true,
    message: 'Sincronización en cola. Corre el worker para procesar: npm run start',
  })
}
