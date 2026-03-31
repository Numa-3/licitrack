import { getAuthUser } from '@/lib/supabase/server'
import NewContractForm from '@/components/features/NewContractForm'

export default async function NewContractPage() {
  const { supabase, userId } = await getAuthUser()

  const [{ data: organizations }, { data: profiles }, { data: categories }, { data: entities }] = await Promise.all([
    supabase
      .from('organizations')
      .select('id, name')
      .order('name'),
    supabase
      .from('profiles')
      .select('id, name, role')
      .order('name'),
    supabase
      .from('categories')
      .select('id, name, type')
      .order('name'),
    supabase
      .from('contracting_entities')
      .select('id, name')
      .is('deleted_at', null)
      .order('name'),
  ])

  return (
    <NewContractForm
      organizations={organizations || []}
      profiles={profiles || []}
      categories={categories || []}
      entities={entities || []}
      currentUserId={userId}
    />
  )
}
