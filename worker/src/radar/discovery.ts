/**
 * Orquestador del radar de descubrimiento.
 *
 * Por cada región habilitada en secop_radar_config:
 *   1. Scrapea el buscador público (search-scraper) filtrando por región + estado
 *      + fecha de publicación (últimos LOOKBACK_DAYS días).
 *   2. Aplica los filtros del lado nuestro (exclude/include/cuantía).
 *   3. Deduplica contra secop_radar_seen (solo lo NO alertado aún).
 *   4. Primer run → digest de los más recientes (anti-flood), marca todo como visto.
 *      Runs siguientes → 1 alerta Telegram por proceso nuevo.
 *
 * Corre dentro del worker (que ya tiene Playwright + CapSolver + el emisor de
 * Telegram). Se invoca desde index.ts con su propio timer (~1h).
 */
import { admin } from '../db.js'
import { config } from '../config.js'
import { sendMessage, TelegramApiError } from '../telegram/api.js'
import { searchSecopProcesses } from './search-scraper.js'
import { applyFilter, type RadarFilter } from './filters.js'
import { formatRadarAlert, formatRadarDigest, publicUrl } from './format.js'
import type { RadarSearchRow } from './parse-search-results.js'

const LOOKBACK_DAYS = 2          // ventana de "fecha de publicación desde"
const SEED_DIGEST_COUNT = 10     // cuántos mostrar en el digest del primer run
const DIGEST_THRESHOLD = 12      // si un run normal trae más que esto, mandar digest en vez de N msgs

type RadarConfigRow = {
  id: string
  region: string
  estado: string
  exclude_keywords: string[]
  include_keywords: string[]
  min_value: number | null
  max_value: number | null
  enabled: boolean
  seeded_at: string | null
}

export type RadarDiscoveryResult = { regiones: number; nuevos: number; alertados: number }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function getGroupChatId(): Promise<number | null> {
  if (!config.telegramBotToken) return null
  const { data } = await admin
    .from('telegram_config')
    .select('group_chat_id')
    .eq('id', 1)
    .maybeSingle()
  return data?.group_chat_id ? Number(data.group_chat_id) : null
}

async function sendTelegram(chatId: number, text: string): Promise<boolean> {
  try {
    await sendMessage(config.telegramBotToken, chatId, text, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    })
    return true
  } catch (err) {
    if (err instanceof TelegramApiError && err.retryAfter) await sleep(err.retryAfter * 1000)
    console.error('[Radar] Telegram send failed:', err instanceof Error ? err.message : err)
    return false
  }
}

function toSeenRow(row: RadarSearchRow, region: string) {
  return {
    notice_uid: row.notice_uid,
    region,
    referencia: row.referencia,
    entidad: row.entidad,
    objeto: row.descripcion,
    fase: row.fase,
    cuantia: row.cuantia_cop,
    fecha_publicacion: row.fecha_publicacion,
    fecha_cierre: row.fecha_presentacion,
    estado: row.estado,
    url: row.notice_uid ? publicUrl(row.notice_uid) : null,
  }
}

export async function runRadarDiscovery(): Promise<RadarDiscoveryResult> {
  const result: RadarDiscoveryResult = { regiones: 0, nuevos: 0, alertados: 0 }

  const { data: configs, error } = await admin
    .from('secop_radar_config')
    .select('*')
    .eq('enabled', true)

  if (error) {
    console.error('[Radar] Error leyendo config:', error.message)
    return result
  }
  if (!configs?.length) return result

  const chatId = await getGroupChatId()

  for (const cfg of configs as RadarConfigRow[]) {
    result.regiones++
    try {
      const r = await processRegion(cfg, chatId)
      result.nuevos += r.nuevos
      result.alertados += r.alertados
    } catch (err) {
      console.error(`[Radar] región "${cfg.region}" falló:`, err instanceof Error ? err.message : err)
    }
  }

  return result
}

async function processRegion(
  cfg: RadarConfigRow,
  chatId: number | null,
): Promise<{ nuevos: number; alertados: number }> {
  const publishedFrom = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000)
  const rows = await searchSecopProcesses({ region: cfg.region, status: cfg.estado, publishedFrom })

  const filter: RadarFilter = {
    exclude_keywords: cfg.exclude_keywords,
    include_keywords: cfg.include_keywords,
    min_value: cfg.min_value,
    max_value: cfg.max_value,
  }
  const interesantes = applyFilter(rows, filter).filter((r) => r.notice_uid)
  if (!interesantes.length) return { nuevos: 0, alertados: 0 }

  const uids = interesantes.map((r) => r.notice_uid as string)

  // Ya alertados (alerted_at no nulo) → no re-alertar. Los vistos-sin-alertar
  // (envío falló antes) SÍ se reintentan.
  const { data: alerted } = await admin
    .from('secop_radar_seen')
    .select('notice_uid')
    .in('notice_uid', uids)
    .not('alerted_at', 'is', null)
  const alertedSet = new Set((alerted ?? []).map((a) => a.notice_uid))

  const pendientes = interesantes.filter((r) => !alertedSet.has(r.notice_uid as string))
  if (!pendientes.length) return { nuevos: 0, alertados: 0 }

  // Registrar como vistos (sin pisar first_seen ni alerted_at previos).
  await admin
    .from('secop_radar_seen')
    .upsert(pendientes.map((r) => toSeenRow(r, cfg.region)), {
      onConflict: 'notice_uid',
      ignoreDuplicates: true,
    })

  const markAlerted = (notices: string[]) =>
    admin.from('secop_radar_seen').update({ alerted_at: new Date().toISOString() }).in('notice_uid', notices)

  // ── PRIMER RUN: digest de los más recientes + marcar todo visto (anti-flood) ──
  if (!cfg.seeded_at) {
    if (chatId) {
      await sendTelegram(chatId, formatRadarDigest(cfg.region, pendientes.slice(0, SEED_DIGEST_COUNT), pendientes.length))
    }
    await markAlerted(uids) // todo lo de este run queda "ya avisado"
    await admin.from('secop_radar_config').update({ seeded_at: new Date().toISOString() }).eq('id', cfg.id)
    return { nuevos: pendientes.length, alertados: Math.min(pendientes.length, SEED_DIGEST_COUNT) }
  }

  if (!chatId) return { nuevos: pendientes.length, alertados: 0 }

  // ── Anti-flood: si llegan muchos de golpe, un solo digest en vez de N msgs ──
  if (pendientes.length > DIGEST_THRESHOLD) {
    const ok = await sendTelegram(chatId, formatRadarDigest(cfg.region, pendientes.slice(0, SEED_DIGEST_COUNT), pendientes.length))
    if (ok) await markAlerted(pendientes.map((r) => r.notice_uid as string))
    return { nuevos: pendientes.length, alertados: ok ? pendientes.length : 0 }
  }

  // ── Run normal: 1 alerta por proceso, marcar alerted solo si el envío fue ok ──
  let alertados = 0
  for (const row of pendientes) {
    const ok = await sendTelegram(chatId, formatRadarAlert(cfg.region, row))
    if (ok) {
      await markAlerted([row.notice_uid as string])
      alertados++
    }
  }
  return { nuevos: pendientes.length, alertados }
}
