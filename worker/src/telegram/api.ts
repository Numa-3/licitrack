/**
 * Cliente HTTP minimalista para la Bot API de Telegram.
 * No usamos librería externa — solo necesitamos sendMessage + getUpdates.
 *
 * Docs: https://core.telegram.org/bots/api
 */

const BASE_URL = 'https://api.telegram.org'

export type TelegramUpdate = {
  update_id: number
  message?: {
    message_id: number
    text?: string
    chat: { id: number; title?: string; type: 'private' | 'group' | 'supergroup' | 'channel' }
    from?: { id: number; username?: string; first_name?: string }
  }
}

export type TelegramSendOptions = {
  parse_mode?: 'HTML' | 'MarkdownV2'
  disable_web_page_preview?: boolean
  reply_to_message_id?: number
}

export class TelegramApiError extends Error {
  constructor(
    public readonly errorCode: number,
    public readonly description: string,
    public readonly retryAfter?: number,
  ) {
    super(`Telegram API ${errorCode}: ${description}`)
  }
}

async function call<T>(token: string, method: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const json = await res.json() as {
    ok: boolean
    result?: T
    error_code?: number
    description?: string
    parameters?: { retry_after?: number }
  }

  if (!json.ok) {
    throw new TelegramApiError(
      json.error_code ?? res.status,
      json.description ?? 'Unknown error',
      json.parameters?.retry_after,
    )
  }
  return json.result as T
}

export async function sendMessage(
  token: string,
  chatId: number,
  text: string,
  options: TelegramSendOptions = {},
): Promise<{ message_id: number }> {
  return call(token, 'sendMessage', {
    chat_id: chatId,
    text,
    ...options,
  })
}

export async function getUpdates(
  token: string,
  offset: number | null,
  timeoutSeconds = 0,
): Promise<TelegramUpdate[]> {
  const body: Record<string, unknown> = { timeout: timeoutSeconds }
  if (offset !== null) body.offset = offset
  return call(token, 'getUpdates', body)
}

export async function getMe(token: string): Promise<{ id: number; username: string; first_name: string }> {
  return call(token, 'getMe', {})
}
