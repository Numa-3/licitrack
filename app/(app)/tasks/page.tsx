import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TasksClient from '@/components/features/TasksClient'

export default async function TasksPage() {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  // Profiles for assignee dropdown
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name')
    .order('name')

  // Active contracts for contract dropdown
  const { data: contracts } = await supabase
    .from('contracts')
    .select('id, name')
    .is('deleted_at', null)
    .in('status', ['draft', 'active'])
    .order('name')

  return (
    <TasksClient
      currentUserId={user.id}
      userRole={profile?.role || 'operadora'}
      profiles={profiles || []}
      contracts={contracts || []}
    />
  )
}
