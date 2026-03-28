import { requireJefe, extractStoragePath } from '@/lib/admin'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ contractId: string }> }
) {
  const auth = await requireJefe()
  if ('error' in auth) return auth.error
  const { supabase, userId } = auth
  const { contractId } = await params

  try {
    // Verify contract exists
    const { data: contract } = await supabase
      .from('contracts')
      .select('id, name')
      .eq('id', contractId)
      .single()

    if (!contract) {
      return Response.json({ error: 'Contrato no encontrado' }, { status: 404 })
    }

    // Get invoices to delete their storage files
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, pdf_url, xml_url')
      .eq('contract_id', contractId)

    // Delete invoice files from storage
    if (invoices && invoices.length > 0) {
      const paths: string[] = []
      for (const inv of invoices) {
        const pdfPath = extractStoragePath(inv.pdf_url, 'invoices')
        if (pdfPath) paths.push(pdfPath)
        if (inv.xml_url) {
          const xmlPath = extractStoragePath(inv.xml_url, 'invoices')
          if (xmlPath) paths.push(xmlPath)
        }
      }
      if (paths.length > 0) {
        await supabase.storage.from('invoices').remove(paths)
      }
    }

    // Delete in FK order
    const invoiceIds = (invoices || []).map(i => i.id)
    if (invoiceIds.length > 0) {
      await supabase.from('invoice_items').delete().in('invoice_id', invoiceIds)
      await supabase.from('invoices').delete().in('id', invoiceIds)
    }

    // Get shipment ids for this contract
    const { data: shipments } = await supabase
      .from('shipments')
      .select('id')
      .eq('contract_id', contractId)

    const shipmentIds = (shipments || []).map(s => s.id)
    if (shipmentIds.length > 0) {
      await supabase.from('shipment_items').delete().in('shipment_id', shipmentIds)
      await supabase.from('shipments').delete().in('id', shipmentIds)
    }

    // Count items before deletion
    const { count: itemsDeleted } = await supabase
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('contract_id', contractId)
      .is('deleted_at', null)

    // Delete items
    await supabase.from('items').delete().eq('contract_id', contractId)

    // Delete contract
    await supabase.from('contracts').delete().eq('id', contractId)

    // Log
    await supabase.from('activity_log').insert({
      user_id: userId,
      action: 'hard_delete',
      entity_type: 'contract',
      entity_id: contractId,
      details: {
        name: contract.name,
        cascade_counts: {
          items: itemsDeleted ?? 0,
          shipments: shipmentIds.length,
          invoices: invoiceIds.length,
        },
      },
    })

    return Response.json({ success: true })
  } catch (err) {
    console.error('Delete contract error:', err)
    return Response.json({ error: 'Error al eliminar el contrato' }, { status: 500 })
  }
}
