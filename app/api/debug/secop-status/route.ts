import { requireJefe } from '@/lib/admin'

/**
 * GET /api/debug/secop-status
 * Diagnostic endpoint: returns the current state of all SECOP accounts and
 * the 10 most recent worker monitor log entries.
 *
 * Use this to troubleshoot discovery/login issues without needing server logs.
 */
export async function GET() {
  const auth = await requireJefe()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { data: accounts } = await supabase
    .from('secop_accounts')
    .select(`
      id, name, username, is_active,
      last_login_at, last_sync_at, sync_requested_at,
      cookies_expire_at, process_count,
      discovered_entities, monitored_entities,
      created_at
    `)
    .order('created_at', { ascending: false })

  const { data: logs } = await supabase
    .from('secop_monitor_log')
    .select('id, account_id, started_at, finished_at, status, processes_checked, changes_found, error_message')
    .order('started_at', { ascending: false })
    .limit(10)

  // Derived state per account to make the pipeline failure obvious
  const now = Date.now()
  const enriched = (accounts || []).map(a => ({
    ...a,
    _derived: {
      has_ever_logged_in: !!a.last_login_at,
      has_ever_synced: !!a.last_sync_at,
      session_status:
        !a.cookies_expire_at ? 'never_logged_in'
        : new Date(a.cookies_expire_at).getTime() > now ? 'active'
        : 'expired',
      sync_flag_pending: !!a.sync_requested_at,
      minutes_since_last_login: a.last_login_at
        ? Math.round((now - new Date(a.last_login_at).getTime()) / 60_000)
        : null,
      minutes_since_last_sync: a.last_sync_at
        ? Math.round((now - new Date(a.last_sync_at).getTime()) / 60_000)
        : null,
    },
  }))

  return Response.json({
    accounts: enriched,
    recent_logs: logs || [],
    now: new Date().toISOString(),
  })
}
