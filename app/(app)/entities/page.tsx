import { getAuthUser } from '@/lib/supabase/server'
import EntitiesClient from '@/components/features/EntitiesClient'

export default async function EntitiesPage() {
  const { supabase, userRole, userId } = await getAuthUser()

  const { data: entities } = await supabase
    .from('contracting_entities')
    .select(`
      id, name, nit, address, city, contact_name, phone, email, notes, created_at, deleted_at,
      entity_documents ( type, verified )
    `)
    .is('deleted_at', null)
    .order('name')

  return (
    <EntitiesClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      entities={(entities || []) as any}
      userRole={userRole}
      currentUserId={userId}
    />
  )
}
