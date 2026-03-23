import { requireJefe, extractStoragePath } from '@/lib/admin'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ supplierId: string }> }
) {
  const auth = await requireJefe()
  if ('error' in auth) return auth.error
  const { supabase, userId } = auth
  const { supplierId } = await params

  try {
    // Verify supplier exists
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('id, name')
      .eq('id', supplierId)
      .single()

    if (!supplier) {
      return Response.json({ error: 'Proveedor no encontrado' }, { status: 404 })
    }

    // Check if items reference this supplier
    const { count: referencedItems } = await supabase
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('supplier_id', supplierId)
      .is('deleted_at', null)

    if (referencedItems && referencedItems > 0) {
      return Response.json({
        error: `No se puede eliminar: ${referencedItems} ítem(s) aún referencian a este proveedor. Reasigná o eliminá esos ítems primero.`,
      }, { status: 409 })
    }

    // Check if invoices reference this supplier
    const { count: referencedInvoices } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('supplier_id', supplierId)

    if (referencedInvoices && referencedInvoices > 0) {
      return Response.json({
        error: `No se puede eliminar: ${referencedInvoices} factura(s) aún referencian a este proveedor. Eliminá esas facturas primero.`,
      }, { status: 409 })
    }

    // Get documents to delete from storage
    const { data: docs } = await supabase
      .from('supplier_documents')
      .select('id, file_url')
      .eq('supplier_id', supplierId)

    // Delete files from storage
    if (docs && docs.length > 0) {
      const paths = docs
        .map(d => extractStoragePath(d.file_url, 'supplier-documents'))
        .filter((p): p is string => p !== null)
      if (paths.length > 0) {
        await supabase.storage.from('supplier-documents').remove(paths)
      }
    }

    // Delete documents (also cascades, but explicit for clarity)
    await supabase.from('supplier_documents').delete().eq('supplier_id', supplierId)

    // Delete supplier
    await supabase.from('suppliers').delete().eq('id', supplierId)

    // Log
    await supabase.from('activity_log').insert({
      user_id: userId,
      action: 'hard_delete',
      entity_type: 'supplier',
      entity_id: supplierId,
      details: {
        name: supplier.name,
        documents_deleted: docs?.length ?? 0,
      },
    })

    return Response.json({ success: true })
  } catch (err) {
    console.error('Delete supplier error:', err)
    return Response.json({ error: 'Error al eliminar el proveedor' }, { status: 500 })
  }
}
