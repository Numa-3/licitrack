import { createServerSupabaseClient } from '@/lib/supabase/server'
import ContractDetail from '@/components/features/ContractDetail'
import { notFound } from 'next/navigation'

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ contractId: string }>
}) {
  const { contractId } = await params
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

  // Obtener contrato con joins
  const { data: contract } = await supabase
    .from('contracts')
    .select(`
      id,
      name,
      entity,
      entity_id,
      type,
      status,
      created_at,
      updated_at,
      organization_id,
      organizations ( name ),
      contracting_entities!contracts_entity_id_fkey ( id, name ),
      created_by_profile:profiles!contracts_created_by_fkey ( name ),
      assigned_to_profile:profiles!contracts_assigned_to_fkey ( name )
    `)
    .eq('id', contractId)
    .is('deleted_at', null)
    .single()

  if (!contract) {
    notFound()
  }

  // Obtener ítems del contrato con proveedor y responsable
  const { data: items } = await supabase
    .from('items')
    .select(`
      id, item_number, short_name, description, type, quantity, unit,
      sale_price, supplier_cost, status, payment_status, due_date,
      contact_phone, notes, category_id, supplier_id, assigned_to, created_by,
      suppliers ( id, name, whatsapp ),
      profiles!items_assigned_to_fkey ( id, name )
    `)
    .eq('contract_id', contractId)
    .is('deleted_at', null)
    .order('item_number')

  // Obtener proveedores disponibles (no eliminados)
  const { data: suppliers } = await supabase
    .from('suppliers')
    .select('id, name, whatsapp, city, trusted')
    .is('deleted_at', null)
    .order('name')

  // Obtener perfiles para asignación
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, role')
    .order('name')

  // Obtener categorías
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, type')
    .order('name')

  // Obtener entidades contratantes (para dropdown de edición)
  const { data: allEntities } = await supabase
    .from('contracting_entities')
    .select('id, name')
    .is('deleted_at', null)
    .order('name')

  // Obtener actividad reciente del contrato (últimos 20)
  const { data: activityLog } = await supabase
    .from('activity_log')
    .select('id, user_id, action, entity_type, entity_id, details, created_at')
    .eq('entity_type', 'item')
    .in('entity_id', (items || []).map(i => i.id))
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <ContractDetail
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contract={contract as any}
      items={(items || []) as any}
      suppliers={suppliers || []}
      profiles={profiles || []}
      categories={categories || []}
      entities={allEntities || []}
      activityLog={(activityLog || []) as any}
      userRole={userRole}
      currentUserId={user?.id || ''}
    />
  )
}
