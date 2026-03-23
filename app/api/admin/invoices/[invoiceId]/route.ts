import { requireJefe, extractStoragePath } from '@/lib/admin'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  const auth = await requireJefe()
  if ('error' in auth) return auth.error
  const { supabase, userId } = auth
  const { invoiceId } = await params

  try {
    // Verify invoice exists
    const { data: invoice } = await supabase
      .from('invoices')
      .select('id, invoice_number, contract_id, pdf_url, xml_url')
      .eq('id', invoiceId)
      .single()

    if (!invoice) {
      return Response.json({ error: 'Factura no encontrada' }, { status: 404 })
    }

    // Delete files from storage
    const filesToDelete: string[] = []
    const pdfPath = extractStoragePath(invoice.pdf_url, 'invoices')
    if (pdfPath) filesToDelete.push(pdfPath)
    if (invoice.xml_url) {
      const xmlPath = extractStoragePath(invoice.xml_url, 'invoices')
      if (xmlPath) filesToDelete.push(xmlPath)
    }
    if (filesToDelete.length > 0) {
      await supabase.storage.from('invoices').remove(filesToDelete)
    }

    // Delete junction table (also cascades)
    await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId)

    // Delete invoice
    await supabase.from('invoices').delete().eq('id', invoiceId)

    // Log
    await supabase.from('activity_log').insert({
      user_id: userId,
      action: 'hard_delete',
      entity_type: 'invoice',
      entity_id: invoiceId,
      details: {
        invoice_number: invoice.invoice_number,
        contract_id: invoice.contract_id,
        files_deleted: filesToDelete.length,
      },
    })

    return Response.json({ success: true })
  } catch (err) {
    console.error('Delete invoice error:', err)
    return Response.json({ error: 'Error al eliminar la factura' }, { status: 500 })
  }
}
