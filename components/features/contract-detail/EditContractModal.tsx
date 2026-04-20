'use client'

import type { FormEvent } from 'react'
import Modal from './Modal'
import type { Contract, ContractingEntity } from './types'

export type EditContractForm = {
  name: string
  entity_id: string
  type: Contract['type']
}

type Props = {
  form: EditContractForm
  entities: ContractingEntity[]
  loading: boolean
  error: string | null
  onFormChange: (form: EditContractForm) => void
  onCancel: () => void
  onSubmit: (e: FormEvent) => void
}

export default function EditContractModal({ form, entities, loading, error, onFormChange, onCancel, onSubmit }: Props) {
  return (
    <Modal title="Editar contrato" onClose={onCancel}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del contrato</label>
          <input type="text" value={form.name} onChange={e => onFormChange({ ...form, name: e.target.value })} required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Entidad contratante</label>
          <select value={form.entity_id} onChange={e => onFormChange({ ...form, entity_id: e.target.value })} required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
            <option value="">Seleccioná una entidad...</option>
            {entities.map(ent => (
              <option key={ent.id} value={ent.id}>{ent.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
          <select value={form.type} onChange={e => onFormChange({ ...form, type: e.target.value as Contract['type'] })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
            <option value="purchase">Compras</option>
            <option value="logistics">Logística</option>
            <option value="service">Servicios</option>
            <option value="mixed">Mixto</option>
          </select>
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onCancel}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancelar</button>
          <button type="submit" disabled={loading}
            className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
            {loading ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
