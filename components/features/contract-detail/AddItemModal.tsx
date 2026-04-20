'use client'

import type { FormEvent } from 'react'
import Modal from './Modal'
import type { Category } from './types'

export type AddItemForm = {
  short_name: string
  description: string
  type: 'purchase' | 'logistics' | 'service'
  category_id: string
  quantity: string
  unit: string
  sale_price: string
}

type Props = {
  form: AddItemForm
  categories: Category[]
  loading: boolean
  error: string | null
  onFormChange: (updater: (prev: AddItemForm) => AddItemForm) => void
  onCancel: () => void
  onSubmit: (e: FormEvent) => void
}

export default function AddItemModal({ form, categories, loading, error, onFormChange, onCancel, onSubmit }: Props) {
  return (
    <Modal title="Agregar ítem" onClose={onCancel}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre corto *</label>
          <input type="text" value={form.short_name} onChange={e => onFormChange(f => ({ ...f, short_name: e.target.value }))} required
            placeholder="Ej: Resma carta" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
          <textarea value={form.description} onChange={e => onFormChange(f => ({ ...f, description: e.target.value }))}
            rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <select value={form.type} onChange={e => onFormChange(f => ({ ...f, type: e.target.value as AddItemForm['type'] }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
              <option value="purchase">Compra</option>
              <option value="logistics">Logística</option>
              <option value="service">Servicio</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
            <select value={form.category_id} onChange={e => onFormChange(f => ({ ...f, category_id: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
              <option value="">Sin categoría</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad *</label>
            <input type="number" min="1" value={form.quantity} onChange={e => onFormChange(f => ({ ...f, quantity: e.target.value }))} required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Unidad</label>
            <input type="text" value={form.unit} onChange={e => onFormChange(f => ({ ...f, unit: e.target.value }))}
              placeholder="und" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Precio venta</label>
            <input type="number" value={form.sale_price} onChange={e => onFormChange(f => ({ ...f, sale_price: e.target.value }))}
              placeholder="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onCancel}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancelar</button>
          <button type="submit" disabled={!form.short_name.trim() || loading}
            className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
            {loading ? 'Guardando...' : 'Agregar ítem'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
