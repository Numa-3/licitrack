'use client'

import Modal from './Modal'
import type { AvailableSupplier } from './types'

type Props = {
  recentSuppliers: { id: string; name: string }[]
  filteredSuppliers: AvailableSupplier[]
  supplierSearch: string
  batchSupplier: string
  batchSupplierCost: string
  loading: boolean
  onSearchChange: (value: string) => void
  onSupplierSelect: (id: string) => void
  onCostChange: (value: string) => void
  onCancel: () => void
  onConfirm: () => void
}

export default function BatchSupplierModal({
  recentSuppliers, filteredSuppliers, supplierSearch, batchSupplier, batchSupplierCost, loading,
  onSearchChange, onSupplierSelect, onCostChange, onCancel, onConfirm,
}: Props) {
  return (
    <Modal title="Asignar proveedor" onClose={onCancel}>
      {recentSuppliers.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Recientes en este contrato</p>
          <div className="flex flex-wrap gap-2">
            {recentSuppliers.map(s => (
              <button key={s.id} onClick={() => onSupplierSelect(s.id)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${batchSupplier === s.id ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mb-3">
        <input type="text" placeholder="Buscar proveedor..." value={supplierSearch}
          onChange={e => onSearchChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
      </div>
      <div className="max-h-40 overflow-y-auto mb-4 space-y-1">
        {filteredSuppliers.map(s => (
          <button key={s.id} onClick={() => onSupplierSelect(s.id)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${batchSupplier === s.id ? 'bg-gray-900 text-white' : 'hover:bg-gray-50 text-gray-700'}`}>
            {s.name} {s.city && <span className="text-gray-400">· {s.city}</span>} {s.trusted && <span className="text-green-500 ml-1">✓</span>}
          </button>
        ))}
        {filteredSuppliers.length === 0 && <p className="text-sm text-gray-400 text-center py-2">Sin resultados</p>}
      </div>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Costo proveedor (opcional)</label>
        <input type="number" value={batchSupplierCost} onChange={e => onCostChange(e.target.value)}
          placeholder="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
      </div>
      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Cancelar</button>
        <button onClick={onConfirm} disabled={!batchSupplier || loading}
          className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50">
          {loading ? 'Guardando...' : 'Asignar'}
        </button>
      </div>
    </Modal>
  )
}
