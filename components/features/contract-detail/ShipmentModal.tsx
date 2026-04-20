'use client'

import type { FormEvent } from 'react'
import Modal from './Modal'

export type ShipmentForm = {
  method: 'avion' | 'barco' | 'terrestre'
  origin_city: string
  dispatch_date: string
  estimated_arrival: string
  notes: string
}

type Props = {
  form: ShipmentForm
  itemsCount: number
  loading: boolean
  error: string | null
  onFormChange: (form: ShipmentForm) => void
  onCancel: () => void
  onSubmit: (e: FormEvent) => void
}

export default function ShipmentModal({ form, itemsCount, loading, error, onFormChange, onCancel, onSubmit }: Props) {
  return (
    <Modal title="Crear envío" onClose={onCancel}>
      <form onSubmit={onSubmit} className="space-y-4">
        <p className="text-sm text-gray-500">{itemsCount} ítem{itemsCount > 1 ? 's' : ''} de tipo compra pasarán a &quot;Enviado&quot;.</p>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Método de envío</label>
          <select value={form.method} onChange={e => onFormChange({ ...form, method: e.target.value as ShipmentForm['method'] })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
            <option value="avion">✈️ Avión</option>
            <option value="barco">🚢 Barco</option>
            <option value="terrestre">🚛 Terrestre</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad origen</label>
          <input type="text" value={form.origin_city} onChange={e => onFormChange({ ...form, origin_city: e.target.value })} required
            placeholder="Ej: Bogotá" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha despacho</label>
            <input type="date" value={form.dispatch_date} onChange={e => onFormChange({ ...form, dispatch_date: e.target.value })} required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Llegada estimada</label>
            <input type="date" value={form.estimated_arrival} onChange={e => onFormChange({ ...form, estimated_arrival: e.target.value })} required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
          <textarea value={form.notes} onChange={e => onFormChange({ ...form, notes: e.target.value })}
            rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none" />
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onCancel}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancelar</button>
          <button type="submit" disabled={loading}
            className="flex-1 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors">
            {loading ? 'Creando...' : 'Crear envío'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
