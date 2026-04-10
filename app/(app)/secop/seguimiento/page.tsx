import { getAuthUser } from '@/lib/supabase/server'
import SecopSeguimientoClient from '@/components/features/SecopSeguimientoClient'

export const dynamic = 'force-dynamic'

export default async function SecopSeguimientoPage() {
  const { supabase, userRole } = await getAuthUser()

  const [
    { data: processes, count },
    { data: recentChanges },
    { data: accounts },
    { data: urgentProcesses },
  ] = await Promise.all([
    supabase
      .from('secop_processes')
      .select('*, secop_accounts!secop_processes_account_id_fkey(name)', { count: 'exact' })
      .eq('monitoring_enabled', true)
      .order('next_deadline', { ascending: true, nullsFirst: false })
      .range(0, 49),
    supabase
      .from('secop_process_changes')
      .select(`
        *,
        secop_processes!secop_process_changes_process_id_fkey (
          secop_process_id, entidad, objeto
        )
      `)
      .order('detected_at', { ascending: false })
      .limit(20),
    supabase
      .from('secop_accounts')
      .select('id, name, username, is_active, entity_name, discovered_entities, monitored_entities, last_login_at, last_sync_at, sync_requested_at, process_count, cookies_expire_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('secop_processes')
      .select('id')
      .eq('monitoring_enabled', true)
      .not('next_deadline', 'is', null)
      .lte('next_deadline', new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString())
      .gte('next_deadline', new Date().toISOString()),
  ])

  return (
    <SecopSeguimientoClient
      initialProcesses={processes || []}
      initialCount={count || 0}
      initialChanges={recentChanges || []}
      initialAccounts={accounts || []}
      urgentCount={urgentProcesses?.length || 0}
      userRole={userRole}
    />
  )
}
