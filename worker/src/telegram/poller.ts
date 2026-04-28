import { admin } from '../db.js'
import { config } from '../config.js'
import { getUpdates, sendMessage, TelegramApiError } from './api.js'

const START_RX = /^\/start(?:@\w+)?\s+(\d{6})\s*$/

/**
 * Lee updates del bot buscando comandos /start CODIGO. Solo se llama desde el
 * loop cuando hay códigos de setup activos — el resto del tiempo, no-op.
 *
 * Si encuentra un /start con código válido:
 *   1. Marca el código como usado
 *   2. Guarda chat_id (y title) en telegram_config
 *   3. Responde al grupo "Vinculado"
 */
export async function pollSetupCommands(): Promise<void> {
  if (!config.telegramBotToken) return

  // ¿Hay códigos activos? Si no, no llames a getUpdates.
  const { data: activeCodes } = await admin
    .from('telegram_setup_codes')
    .select('code')
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .limit(1)

  if (!activeCodes?.length) return

  // Lee offset previo para no reprocesar updates ya vistos.
  const { data: cfg } = await admin
    .from('telegram_config')
    .select('last_update_id')
    .eq('id', 1)
    .maybeSingle()

  const offset = cfg?.last_update_id ? cfg.last_update_id + 1 : null

  let updates
  try {
    updates = await getUpdates(config.telegramBotToken, offset, 0)
  } catch (err) {
    if (err instanceof TelegramApiError && err.retryAfter) {
      await new Promise(r => setTimeout(r, err.retryAfter! * 1000))
      return
    }
    console.error('[Telegram] getUpdates failed:', err instanceof Error ? err.message : err)
    return
  }

  if (!updates.length) return

  let maxUpdateId = offset !== null ? offset - 1 : 0
  for (const update of updates) {
    if (update.update_id > maxUpdateId) maxUpdateId = update.update_id
    const text = update.message?.text
    const chat = update.message?.chat
    if (!text || !chat) continue

    const match = text.match(START_RX)
    if (!match) continue

    const code = match[1]
    const { data: codeRow } = await admin
      .from('telegram_setup_codes')
      .select('code, created_by, expires_at, used_at')
      .eq('code', code)
      .maybeSingle()

    let reply: string
    if (!codeRow) {
      reply = 'Código inválido. Generá uno nuevo en LiciTrack.'
    } else if (codeRow.used_at) {
      reply = 'Este código ya se usó. Generá uno nuevo en LiciTrack.'
    } else if (new Date(codeRow.expires_at).getTime() < Date.now()) {
      reply = 'Código expirado. Generá uno nuevo en LiciTrack.'
    } else {
      // ✓ Código válido — vincular
      await admin
        .from('telegram_config')
        .update({
          group_chat_id: chat.id,
          group_title: chat.title ?? null,
          linked_at: new Date().toISOString(),
          linked_by: codeRow.created_by,
        })
        .eq('id', 1)

      await admin
        .from('telegram_setup_codes')
        .update({ used_at: new Date().toISOString(), used_chat_id: chat.id })
        .eq('code', code)

      reply = `Vinculado correctamente${chat.title ? ` a "${chat.title}"` : ''}. Las notificaciones de LiciTrack llegarán acá.`
      console.log(`[Telegram] Linked chat_id=${chat.id} title="${chat.title ?? ''}" via code=${code}`)
    }

    try {
      await sendMessage(config.telegramBotToken, chat.id, reply, {
        reply_to_message_id: update.message!.message_id,
      })
    } catch (err) {
      console.error('[Telegram] Failed to ack /start:', err instanceof Error ? err.message : err)
    }
  }

  // Persistir offset para no reprocesar
  if (maxUpdateId > 0) {
    await admin
      .from('telegram_config')
      .update({ last_update_id: maxUpdateId })
      .eq('id', 1)
  }
}
