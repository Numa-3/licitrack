import { getAuthUser } from '@/lib/supabase/server'
import ShipmentsClient from '@/components/features/ShipmentsClient'

export default async function ShipmentsPage() {
  const { supabase, userRole, userId } = await getAuthUser()

  const [{ data: shipments }, { data: contracts }] = await Promise.all([
    supabase
      .from('shipments')
      .select(`
        id, contract_id, method, origin_city, dispatch_date,
        estimated_arrival, actual_arrival, notes, created_by, created_at,
        contracts ( name ),
        shipment_items ( item_id, items ( id, short_name, quantity, unit, status ) )
      `)
      .order('dispatch_date', { ascending: false }),
    supabase
      .from('contracts')
      .select('id, name')
      .is('deleted_at', null)
      .order('name'),
  ])

  return (
    <ShipmentsClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      shipments={(shipments || []) as any}
      contracts={contracts || []}
      currentUserId={userId}
      userRole={userRole}
    />
  )
}
