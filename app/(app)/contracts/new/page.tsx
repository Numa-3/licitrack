import { createServerSupabaseClient } from '@/lib/supabase/server'
import NewContractForm from '@/components/features/NewContractForm'

export default async function NewContractPage() {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Obtener organizaciones (organizations no tiene deleted_at)
  const { data: organizations } = await supabase
    .from('organizations')
    .select('id, name')
    .order('name')

  // Obtener perfiles (para asignar responsable)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, role')
    .order('name')

  // Obtener categorías
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, type')
    .order('name')

  // Obtener entidades contratantes
  const { data: entities } = await supabase
    .from('contracting_entities')
    .select('id, name')
    .is('deleted_at', null)
    .order('name')

  return (
    <NewContractForm
      organizations={organizations || []}
      profiles={profiles || []}
      categories={categories || []}
      entities={entities || []}
      currentUserId={user?.id || ''}
    />
  )
}
