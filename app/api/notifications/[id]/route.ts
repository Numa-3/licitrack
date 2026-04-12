import { requireAuth } from '@/lib/admin'

/**
 * PATCH /api/notifications/[id]
 * Mark a notification as read. RLS ensures user can only update their own.
 * Body: { read: true }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth()
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { id } = await params

  const body = await request.json()

  const { error } = await supabase
    .from('notifications')
    .update({ read: body.read ?? true })
    .eq('id', id)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
