'use client'

type Props = {
  selectedCount: number
  purchasedSelectedCount: number
  onAssignSupplier: () => void
  onChangeStatus: () => void
  onAssignUser: () => void
  onCreateShipment: () => void
  onClear: () => void
}

export default function BatchToolbar({
  selectedCount, purchasedSelectedCount,
  onAssignSupplier, onChangeStatus, onAssignUser, onCreateShipment, onClear,
}: Props) {
  if (selectedCount === 0) return null

  return (
    <div className="mb-4 bg-gray-900 text-white rounded-xl px-5 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
      <span className="text-sm font-medium">
        {selectedCount} ítem{selectedCount > 1 ? 's' : ''} seleccionado{selectedCount > 1 ? 's' : ''}
      </span>
      <div className="flex items-center gap-2">
        <button onClick={onAssignSupplier}
          className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors">
          Asignar proveedor
        </button>
        <button onClick={onChangeStatus}
          className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors">
          Cambiar estado
        </button>
        <button onClick={onAssignUser}
          className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors">
          Asignar a
        </button>
        {purchasedSelectedCount > 0 && (
          <button onClick={onCreateShipment}
            className="px-3 py-1.5 bg-purple-500/80 hover:bg-purple-500 rounded-lg text-sm transition-colors">
            🚚 Crear envío ({purchasedSelectedCount})
          </button>
        )}
        <button onClick={onClear}
          className="px-3 py-1.5 hover:bg-white/20 rounded-lg text-sm transition-colors ml-2">
          Cancelar
        </button>
      </div>
    </div>
  )
}
