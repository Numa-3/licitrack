export function timeAgo(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diffMs = now - date

  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days}d`
  return new Date(dateStr).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
}

export function estadoStyle(estado: string | null): string {
  switch (estado) {
    case 'En ejecución': case 'InExecution': return 'bg-blue-100 text-blue-800'
    case 'Cerrado': case 'Closed': return 'bg-gray-200 text-gray-700'
    case 'Terminado': case 'Terminated': return 'bg-emerald-100 text-emerald-800'
    case 'Modificación aceptada': case 'Modified': return 'bg-orange-100 text-orange-800'
    case 'Liquidado': return 'bg-violet-100 text-violet-800'
    default: return 'bg-gray-200 text-gray-700'
  }
}
