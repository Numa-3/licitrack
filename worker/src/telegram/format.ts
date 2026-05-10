/**
 * Formato de mensajes Telegram desde una fila de notifications.
 * Usa parse_mode HTML — más simple que MarkdownV2 (no requiere escape salvaje).
 */

export type NotificationRow = {
  title: string
  body: string
  priority: 'low' | 'medium' | 'high'
  process_id: string | null
  created_at: string
}

export type ProcessInfo = {
  numero?: string | null
  nombre_personalizado?: string | null
  objeto?: string | null
  entidad?: string | null
}

const PRIORITY_LABEL: Record<NotificationRow['priority'], string> = {
  high: '[ALTA]',
  medium: '[MEDIA]',
  low: '[BAJA]',
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function formatNotification(
  notif: NotificationRow,
  process: ProcessInfo | null,
  appBaseUrl: string,
): string {
  const lines: string[] = []

  const tag = PRIORITY_LABEL[notif.priority]
  lines.push(`${tag} <b>${escapeHtml(notif.title)}</b>`)

  if (process) {
    const procLabel = process.nombre_personalizado || process.numero || process.objeto || 'Proceso'
    if (process.entidad) {
      lines.push(`<i>${escapeHtml(procLabel)}</i> · ${escapeHtml(process.entidad)}`)
    } else {
      lines.push(`<i>${escapeHtml(procLabel)}</i>`)
    }
  }

  lines.push('')
  lines.push(escapeHtml(notif.body))

  if (notif.process_id) {
    const url = `${appBaseUrl.replace(/\/$/, '')}/secop/seguimiento?process=${notif.process_id}`
    lines.push('')
    lines.push(`<a href="${url}">Ver en LiciTrack</a>`)
  }

  return lines.join('\n')
}

// ── Alertas de salud del sistema ────────────────────────────

export type AlertRow = {
  alert_type: string
  severity: 'warning' | 'critical'
  state: 'firing' | 'resolved'
  message: string
}

const ALERT_TYPE_LABEL: Record<string, string> = {
  worker_dead: 'Worker muerto',
  login_failures: 'Fallos de login',
  excessive_logins: 'Logins excesivos',
  stale_processes: 'Procesos sin monitorear',
  no_cycles: 'Sin ciclos recientes',
  stuck_notifications: 'Notificaciones atascadas',
}

/**
 * Formatea una fila de system_alerts como mensaje HTML para Telegram.
 * Prefijos según severity + state:
 *   - resolved → "✅ Resuelto"
 *   - critical firing → "🚨 CRÍTICO"
 *   - warning firing → "⚠️ Aviso"
 */
export function formatAlert(alert: AlertRow): string {
  let prefix: string
  if (alert.state === 'resolved') {
    prefix = '✅ <b>Resuelto</b>'
  } else if (alert.severity === 'critical') {
    prefix = '🚨 <b>CRÍTICO</b>'
  } else {
    prefix = '⚠️ <b>Aviso</b>'
  }

  const typeLabel = ALERT_TYPE_LABEL[alert.alert_type] ?? alert.alert_type
  return `${prefix} · ${escapeHtml(typeLabel)}\n\n${escapeHtml(alert.message)}`
}
