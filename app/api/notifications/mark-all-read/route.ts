import { requireAuth } from '@/lib/admin'

/**
 * POST /api/notifications/mark-all-read
 * Mark all unread notifications as read for the current user.
 */
export async function POST() {
  const auth = await requireAuth()
  if ('error' in auth) return auth.error
  const { supabase, userId } = auth

  const { error, count } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('read', false)
    .eq('user_id', userId)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ updated: count || 0 })
}
