import { createServerSupabaseClient } from '@/lib/supabase/server'
import ShipmentsClient from '@/components/features/ShipmentsClient'

export default async function ShipmentsPage() {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Obtener rol del usuario
  let userRole = 'operadora'
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profile) userRole = profile.role
  }

  // Obtener envíos con contrato e ítems
  const { data: shipments } = await supabase
    .from('shipments')
    .select(`
      id, contract_id, method, origin_city, dispatch_date,
      estimated_arrival, actual_arrival, notes, created_by, created_at,
      contracts ( name ),
      shipment_items ( item_id, items ( id, short_name, quantity, unit, status ) )
    `)
    .order('dispatch_date', { ascending: false })

  // Obtener contratos para filtro
  const { data: contracts } = await supabase
    .from('contracts')
    .select('id, name')
    .is('deleted_at', null)
    .order('name')

  return (
    <ShipmentsClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      shipments={(shipments || []) as any}
      contracts={contracts || []}
      currentUserId={user?.id || ''}
      userRole={userRole}
    />
  )
}
