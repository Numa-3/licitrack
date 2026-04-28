import { requireJefe } from '@/lib/admin'

export async function GET() {
  const auth = await requireJefe()
  if ('error' in auth) return auth.error
  const { supabase, userId } = auth

  const { data: cfg } = await supabase
    .from('telegram_config')
    .select('group_title, linked_at, group_chat_id')
    .eq('id', 1)
    .maybeSingle()

  const { data: pendingCode } = await supabase
    .from('telegram_setup_codes')
    .select('code, expires_at')
    .eq('created_by', userId)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return Response.json({
    linked: Boolean(cfg?.group_chat_id),
    group_title: cfg?.group_title ?? null,
    linked_at: cfg?.linked_at ?? null,
    pending_code: pendingCode?.code ?? null,
    code_expires_at: pendingCode?.expires_at ?? null,
  })
}
