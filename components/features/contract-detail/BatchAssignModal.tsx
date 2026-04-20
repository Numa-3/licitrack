'use client'

import Modal from './Modal'
import type { Profile } from './types'

type Props = {
  profiles: Profile[]
  batchAssign: string
  loading: boolean
  onAssignSelect: (id: string) => void
  onCancel: () => void
  onConfirm: () => void
}

export default function BatchAssignModal({
  profiles, batchAssign, loading, onAssignSelect, onCancel, onConfirm,
}: Props) {
  return (
    <Modal title="Asignar responsable" onClose={onCancel}>
      <div className="space-y-2 mb-4">
        {profiles.map(p => (
          <button key={p.id} onClick={() => onAssignSelect(p.id)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${batchAssign === p.id ? 'bg-gray-900 text-white' : 'hover:bg-gray-50 text-gray-700'}`}>
            {p.name} <span className="text-gray-400">· {p.role}</span>
          </button>
        ))}
      </div>
      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Cancelar</button>
        <button onClick={onConfirm} disabled={!batchAssign || loading}
          className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50">
          {loading ? 'Guardando...' : 'Asignar'}
        </button>
      </div>
    </Modal>
  )
}
