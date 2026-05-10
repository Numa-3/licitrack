import { createAdminSupabaseClient } from '@/lib/supabase/admin'

/**
 * GET /api/cron/worker-health-check
 *
 * Regla 1 del sistema de alertas: detecta "worker muerto" leyendo
 * worker_health.last_heartbeat_at. Esta lógica vive FUERA del worker
 * porque si el worker está muerto, no puede alertarse a sí mismo.
 *
 * Frecuencia esperada: cada 5 min (configurar en Vercel Cron Jobs).
 *
 * Lógica:
 *   - stale > 30 min Y sin alerta firing en última hora → fire alert + enviar
 *     mensaje directo a Telegram (bypass del sender que vive en el worker)
 *   - stale <= 30 min Y la última alerta era firing → resolver + enviar "✅ Resuelto"
 */

const STALE_THRESHOLD_MS = 30 * 60 * 1000  // 30 min
const COOLDOWN_MS = 60 * 60 * 1000          // 1h, igual que alerts.ts

const ALERT_TYPE = 'worker_dead'

async function sendTelegramMessage(
  token: string,
  chatId: number,
  text: string,
): Promise<void> {
  const url = `https://api.telegram.org/bot${token}/sendMessage`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  })
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`Telegram API ${res.status}: ${errBody.slice(0, 200)}`)
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function formatFiringMessage(staleMinutes: number): string {
  return `🚨 <b>CRÍTICO</b> · Worker muerto\n\n${escapeHtml(
    `Worker no envía heartbeat desde hace ${staleMinutes} min. Probablemente el servicio LiciTrack-Worker está caído o colgado. Revisa el server.`,
  )}`
}

function formatResolvedMessage(downMinutes: number): string {
  return `✅ <b>Resuelto</b> · Worker muerto\n\n${escapeHtml(
    `Worker recuperado tras ~${downMinutes} min de outage.`,
  )}`
}

export async function GET(request: Request) {
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

    // 1. Leer estado actual del worker
    const { data: health } = await admin
      .from('worker_health')
      .select('last_heartbeat_at, uptime_started_at')
      .eq('id', 1)
      .single()

    if (!health?.last_heartbeat_at) {
      return Response.json({ ok: false, error: 'worker_health row not found' }, { status: 500 })
    }

    const now = Date.now()
    const lastHeartbeatMs = new Date(health.last_heartbeat_at).getTime()
    const staleMs = now - lastHeartbeatMs
    const staleMinutes = Math.floor(staleMs / 60000)
    const isStale = staleMs > STALE_THRESHOLD_MS

    // 2. Revisar estado del último alert worker_dead (para resolución)
    const { data: latest } = await admin
      .from('system_alerts')
      .select('id, state, detected_at')
      .eq('alert_type', ALERT_TYPE)
      .order('detected_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const latestIsFiring = latest?.state === 'firing'

    // 3. Decidir acción
    if (isStale) {
      // Cooldown: ¿hay firing en última hora?
      const cooldownStart = new Date(now - COOLDOWN_MS).toISOString()
      const { data: recentFiring } = await admin
        .from('system_alerts')
        .select('id')
        .eq('alert_type', ALERT_TYPE)
        .eq('state', 'firing')
        .gte('detected_at', cooldownStart)
        .limit(1)

      const hasRecentFiring = (recentFiring?.length ?? 0) > 0
      if (hasRecentFiring) {
        return Response.json({
          ok: true,
          action: 'noop_cooldown',
          stale_minutes: staleMinutes,
        })
      }

      // Fire alert: insert + send Telegram message
      const message = `Worker no envía heartbeat desde hace ${staleMinutes} min. Probablemente el servicio LiciTrack-Worker está caído o colgado.`
      await admin.from('system_alerts').insert({
        alert_type: ALERT_TYPE,
        severity: 'critical',
        state: 'firing',
        target_id: null,
        message,
        context: { stale_minutes: staleMinutes, last_heartbeat_at: health.last_heartbeat_at },
      })

      // Enviar mensaje directo (no podemos confiar en el sender del worker)
      const token = process.env.TELEGRAM_BOT_TOKEN
      const { data: cfg } = await admin
        .from('telegram_config')
        .select('group_chat_id')
        .eq('id', 1)
        .maybeSingle()

      if (token && cfg?.group_chat_id) {
        try {
          await sendTelegramMessage(token, Number(cfg.group_chat_id), formatFiringMessage(staleMinutes))
        } catch (err) {
          console.error('[Cron] Failed to send Telegram alert:', err instanceof Error ? err.message : err)
        }
      }

      return Response.json({
        ok: true,
        action: 'fired',
        stale_minutes: staleMinutes,
      })
    }

    // No stale: si había firing, resolver
    if (latestIsFiring && latest) {
      // Calcular cuánto duró el outage
      const firedAtMs = new Date(latest.detected_at).getTime()
      const downMinutes = Math.floor((now - firedAtMs) / 60000)

      await admin.from('system_alerts').insert({
        alert_type: ALERT_TYPE,
        severity: 'warning',
        state: 'resolved',
        target_id: null,
        message: `Worker recuperado tras ~${downMinutes} min de outage`,
        context: { down_minutes: downMinutes, resolved_after_alert: latest.id },
      })

      const token = process.env.TELEGRAM_BOT_TOKEN
      const { data: cfg } = await admin
        .from('telegram_config')
        .select('group_chat_id')
        .eq('id', 1)
        .maybeSingle()

      if (token && cfg?.group_chat_id) {
        try {
          await sendTelegramMessage(token, Number(cfg.group_chat_id), formatResolvedMessage(downMinutes))
        } catch (err) {
          console.error('[Cron] Failed to send Telegram resolution:', err instanceof Error ? err.message : err)
        }
      }

      return Response.json({
        ok: true,
        action: 'resolved',
        stale_minutes: staleMinutes,
        down_minutes: downMinutes,
      })
    }

    return Response.json({
      ok: true,
      action: 'noop_healthy',
      stale_minutes: staleMinutes,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[Cron] worker-health-check failed:', message)
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}
