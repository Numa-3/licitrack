'use client'

import { formatDate } from '@/lib/utils/format'
import { CONTRACT_TYPE_ICONS, CONTRACT_TYPE_LABELS } from './constants'
import type { Contract } from './types'

type Props = {
  contract: Contract
}

export default function InfoCards({ contract }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Información del contrato</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">Tipo</dt>
            <dd className="text-gray-900 font-medium">{CONTRACT_TYPE_ICONS[contract.type]} {CONTRACT_TYPE_LABELS[contract.type]}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Entidad</dt>
            <dd className="text-gray-900">{contract.entity}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Empresa</dt>
            <dd className="text-gray-900">{contract.organizations?.name ?? '—'}</dd>
          </div>
        </dl>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Equipo</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">Creado por</dt>
            <dd className="text-gray-900">{contract.created_by_profile?.name ?? '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Responsable</dt>
            <dd className="text-gray-900">{contract.assigned_to_profile?.name ?? '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Creado</dt>
            <dd className="text-gray-500">{formatDate(contract.created_at)}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
