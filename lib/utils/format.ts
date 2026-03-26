/**
 * Format a number as Colombian Pesos (COP).
 * Returns '—' for null/undefined values.
 */
export function formatCurrency(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)
}
