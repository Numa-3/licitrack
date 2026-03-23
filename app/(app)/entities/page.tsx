import { createServerSupabaseClient } from '@/lib/supabase/server'
import EntitiesClient from '@/components/features/EntitiesClient'

export default async function EntitiesPage() {
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

  // Entidades activas con documentos
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
      currentUserId={user?.id || ''}
    />
  )
}
