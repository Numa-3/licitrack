import { getAuthUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TelegramSettingsClient from '@/components/features/TelegramSettingsClient'

export const dynamic = 'force-dynamic'

export default async function TelegramSettingsPage() {
  const { supabase, userRole } = await getAuthUser()

  if (userRole !== 'jefe') redirect('/dashboard')

  const { data: cfg } = await supabase
    .from('telegram_config')
    .select('group_title, linked_at, group_chat_id')
    .eq('id', 1)
    .maybeSingle()

  return (
    <TelegramSettingsClient
      initialLinked={Boolean(cfg?.group_chat_id)}
      initialGroupTitle={cfg?.group_title ?? null}
      initialLinkedAt={cfg?.linked_at ?? null}
    />
  )
}
