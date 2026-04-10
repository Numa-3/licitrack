import { getAuthUser } from '@/lib/supabase/server'
import SecopRadarClient from '@/components/features/SecopRadarClient'

export default async function SecopRadarPage() {
  const { supabase, userRole } = await getAuthUser()

  const [{ data: processes, count }, { data: rules }] = await Promise.all([
    supabase
      .from('secop_processes')
      .select('*', { count: 'exact' })
      .neq('radar_state', 'dismissed')
      .order('first_seen_at', { ascending: false })
      .range(0, 49),
    supabase
      .from('secop_watch_rules')
      .select('*')
      .order('created_at', { ascending: false }),
  ])

  return (
    <SecopRadarClient
      initialProcesses={processes || []}
      initialCount={count || 0}
      initialRules={rules || []}
      userRole={userRole}
    />
  )
}
