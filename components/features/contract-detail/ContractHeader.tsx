'use client'

import DeleteButton from '@/components/ui/DeleteButton'
import { CONTRACT_TYPE_ICONS, CONTRACT_STATUS_COLOR, CONTRACT_STATUS_LABEL } from './constants'
import type { Contract } from './types'

type Props = {
  contract: Contract
  isJefe: boolean
  isActive: boolean
  loading: boolean
  onEdit: () => void
  onComplete: () => void
  onArchive: () => void
}

export default function ContractHeader({ contract, isJefe, isActive, loading, onEdit, onComplete, onArchive }: Props) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">{CONTRACT_TYPE_ICONS[contract.type]}</span>
          <h1 className="text-2xl font-bold text-gray-900">{contract.name}</h1>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${CONTRACT_STATUS_COLOR[contract.status]}`}>
            {CONTRACT_STATUS_LABEL[contract.status]}
          </span>
        </div>
        <p className="text-gray-500 text-sm">
          {contract.contracting_entities?.name ?? contract.entity} · {contract.organizations?.name ?? '—'}
        </p>
      </div>

      {isJefe && (
        <div className="flex items-center gap-2">
          <button onClick={onEdit}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            Editar
          </button>
          {isActive && (
            <button onClick={onComplete} disabled={loading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
              Completar contrato
            </button>
          )}
          {isActive && (
            <button onClick={onArchive} disabled={loading}
              className="px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors">
              Archivar
            </button>
          )}
          <DeleteButton
            apiPath={`/api/admin/contracts/${contract.id}`}
            entityLabel="este contrato"
            redirectTo="/dashboard"
          />
        </div>
      )}
    </div>
  )
}
