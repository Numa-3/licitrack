import { createServerSupabaseClient } from '@/lib/supabase/server'
import ContractsClient from '@/components/features/ContractsClient'

export default async function ContractsPage() {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Rol del usuario
  let userRole = 'operadora'
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profile) userRole = profile.role
  }

  // Contratos con entidad, responsable y conteo de ítems
  const { data: contracts } = await supabase
    .from('contracts')
    .select(`
      id, name, entity, type, status, start_date, end_date, created_at,
      contracting_entities!contracts_entity_id_fkey ( id, name ),
      profiles!contracts_assigned_to_fkey ( name ),
      items ( id )
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  // Entidades para el filtro de dropdown
  const { data: entities } = await supabase
    .from('contracting_entities')
    .select('id, name')
    .is('deleted_at', null)
    .order('name')

  return (
    <ContractsClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contracts={(contracts || []) as any}
      entities={entities || []}
      userRole={userRole}
    />
  )
}
