'use client'

import Modal from './Modal'
import { STATUS_LABELS, STATUS_COLORS } from './constants'

type Props = {
  validStatuses: string[]
  batchStatus: string
  loading: boolean
  onStatusSelect: (status: string) => void
  onCancel: () => void
  onConfirm: () => void
}

export default function BatchStatusModal({
  validStatuses, batchStatus, loading, onStatusSelect, onCancel, onConfirm,
}: Props) {
  return (
    <Modal title="Cambiar estado" onClose={onCancel}>
      <div className="space-y-2 mb-4">
        {validStatuses.map(s => (
          <button key={s} onClick={() => onStatusSelect(s)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${batchStatus === s ? 'bg-gray-900 text-white' : 'hover:bg-gray-50 text-gray-700'}`}>
            <span className={`inline-block w-2 h-2 rounded-full mr-2 ${(STATUS_COLORS[s] || '').split(' ')[0]?.replace('bg-', 'bg-') || 'bg-gray-300'}`} />
            {STATUS_LABELS[s] || s}
          </button>
        ))}
      </div>
      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Cancelar</button>
        <button onClick={onConfirm} disabled={!batchStatus || loading}
          className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50">
          {loading ? 'Guardando...' : 'Cambiar'}
        </button>
      </div>
    </Modal>
  )
}
