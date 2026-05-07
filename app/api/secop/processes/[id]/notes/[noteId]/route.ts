import { requireAuth } from '@/lib/admin'
import { NextRequest } from 'next/server'

/**
 * DELETE /api/secop/processes/[id]/notes/[noteId]
 *
 * Soft delete: marca deleted_at = now() y deleted_by = auth user. La nota
 * queda en DB para que jefes puedan auditar lo borrado. Cualquier auth
 * (jefe u operadora) puede borrar cualquier nota — son notas internas
 * compartidas por el equipo.
 *
 * Si la nota ya estaba borrada, devuelve 200 idempotente sin re-escribir.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) {
  const auth = await requireAuth()
  if ('error' in auth) return auth.error
  const { supabase, userId } = auth
  const { id: processId, noteId } = await params

  const { data: existing, error: fetchError } = await supabase
    .from('secop_process_notes')
    .select('id, deleted_at')
    .eq('id', noteId)
    .eq('process_id', processId)
    .maybeSingle()

  if (fetchError) return Response.json({ error: fetchError.message }, { status: 500 })
  if (!existing) return Response.json({ error: 'Nota no encontrada' }, { status: 404 })

  // Idempotente: ya borrada → ok sin re-escribir
  if (existing.deleted_at) return Response.json({ ok: true, already_deleted: true })

  const { error: updateError } = await supabase
    .from('secop_process_notes')
    .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
    .eq('id', noteId)

  if (updateError) return Response.json({ error: updateError.message }, { status: 500 })
  return Response.json({ ok: true })
}
