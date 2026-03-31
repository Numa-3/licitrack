import { getAuthUser } from '@/lib/supabase/server'
import InvoicesClient from '@/components/features/InvoicesClient'

export default async function InvoicesPage() {
  const { supabase, userRole, userId } = await getAuthUser()

  const [{ data: invoices }, { data: contracts }, { data: suppliers }, { data: items }] = await Promise.all([
    supabase
      .from('invoices')
      .select(`
        id, organization_id, contract_id, supplier_id, invoice_number,
        issue_date, subtotal, tax, total, pdf_url, xml_url, notes, created_at,
        contracts ( name ),
        suppliers ( name ),
        organizations ( name ),
        invoice_items ( item_id, items ( id, short_name ) )
      `)
      .order('created_at', { ascending: false }),
    supabase
      .from('contracts')
      .select('id, name, organization_id')
      .is('deleted_at', null)
      .order('name'),
    supabase
      .from('suppliers')
      .select('id, name')
      .is('deleted_at', null)
      .order('name'),
    supabase
      .from('items')
      .select('id, short_name, contract_id, payment_status')
      .is('deleted_at', null)
      .order('short_name'),
  ])

  return (
    <InvoicesClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      invoices={(invoices || []) as any}
      contracts={contracts || []}
      suppliers={suppliers || []}
      items={items || []}
      currentUserId={userId}
      userRole={userRole}
    />
  )
}
