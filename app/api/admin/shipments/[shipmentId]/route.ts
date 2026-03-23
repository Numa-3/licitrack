import { requireJefe } from '@/lib/admin'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ shipmentId: string }> }
) {
  const auth = await requireJefe()
  if ('error' in auth) return auth.error
  const { supabase, userId } = auth
  const { shipmentId } = await params

  try {
    // Verify shipment exists
    const { data: shipment } = await supabase
      .from('shipments')
      .select('id, contract_id, method, dispatch_date')
      .eq('id', shipmentId)
      .single()

    if (!shipment) {
      return Response.json({ error: 'Envío no encontrado' }, { status: 404 })
    }

    // Get count of items linked
    const { count: itemsUnlinked } = await supabase
      .from('shipment_items')
      .select('*', { count: 'exact', head: true })
      .eq('shipment_id', shipmentId)

    // Delete junction table (also cascades)
    await supabase.from('shipment_items').delete().eq('shipment_id', shipmentId)

    // Delete shipment
    await supabase.from('shipments').delete().eq('id', shipmentId)

    // Log
    await supabase.from('activity_log').insert({
      user_id: userId,
      action: 'hard_delete',
      entity_type: 'shipment',
      entity_id: shipmentId,
      details: {
        contract_id: shipment.contract_id,
        method: shipment.method,
        dispatch_date: shipment.dispatch_date,
        items_unlinked: itemsUnlinked ?? 0,
      },
    })

    return Response.json({ success: true })
  } catch (err) {
    console.error('Delete shipment error:', err)
    return Response.json({ error: 'Error al eliminar el envío' }, { status: 500 })
  }
}
