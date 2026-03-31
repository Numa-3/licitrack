import { getAuthUser } from '@/lib/supabase/server'
import DashboardClient from '@/components/features/DashboardClient'

export default async function DashboardPage() {
  const { supabase, userRole } = await getAuthUser()

  // All queries in parallel
  const [
    { data: contracts },
    { data: items },
    { data: shipments },
    { data: invoices },
    { data: profiles },
    { data: supplierDocs },
  ] = await Promise.all([
    supabase
      .from('contracts')
      .select(`
        id, name, entity, type, status, created_at,
        organizations ( name ),
        profiles!contracts_assigned_to_fkey ( name ),
        items ( status )
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('items')
      .select('id, short_name, status, type, sale_price, supplier_cost, supplier_id, assigned_to, updated_at, contract_id, quantity')
      .is('deleted_at', null),
    supabase
      .from('shipments')
      .select(`
        id, contract_id, estimated_arrival, actual_arrival, origin_city,
        contracts ( name )
      `),
    supabase
      .from('invoices')
      .select('id, total, contract_id'),
    supabase
      .from('profiles')
      .select('id, name, role')
      .order('name'),
    supabase
      .from('supplier_documents')
      .select(`
        id, supplier_id, type, expires_at,
        suppliers ( name )
      `)
      .not('expires_at', 'is', null),
  ])

  // Activities only for jefe (conditional, runs after parallel batch)
  let activities: unknown[] = []
  if (userRole === 'jefe') {
    const { data } = await supabase
      .from('activity_log')
      .select(`
        id, user_id, action, entity_type, entity_id, details, created_at,
        profiles ( name )
      `)
      .order('created_at', { ascending: false })
      .limit(10)
    activities = data || []
  }

  return (
    <DashboardClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contracts={(contracts || []) as any}
      items={(items || []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      shipments={(shipments || []) as any}
      invoices={(invoices || []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      activities={(activities || []) as any}
      profiles={profiles || []}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supplierDocs={(supplierDocs || []) as any}
      userRole={userRole}
    />
  )
}
