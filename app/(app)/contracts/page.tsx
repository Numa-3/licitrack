import { getAuthUser } from '@/lib/supabase/server'
import ContractsClient from '@/components/features/ContractsClient'

export default async function ContractsPage() {
  const { supabase, userRole } = await getAuthUser()

  const [{ data: contracts }, { data: entities }] = await Promise.all([
    supabase
      .from('contracts')
      .select(`
        id, name, entity, type, status, start_date, end_date, created_at,
        contracting_entities!contracts_entity_id_fkey ( id, name ),
        profiles!contracts_assigned_to_fkey ( name ),
        items ( id )
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('contracting_entities')
      .select('id, name')
      .is('deleted_at', null)
      .order('name'),
  ])

  return (
    <ContractsClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contracts={(contracts || []) as any}
      entities={entities || []}
      userRole={userRole}
    />
  )
}
