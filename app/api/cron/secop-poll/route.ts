import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { runRadarPoll } from '@/lib/secop/radar'

/**
 * GET /api/cron/secop-poll
 *
 * Called by an external scheduler (Vercel Cron, GitHub Actions, etc.).
 * Protected by CRON_SECRET — no user session required.
 *
 * Middleware is excluded from /api/cron/* paths so this route
 * doesn't get redirected to /login.
 */
export async function GET(request: Request) {
  // Verify cron secret
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return Response.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminSupabaseClient()
    const result = await runRadarPoll(admin)

    return Response.json({
      ok: true,
      records_fetched: result.recordsFetched,
      new_processes: result.newProcesses,
      updated_processes: result.updatedProcesses,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[SECOP Cron] Poll failed:', message)
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}
