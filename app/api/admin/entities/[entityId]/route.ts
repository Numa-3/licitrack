import { requireJefe, extractStoragePath } from '@/lib/admin'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ entityId: string }> }
) {
  const auth = await requireJefe()
  if ('error' in auth) return auth.error
  const { supabase, userId } = auth
  const { entityId } = await params

  try {
    // Verify entity exists
    const { data: entity } = await supabase
      .from('contracting_entities')
      .select('id, name')
      .eq('id', entityId)
      .single()

    if (!entity) {
      return Response.json({ error: 'Entidad no encontrada' }, { status: 404 })
    }

    // Check if any contracts reference this entity
    const { count: contractCount } = await supabase
      .from('contracts')
      .select('*', { count: 'exact', head: true })
      .eq('entity_id', entityId)
      .is('deleted_at', null)

    if (contractCount && contractCount > 0) {
      return Response.json(
        { error: `No se puede eliminar: ${contractCount} contrato${contractCount > 1 ? 's' : ''} usa${contractCount > 1 ? 'n' : ''} esta entidad.` },
        { status: 409 }
      )
    }

    // Get documents to delete their storage files
    const { data: docs } = await supabase
      .from('entity_documents')
      .select('id, file_url')
      .eq('entity_id', entityId)

    // Delete document files from storage
    if (docs && docs.length > 0) {
      const paths: string[] = []
      for (const doc of docs) {
        const path = extractStoragePath(doc.file_url, 'entity-documents')
        if (path) paths.push(path)
      }
      if (paths.length > 0) {
        await supabase.storage.from('entity-documents').remove(paths)
      }
    }

    // Delete entity_documents rows (CASCADE would handle this, but be explicit)
    await supabase.from('entity_documents').delete().eq('entity_id', entityId)

    // Delete entity
    await supabase.from('contracting_entities').delete().eq('id', entityId)

    // Log
    await supabase.from('activity_log').insert({
      user_id: userId,
      action: 'hard_delete',
      entity_type: 'contracting_entity',
      entity_id: entityId,
      details: {
        name: entity.name,
        documents_deleted: docs?.length ?? 0,
      },
    })

    return Response.json({ success: true })
  } catch (err) {
    console.error('Delete entity error:', err)
    return Response.json({ error: 'Error al eliminar la entidad' }, { status: 500 })
  }
}
