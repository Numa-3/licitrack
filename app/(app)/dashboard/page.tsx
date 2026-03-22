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

  // Obtener contratos con organización, responsable e ítems
  const { data: contracts } = await supabase
    .from('contracts')
    .select(`
      id,
      name,
      entity,
      type,
      status,
      created_at,
      organizations ( name ),
      profiles!contracts_assigned_to_fkey ( name ),
      items ( status )
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <DashboardClient contracts={(contracts || []) as any} userRole={userRole} />
}
