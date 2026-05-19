import { requireAuth } from '@/lib/admin'
import { NextRequest } from 'next/server'

/**
 * POST /api/secop/processes/[id]/mark-seen
 *
 * Marca todos los cambios actuales del proceso como vistos por el usuario.
 * Upsert: si ya existe la fila para (user_id, process_id), actualiza el
 * last_seen_change_at a NOW(); si no, la crea.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth()
  if ('error' in auth) return auth.error
  const { supabase, userId } = auth
  const { id } = await params

  const { error } = await supabase
    .from('secop_process_views')
    .upsert(
      {
        user_id: userId,
        process_id: id,
        last_seen_change_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,process_id' },
    )

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
