import { requireJefe } from '@/lib/admin'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function clearBucket(supabase: any, bucket: string): Promise<number> {
  let total = 0
  let offset = 0
  const batchSize = 100

  while (true) {
    const { data: files } = await supabase.storage.from(bucket).list('', { limit: batchSize, offset })
    if (!files || files.length === 0) break

    const paths = files.map((f: { name: string }) => f.name)
    await supabase.storage.from(bucket).remove(paths)
    total += paths.length

    if (files.length < batchSize) break
    offset += batchSize
  }

  return total
}

// Delete all rows from a table, return count
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteAll(supabase: any, table: string): Promise<number> {
  const { count } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })

  if (count && count > 0) {
    await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000')
  }

  return count ?? 0
}

// For junction tables that have composite PKs (no 'id' column)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteAllJunction(supabase: any, table: string, fkColumn: string): Promise<number> {
  const { count } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })

  if (count && count > 0) {
    await supabase.from(table).delete().neq(fkColumn, '00000000-0000-0000-0000-000000000000')
  }

  return count ?? 0
}

export async function DELETE() {
  const auth = await requireJefe()
  if ('error' in auth) return auth.error
  const { supabase, userId } = auth

  try {
    const counts: Record<string, number> = {}
    const storageCounts: Record<string, number> = {}

    // Phase A — Storage cleanup
    storageCounts['supplier-documents'] = await clearBucket(supabase, 'supplier-documents')
    storageCounts['entity-documents'] = await clearBucket(supabase, 'entity-documents')
    storageCounts['invoices'] = await clearBucket(supabase, 'invoices')
    storageCounts['documents'] = await clearBucket(supabase, 'documents')

    // Phase B — Junction/leaf tables
    counts.invoice_items = await deleteAllJunction(supabase, 'invoice_items', 'invoice_id')
    counts.shipment_items = await deleteAllJunction(supabase, 'shipment_items', 'shipment_id')
    counts.entity_documents = await deleteAll(supabase, 'entity_documents')

    // Phase C — Transactional entities
    counts.invoices = await deleteAll(supabase, 'invoices')
    counts.shipments = await deleteAll(supabase, 'shipments')
    counts.supplier_documents = await deleteAll(supabase, 'supplier_documents')
    counts.items = await deleteAll(supabase, 'items')

    // Phase D — Top-level entities
    counts.suppliers = await deleteAll(supabase, 'suppliers')
    counts.contracts = await deleteAll(supabase, 'contracts')
    counts.contracting_entities = await deleteAll(supabase, 'contracting_entities')

    // Log the reset action before clearing the log
    await supabase.from('activity_log').insert({
      user_id: userId,
      action: 'global_reset',
      entity_type: 'system',
      entity_id: userId,
      details: { deleted_counts: counts, storage_files_deleted: storageCounts },
    })

    // Phase E — Clear activity log
    counts.activity_log = await deleteAll(supabase, 'activity_log')

    return Response.json({ success: true, counts, storageCounts })
  } catch (err) {
    console.error('Global reset error:', err)
    return Response.json({ error: 'Error al ejecutar el reset global' }, { status: 500 })
  }
}
