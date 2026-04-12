import { requireAuth } from '@/lib/admin'

/**
 * GET /api/secop/dashboard-stats
 * Returns KPI data for the SECOP monitoring dashboard.
 */
export async function GET() {
  const auth = await requireAuth()
  if ('error' in auth) return auth.error
  const { supabase, role } = auth

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const in48h = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
  const now = new Date().toISOString()

  const [monitored, urgent, changesToday, workerLog] = await Promise.all([
    supabase
      .from('secop_processes')
      .select('*', { count: 'exact', head: true })
      .eq('monitoring_enabled', true),
    supabase
      .from('secop_processes')
      .select('*', { count: 'exact', head: true })
      .eq('monitoring_enabled', true)
      .not('next_deadline', 'is', null)
      .lte('next_deadline', in48h)
      .gte('next_deadline', now),
    supabase
      .from('secop_process_changes')
      .select('*', { count: 'exact', head: true })
      .gte('detected_at', today.toISOString()),
    role === 'jefe'
      ? supabase
          .from('secop_monitor_log')
          .select('status, finished_at, processes_checked, changes_found')
          .order('started_at', { ascending: false })
          .limit(1)
          .single()
      : Promise.resolve({ data: null }),
  ])

  return Response.json({
    monitored_count: monitored.count || 0,
    urgent_count: urgent.count || 0,
    changes_today: changesToday.count || 0,
    worker_status: workerLog.data || null,
  })
}
