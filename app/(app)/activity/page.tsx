import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ActivityClient from '@/components/features/ActivityClient'

export default async function ActivityPage() {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Verificar rol — solo jefe puede ver el feed
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profile?.role !== 'jefe') redirect('/dashboard')
  }

  // Últimas 200 actividades con nombre del usuario
  const { data: activities } = await supabase
    .from('activity_log')
    .select(`
      id, user_id, action, entity_type, entity_id, details, created_at,
      profiles ( name )
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  // Perfiles para filtro
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, role')
    .order('name')

  // Contratos para filtro
  const { data: contracts } = await supabase
    .from('contracts')
    .select('id, name')
    .is('deleted_at', null)
    .order('name')

  return (
    <ActivityClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      activities={(activities || []) as any}
      profiles={profiles || []}
      contracts={contracts || []}
    />
  )
}
