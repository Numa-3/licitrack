import { getAuthUser } from '@/lib/supabase/server'
import TasksClient from '@/components/features/TasksClient'

export default async function TasksPage() {
  const { supabase, userRole, userId } = await getAuthUser()

  const [{ data: profiles }, { data: contracts }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, name')
      .order('name'),
    supabase
      .from('contracts')
      .select('id, name')
      .is('deleted_at', null)
      .in('status', ['draft', 'active'])
      .order('name'),
  ])

  return (
    <TasksClient
      currentUserId={userId}
      userRole={userRole}
      profiles={profiles || []}
      contracts={contracts || []}
    />
  )
}
