export const CONTRACT_TYPE_LABELS: Record<string, string> = {
  supply: 'Suministro', construction: 'Obra', sale: 'Compraventa',
  service: 'Servicios', logistics: 'Logística', mixed: 'Mixto',
  purchase: 'Compras', // legacy
}

export const CONTRACT_TYPE_ICONS: Record<string, string> = {
  supply: '🛒', construction: '🏗️', sale: '💰',
  service: '🔧', logistics: '🚚', mixed: '📦',
  purchase: '🛒', // legacy
}

export const STATUS_FLOWS: Record<string, string[]> = {
  supply: ['pending', 'sourced', 'purchased', 'shipped', 'received'],
  purchase: ['pending', 'sourced', 'purchased', 'shipped', 'received'], // legacy
  construction: ['pending', 'in_progress', 'done'],
  sale: ['pending', 'sourced', 'purchased', 'shipped', 'received'],
  logistics: ['pending', 'in_progress', 'done'],
  service: ['pending', 'in_progress', 'done'],
}

export const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente', sourced: 'Con proveedor', purchased: 'Comprado',
  shipped: 'Enviado', received: 'Recibido', in_progress: 'En gestión',
  done: 'Listo', completed: 'Completado',
}

export const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  sourced: 'bg-yellow-50 text-yellow-700',
  purchased: 'bg-blue-50 text-blue-700',
  shipped: 'bg-purple-50 text-purple-700',
  received: 'bg-green-50 text-green-700',
  in_progress: 'bg-yellow-50 text-yellow-700',
  done: 'bg-green-50 text-green-700',
  completed: 'bg-green-50 text-green-700',
}

export const PAYMENT_LABELS: Record<string, string> = {
  unpaid: 'Sin pagar', invoiced: 'Facturado', paid: 'Pagado',
}

export const PAYMENT_COLORS: Record<string, string> = {
  unpaid: 'bg-red-50 text-red-600',
  invoiced: 'bg-amber-50 text-amber-700',
  paid: 'bg-green-50 text-green-700',
}

export const FINAL_STATUSES = new Set(['completed', 'done', 'listo', 'finalizado', 'received'])

export const ACTION_LABELS: Record<string, string> = {
  status_changed: 'Cambió estado',
  payment_status_changed: 'Cambió estado de pago',
  supplier_assigned: 'Asignó proveedor',
  assigned_to_changed: 'Reasignó responsable',
  item_updated: 'Editó ítem',
  items_batch_status: 'Cambio masivo de estado',
  items_batch_supplier: 'Asignación masiva de proveedor',
  items_batch_assign: 'Asignación masiva de responsable',
}

export const CONTRACT_STATUS_COLOR: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', active: 'bg-blue-50 text-blue-700',
  completed: 'bg-green-50 text-green-700', cancelled: 'bg-red-50 text-red-600',
}

export const CONTRACT_STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador', active: 'Activo', completed: 'Completado', cancelled: 'Cancelado',
}
