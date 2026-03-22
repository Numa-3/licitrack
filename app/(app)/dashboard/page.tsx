import { createServerSupabaseClient } from '@/lib/supabase/server'
import DashboardClient from '@/components/features/DashboardClient'

export default async function DashboardPage() {
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

  // Contratos con organización, responsable e ítems
  const { data: contracts } = await supabase
    .from('contracts')
    .select(`
      id, name, entity, type, status, created_at,
      organizations ( name ),
      profiles!contracts_assigned_to_fkey ( name ),
      items ( status )
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  // Todos los ítems activos (para métricas, alertas, vista por persona)
  const { data: items } = await supabase
    .from('items')
    .select('id, short_name, status, type, sale_price, supplier_cost, supplier_id, assigned_to, updated_at, contract_id, quantity')
    .is('deleted_at', null)

  // Envíos (para métrica en camino + alertas retrasados)
  const { data: shipments } = await supabase
    .from('shipments')
    .select(`
      id, contract_id, estimated_arrival, actual_arrival, origin_city,
      contracts ( name )
    `)

  // Facturas (para métrica total)
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, total, contract_id')

  // Últimas actividades (para feed inline, solo si es jefe)
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

  // Perfiles (para vista por persona)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, role')
    .order('name')

  // Documentos de proveedores (para alerta de vencimiento)
  const { data: supplierDocs } = await supabase
    .from('supplier_documents')
    .select(`
      id, supplier_id, type, expires_at,
      suppliers ( name )
    `)
    .not('expires_at', 'is', null)

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
