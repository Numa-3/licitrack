/**
 * Sistema de alertas de salud del worker.
 *
 * Reglas que el worker puede chequear por sí mismo (no incluye Regla 1
 * "worker dead" que se hace desde un cron externo, ni Reglas 2-3 que
 * requieren tracking adicional en login.ts).
 *
 * Cooldown: cada par (alert_type, target_id) solo puede disparar 1 firing
 * por hora. La función markResolvedIfActive emite mensaje "✅ Resuelto"
 * cuando la condición desaparece.
 */
import { admin } from './db.js'

const COOLDOWN_HOURS = 1

export type AlertType =
  | 'worker_dead'
  | 'login_failures'
  | 'excessive_logins'
  | 'stale_processes'
  | 'no_cycles'
  | 'stuck_notifications'

export type AlertSeverity = 'warning' | 'critical'

/**
 * Hora actual en horario activo del worker (06:00–22:00 Bogotá).
 * Algunas reglas (no_cycles) solo aplican durante el horario activo.
 */
function isInActiveHour(): boolean {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    hour12: false,
  })
  let hour = parseInt(fmt.format(new Date()), 10)
  if (hour === 24) hour = 0
  return hour >= 6 && hour < 22
}

/**
 * Inserta una alerta firing si no hay otra del mismo tipo+target en la última hora.
 * Primera línea contra spam: si una condición persiste, recibís 1 mensaje por hora.
 */
async function insertAlertWithCooldown(
  type: AlertType,
  severity: AlertSeverity,
  targetId: string | null,
  message: string,
  context: Record<string, unknown> = {},
): Promise<void> {
  const cooldownStart = new Date(Date.now() - COOLDOWN_HOURS * 3600 * 1000).toISOString()

  let cooldownQuery = admin
    .from('system_alerts')
    .select('id')
    .eq('alert_type', type)
    .eq('state', 'firing')
    .gte('detected_at', cooldownStart)
    .limit(1)

  cooldownQuery = targetId === null
    ? cooldownQuery.is('target_id', null)
    : cooldownQuery.eq('target_id', targetId)

  const { data: existing, error: cooldownError } = await cooldownQuery
  if (cooldownError) {
    console.error('[Alerts] Cooldown query failed:', cooldownError.message)
    return
  }
  if (existing && existing.length > 0) return // cooldown activo, skip

  const { error } = await admin.from('system_alerts').insert({
    alert_type: type,
    severity,
    state: 'firing',
    target_id: targetId,
    message,
    context,
  })
  if (error) {
    console.error('[Alerts] Insert failed:', error.message)
  } else {
    console.log(`[Alerts] ${severity.toUpperCase()} ${type}${targetId ? ` (${targetId})` : ''}: ${message}`)
  }
}

/**
 * Si el último evento de (tipo+target) es 'firing', inserta una nueva fila con
 * state='resolved' para que el sender mande "✅ Resuelto". Si ya está resuelto
 * o nunca disparó, no hace nada.
 */
async function markResolvedIfActive(
  type: AlertType,
  targetId: string | null,
): Promise<void> {
  let query = admin
    .from('system_alerts')
    .select('id, state, message')
    .eq('alert_type', type)
    .order('detected_at', { ascending: false })
    .limit(1)

  query = targetId === null
    ? query.is('target_id', null)
    : query.eq('target_id', targetId)

  const { data: latest, error: queryError } = await query
  if (queryError) {
    console.error('[Alerts] Latest query failed:', queryError.message)
    return
  }
  if (!latest || latest.length === 0) return // nunca disparó
  if (latest[0].state !== 'firing') return // ya resuelto

  const { error } = await admin.from('system_alerts').insert({
    alert_type: type,
    severity: 'warning', // las resoluciones no tienen severidad alta
    state: 'resolved',
    target_id: targetId,
    message: latest[0].message, // mismo mensaje original, el formateador agrega "✅ Resuelto"
    context: { resolved_after_alert: latest[0].id },
  })
  if (error) {
    console.error('[Alerts] Resolve insert failed:', error.message)
  } else {
    console.log(`[Alerts] RESOLVED ${type}${targetId ? ` (${targetId})` : ''}`)
  }
}

// ── Reglas ────────────────────────────────────────────────────

/** Regla 6: notificaciones que llegaron a 3 intentos sin enviarse a Telegram */
async function checkStuckNotifications(): Promise<void> {
  const { data: stuck, error } = await admin
    .from('notifications')
    .select('id')
    .gte('telegram_attempts', 3)
    .is('telegram_sent_at', null)
    .limit(50)

  if (error) {
    console.error('[Alerts] checkStuckNotifications query failed:', error.message)
    return
  }

  if (stuck && stuck.length > 0) {
    await insertAlertWithCooldown(
      'stuck_notifications',
      'warning',
      null,
      `${stuck.length} notificación${stuck.length === 1 ? '' : 'es'} atascada${stuck.length === 1 ? '' : 's'} en Telegram (3+ intentos fallidos)`,
      { count: stuck.length, sample_ids: stuck.slice(0, 5).map(n => n.id) },
    )
  } else {
    await markResolvedIfActive('stuck_notifications', null)
  }
}

/** Regla 4: procesos con monitoring_enabled sin chequear hace > 12h (incluye nunca chequeados) */
async function checkStaleProcesses(): Promise<void> {
  const cutoff = new Date(Date.now() - 12 * 3600 * 1000).toISOString()

  const { data: stale, error } = await admin
    .from('secop_processes')
    .select('id, secop_process_id, custom_name')
    .eq('monitoring_enabled', true)
    .or(`last_monitored_at.is.null,last_monitored_at.lt.${cutoff}`)
    .limit(50)

  if (error) {
    console.error('[Alerts] checkStaleProcesses query failed:', error.message)
    return
  }

  if (stale && stale.length > 0) {
    const sampleNames = stale
      .slice(0, 3)
      .map(p => p.custom_name || p.secop_process_id)
      .filter(Boolean)
      .join(', ')
    const message = sampleNames
      ? `${stale.length} proceso${stale.length === 1 ? '' : 's'} sin monitorear hace > 12h. Ejemplos: ${sampleNames}`
      : `${stale.length} proceso${stale.length === 1 ? '' : 's'} sin monitorear hace > 12h`
    await insertAlertWithCooldown('stale_processes', 'warning', null, message, {
      count: stale.length,
      sample_ids: stale.slice(0, 5).map(p => p.id),
    })
  } else {
    await markResolvedIfActive('stale_processes', null)
  }
}

/**
 * Regla 2: cuentas con 3+ fallos consecutivos de login.
 * Severity: warning si 3-5 fallos, critical si >= 6.
 * Lee `secop_accounts.consecutive_login_failures` (mantenido por login.ts).
 */
async function checkLoginFailureStreak(): Promise<void> {
  const { data: failing, error } = await admin
    .from('secop_accounts')
    .select('id, name, consecutive_login_failures')
    .eq('is_active', true)
    .gte('consecutive_login_failures', 3)

  if (error) {
    console.error('[Alerts] checkLoginFailureStreak query failed:', error.message)
    return
  }

  const currentFiringIds = new Set<string>((failing ?? []).map(a => a.id))

  // Obtener IDs de cuentas con alerta firing previamente para poder resolverlas
  const { data: previousFiring } = await admin
    .from('system_alerts')
    .select('target_id')
    .eq('alert_type', 'login_failures')
    .eq('state', 'firing')
    .not('target_id', 'is', null)

  const previousFiringIds = new Set<string>(
    (previousFiring ?? [])
      .map(a => a.target_id)
      .filter((id): id is string => id !== null),
  )

  // Insertar/refrescar alertas para cuentas actualmente fallando
  for (const acc of failing ?? []) {
    const severity: AlertSeverity = acc.consecutive_login_failures >= 6 ? 'critical' : 'warning'
    await insertAlertWithCooldown(
      'login_failures',
      severity,
      acc.id,
      `Cuenta ${acc.name}: ${acc.consecutive_login_failures} fallos de login consecutivos`,
      { account_name: acc.name, consecutive_failures: acc.consecutive_login_failures },
    )
  }

  // Resolver alertas para cuentas que ya no están fallando
  for (const prevId of previousFiringIds) {
    if (!currentFiringIds.has(prevId)) {
      await markResolvedIfActive('login_failures', prevId)
    }
  }
}

/**
 * Regla 3: cuentas con > 15 logins exitosos en últimas 24h.
 * Indica que SECOP está invalidando sesiones antes de las 4h del TTL,
 * forzando re-logins frecuentes (= captchas extra).
 */
async function checkExcessiveLogins(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

  const { data: logs, error } = await admin
    .from('secop_login_log')
    .select('account_id')
    .gte('attempted_at', cutoff)
    .eq('status', 'success')

  if (error) {
    console.error('[Alerts] checkExcessiveLogins query failed:', error.message)
    return
  }

  // Contar logins exitosos por cuenta
  const counts = new Map<string, number>()
  for (const log of logs ?? []) {
    counts.set(log.account_id, (counts.get(log.account_id) ?? 0) + 1)
  }

  const overThreshold = Array.from(counts.entries()).filter(([, count]) => count > 15)
  const currentFiringIds = new Set<string>(overThreshold.map(([id]) => id))

  // Obtener IDs previamente firing para resolución
  const { data: previousFiring } = await admin
    .from('system_alerts')
    .select('target_id')
    .eq('alert_type', 'excessive_logins')
    .eq('state', 'firing')
    .not('target_id', 'is', null)

  const previousFiringIds = new Set<string>(
    (previousFiring ?? [])
      .map(a => a.target_id)
      .filter((id): id is string => id !== null),
  )

  if (overThreshold.length > 0) {
    // Hidratar nombres de cuentas para mensajes legibles
    const ids = overThreshold.map(([id]) => id)
    const { data: accounts } = await admin
      .from('secop_accounts')
      .select('id, name')
      .in('id', ids)
    const nameMap = new Map<string, string>()
    for (const a of accounts ?? []) nameMap.set(a.id, a.name)

    for (const [accountId, count] of overThreshold) {
      const name = nameMap.get(accountId) ?? accountId
      await insertAlertWithCooldown(
        'excessive_logins',
        'critical',
        accountId,
        `Cuenta ${name}: ${count} logins en últimas 24h (> 15 = SECOP invalidando sesiones temprano)`,
        { account_name: name, login_count_24h: count },
      )
    }
  }

  // Resolver para cuentas que volvieron a la normalidad
  for (const prevId of previousFiringIds) {
    if (!currentFiringIds.has(prevId)) {
      await markResolvedIfActive('excessive_logins', prevId)
    }
  }
}

/** Regla 5: 0 ciclos exitosos en últimas 2h durante horario activo (06:00–22:00 Bogotá) */
async function checkNoCyclesInWindow(): Promise<void> {
  if (!isInActiveHour()) return // fuera de horario, regla no aplica

  const cutoff = new Date(Date.now() - 2 * 3600 * 1000).toISOString()
  const { count, error } = await admin
    .from('secop_monitor_log')
    .select('*', { count: 'exact', head: true })
    .gte('started_at', cutoff)
    .eq('status', 'success')

  if (error) {
    console.error('[Alerts] checkNoCyclesInWindow query failed:', error.message)
    return
  }

  if ((count ?? 0) === 0) {
    await insertAlertWithCooldown(
      'no_cycles',
      'critical',
      null,
      'No hay ciclos exitosos en las últimas 2h (en horario activo)',
      { window_hours: 2 },
    )
  } else {
    await markResolvedIfActive('no_cycles', null)
  }
}

/**
 * Entry point: corre todas las reglas que el worker puede chequear por sí mismo.
 * Se llama desde el polling loop cada 30s. Cada regla maneja sus propios errores.
 *
 * Pendiente: Regla 1 (worker_dead) se hace en Vercel Cron, no aquí (paradoja:
 * si el worker está muerto, no puede alertarse a sí mismo).
 */
export async function runAlertChecks(): Promise<void> {
  await checkStuckNotifications()
  await checkStaleProcesses()
  await checkNoCyclesInWindow()
  await checkLoginFailureStreak()
  await checkExcessiveLogins()
}
