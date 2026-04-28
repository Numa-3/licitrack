import { admin } from '../db.js'
import { config } from '../config.js'
import { sendMessage, TelegramApiError } from './api.js'
import { formatNotification, type NotificationRow, type ProcessInfo } from './format.js'

const MAX_PER_TICK = 50
const MAX_ATTEMPTS = 3

/**
 * Lee notifications pendientes y las envía al grupo configurado.
 * No-op silencioso si no hay token o no hay group_chat_id.
 */
export async function sendPendingNotifications(): Promise<{ sent: number; failed: number }> {
  if (!config.telegramBotToken) return { sent: 0, failed: 0 }

  const { data: cfg } = await admin
    .from('telegram_config')
    .select('group_chat_id')
    .eq('id', 1)
    .maybeSingle()

  if (!cfg?.group_chat_id) return { sent: 0, failed: 0 }

  const { data: pending, error } = await admin
    .from('notifications')
    .select('id, title, body, priority, process_id, created_at, telegram_attempts')
    .is('telegram_sent_at', null)
    .lt('telegram_attempts', MAX_ATTEMPTS)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(MAX_PER_TICK)

  if (error) {
    console.error('[Telegram] Error fetching pending notifications:', error.message)
    return { sent: 0, failed: 0 }
  }
  if (!pending?.length) return { sent: 0, failed: 0 }

  const processIds = Array.from(new Set(pending.map(n => n.process_id).filter(Boolean))) as string[]
  const processMap = new Map<string, ProcessInfo>()
  if (processIds.length > 0) {
    const { data: processes } = await admin
      .from('secop_processes')
      .select('id, numero, nombre_personalizado, objeto, entidad')
      .in('id', processIds)
    for (const p of processes ?? []) {
      processMap.set(p.id, p)
    }
  }

  const appBaseUrl = config.appBaseUrl
  let sent = 0
  let failed = 0

  for (const notif of pending) {
    const proc = notif.process_id ? processMap.get(notif.process_id) ?? null : null
    const text = formatNotification(notif as NotificationRow, proc, appBaseUrl)

    try {
      await sendMessage(config.telegramBotToken, Number(cfg.group_chat_id), text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      })
      await admin
        .from('notifications')
        .update({
          telegram_sent_at: new Date().toISOString(),
          telegram_attempts: notif.telegram_attempts + 1,
          telegram_error: null,
        })
        .eq('id', notif.id)
      sent++
    } catch (err) {
      failed++
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[Telegram] Send failed for ${notif.id}: ${message}`)

      await admin
        .from('notifications')
        .update({
          telegram_attempts: notif.telegram_attempts + 1,
          telegram_error: message.slice(0, 500),
        })
        .eq('id', notif.id)

      if (err instanceof TelegramApiError && err.retryAfter) {
        // 429 → respeta retry_after y aborta el resto del batch
        await new Promise(r => setTimeout(r, err.retryAfter! * 1000))
        break
      }
    }
  }

  if (sent > 0 || failed > 0) {
    console.log(`[Telegram] Sent ${sent}, failed ${failed} (pending: ${pending.length})`)
  }
  return { sent, failed }
}
