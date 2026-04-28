import { requireJefe } from '@/lib/admin'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

export async function POST() {
  const auth = await requireJefe()
  if ('error' in auth) return auth.error

  const admin = createAdminSupabaseClient()
  const { error } = await admin
    .from('telegram_config')
    .update({
      group_chat_id: null,
      group_title: null,
      linked_at: null,
      linked_by: null,
    })
    .eq('id', 1)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ ok: true })
}
