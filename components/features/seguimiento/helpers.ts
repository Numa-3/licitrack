export { timeAgo } from '@/lib/utils/format'

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
