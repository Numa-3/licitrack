import { getAuthUser } from '@/lib/supabase/server'
import SecopSeguimientoClient from '@/components/features/SecopSeguimientoClient'
import { fetchUnreadChanges } from '@/lib/secop/unread-changes'

export const dynamic = 'force-dynamic'

export default async function SecopSeguimientoPage() {
  const { supabase, userId, userRole } = await getAuthUser()

  const workerLogQuery = userRole === 'jefe'
    ? supabase
        .from('secop_monitor_log')
        .select('status, finished_at, processes_checked, changes_found')
        .order('started_at', { ascending: false })
        .limit(1)
        .single()
    : Promise.resolve({ data: null })

  const [
    { data: processes, count },
    { data: recentChanges },
    { data: accounts },
    { data: urgentProcesses },
    { data: workerLog },
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
    workerLogQuery,
  ])

  // Hidratar la última nota activa por proceso para el preview en la tabla
  const processIds = (processes || []).map(p => p.id)
  const latestNoteByProcess: Record<string, { content: string; created_at: string; author_id: string }> = {}
  if (processIds.length > 0) {
    const { data: notes } = await supabase
      .from('secop_process_notes')
      .select('process_id, content, created_at, author_id')
      .in('process_id', processIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    for (const n of notes || []) {
      if (!latestNoteByProcess[n.process_id]) {
        latestNoteByProcess[n.process_id] = {
          content: n.content,
          created_at: n.created_at,
          author_id: n.author_id,
        }
      }
    }
  }
  // Unread changes por proceso para el usuario actual
  const unreadByProcess = await fetchUnreadChanges(supabase, userId, processIds)

  const enrichedProcesses = (processes || []).map(p => {
    const unread = unreadByProcess.get(p.id)
    return {
      ...p,
      latest_note: latestNoteByProcess[p.id] || null,
      unread_changes_count: unread?.unread_changes_count ?? 0,
      recent_changes: unread?.recent_changes ?? [],
    }
  })

  return (
    <SecopSeguimientoClient
      initialProcesses={enrichedProcesses}
      initialCount={count || 0}
      initialChanges={recentChanges || []}
      initialAccounts={accounts || []}
      urgentCount={urgentProcesses?.length || 0}
      workerStatus={workerLog as {
        status: 'running' | 'success' | 'error'
        finished_at: string | null
        processes_checked: number
        changes_found: number
      } | null}
      userId={userId}
      userRole={userRole}
    />
  )
}
