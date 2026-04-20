/**
 * Format a number as Colombian Pesos (COP).
 * Returns '—' for null/undefined values.
 */
export function formatCurrency(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)
}

type DateLike = string | Date | null | undefined

// Date-only strings (YYYY-MM-DD) get T12:00:00 appended to avoid TZ-edge-day shifts.
function toDate(value: DateLike): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  return new Date(isDateOnly ? `${value}T12:00:00` : value)
}

export function formatDate(value: DateLike): string {
  const d = toDate(value)
  if (!d) return '—'
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateShort(value: DateLike): string {
  const d = toDate(value)
  if (!d) return '—'
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
}

export function formatDateTime(value: DateLike): string {
  const d = toDate(value)
  if (!d) return '—'
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function formatDateLong(value: DateLike): string {
  const d = toDate(value)
  if (!d) return '—'
  return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function timeAgo(value: DateLike): string {
  const d = toDate(value)
  if (!d) return '—'
  const diffMs = Date.now() - d.getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days}d`
  return formatDateShort(d)
}
