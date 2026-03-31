import { getAuthUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ActivityClient from '@/components/features/ActivityClient'

export default async function ActivityPage() {
  const { supabase, userRole } = await getAuthUser()

  if (userRole !== 'jefe') redirect('/dashboard')

  const [{ data: activities }, { data: profiles }, { data: contracts }] = await Promise.all([
    supabase
      .from('activity_log')
      .select(`
        id, user_id, action, entity_type, entity_id, details, created_at,
        profiles ( name )
      `)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('profiles')
      .select('id, name, role')
      .order('name'),
    supabase
      .from('contracts')
      .select('id, name')
      .is('deleted_at', null)
      .order('name'),
  ])

  return (
    <ActivityClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      activities={(activities || []) as any}
      profiles={profiles || []}
      contracts={contracts || []}
    />
  )
}
