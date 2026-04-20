'use client'

import { useState } from 'react'
import { formatCurrency, formatDateTime } from '@/lib/utils/format'
import { STATUS_FLOWS, STATUS_LABELS, PAYMENT_LABELS, ACTION_LABELS } from './constants'
import { marginPct, marginColor, buildWhatsAppUrl } from './utils'
import type {
  Item, Contract, AvailableSupplier, Profile, Category, ActivityEntry,
} from './types'

type Props = {
  item: Item
  contract: Contract
  suppliers: AvailableSupplier[]
  profiles: Profile[]
  categories: Category[]
  recentSuppliers: { id: string; name: string }[]
  loading: boolean
  onClose: () => void
  onUpdateField: (itemId: string, field: string, value: unknown, label?: string) => void
  onSaveDetails: (itemId: string, data: Record<string, unknown>) => void
  activityLog: ActivityEntry[]
}

export default function SidePanel({
  item, contract, suppliers, profiles, categories, recentSuppliers, loading,
  onClose, onUpdateField, onSaveDetails, activityLog,
}: Props) {
  const [editShortName, setEditShortName] = useState(item.short_name)
  const [editQuantity, setEditQuantity] = useState(item.quantity.toString())
  const [editNotes, setEditNotes] = useState(item.notes)
  const [editDescription, setEditDescription] = useState(item.description)
  const [editPhone, setEditPhone] = useState(item.contact_phone || '')
  const [editSupplierCost, setEditSupplierCost] = useState(item.supplier_cost?.toString() || '')
  const [editSalePrice, setEditSalePrice] = useState(item.sale_price?.toString() || '')
  const [dirty, setDirty] = useState(false)

  // Reset when item changes
  const [lastItemId, setLastItemId] = useState(item.id)
  if (item.id !== lastItemId) {
    setLastItemId(item.id)
    setEditShortName(item.short_name)
    setEditQuantity(item.quantity.toString())
    setEditNotes(item.notes)
    setEditDescription(item.description)
    setEditPhone(item.contact_phone || '')
    setEditSupplierCost(item.supplier_cost?.toString() || '')
    setEditSalePrice(item.sale_price?.toString() || '')
    setDirty(false)
  }

  function markDirty() { setDirty(true) }

  function handleSave() {
    const data: Record<string, unknown> = {}
    if (editShortName !== item.short_name) data.short_name = editShortName
    if (editQuantity !== item.quantity.toString()) data.quantity = parseInt(editQuantity) || 1
    if (editDescription !== item.description) data.description = editDescription
    if (editNotes !== item.notes) data.notes = editNotes
    if (editPhone !== (item.contact_phone || '')) data.contact_phone = editPhone || null
    if (editSupplierCost !== (item.supplier_cost?.toString() || '')) data.supplier_cost = editSupplierCost ? parseFloat(editSupplierCost) : null
    if (editSalePrice !== (item.sale_price?.toString() || '')) data.sale_price = editSalePrice ? parseFloat(editSalePrice) : null
    if (Object.keys(data).length > 0) {
      onSaveDetails(item.id, data)
      setDirty(false)
    }
  }

  const statusFlow = STATUS_FLOWS[item.type] || STATUS_FLOWS.service
  const paymentFlow = ['unpaid', 'invoiced', 'paid']

  const whatsappPhone = item.contact_phone || item.suppliers?.whatsapp
  const waUrl = buildWhatsAppUrl(whatsappPhone || null, item, contract)

  const m = marginPct(
    editSalePrice ? parseFloat(editSalePrice) : item.sale_price,
    editSupplierCost ? parseFloat(editSupplierCost) : item.supplier_cost
  )

  return (
    <div className="fixed top-0 right-0 w-[420px] h-full bg-white border-l border-gray-200 shadow-lg z-40 overflow-y-auto">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
        <div>
          <h3 className="font-semibold text-gray-900">{item.short_name}</h3>
          <p className="text-xs text-gray-400">#{item.item_number ?? '—'} · {item.quantity} {item.unit || 'und'}</p>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* Editable name & quantity */}
        <div>
          <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Nombre corto</label>
          <input type="text" value={editShortName} onChange={e => { setEditShortName(e.target.value); markDirty() }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Cantidad</label>
            <input type="number" min="1" value={editQuantity} onChange={e => { setEditQuantity(e.target.value); markDirty() }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Unidad</label>
            <p className="px-3 py-2 text-sm text-gray-500">{item.unit || 'und'}</p>
          </div>
        </div>

        {/* Status buttons */}
        <div>
          <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Estado logístico</label>
          <div className="flex flex-wrap gap-1.5">
            {statusFlow.map(s => (
              <button key={s} onClick={() => onUpdateField(item.id, 'status', s, STATUS_LABELS[s])}
                disabled={loading}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${item.status === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Payment status buttons */}
        <div>
          <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Estado de pago</label>
          <div className="flex gap-1.5">
            {paymentFlow.map(s => (
              <button key={s} onClick={() => onUpdateField(item.id, 'payment_status', s, PAYMENT_LABELS[s])}
                disabled={loading}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${item.payment_status === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {PAYMENT_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Supplier */}
        <div>
          <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Proveedor</label>
          {recentSuppliers.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {recentSuppliers.map(s => (
                <button key={s.id} onClick={() => onUpdateField(item.id, 'supplier_id', s.id, s.name)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${item.supplier_id === s.id ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                  {s.name}
                </button>
              ))}
            </div>
          )}
          <select value={item.supplier_id || ''} onChange={e => {
            const sup = suppliers.find(s => s.id === e.target.value)
            onUpdateField(item.id, 'supplier_id', e.target.value || null, sup?.name)
          }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
            <option value="">Sin proveedor</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} {s.city && `(${s.city})`}</option>)}
          </select>
        </div>

        {/* Assigned to */}
        <div>
          <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Responsable</label>
          <select value={item.assigned_to || ''} onChange={e => {
            const prof = profiles.find(p => p.id === e.target.value)
            onUpdateField(item.id, 'assigned_to', e.target.value || null, prof?.name)
          }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
            <option value="">Sin asignar</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* Category */}
        <div>
          <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Categoría</label>
          <select value={item.category_id || ''} onChange={e => {
            const cat = categories.find(c => c.id === e.target.value)
            onUpdateField(item.id, 'category_id', e.target.value || null, cat?.name)
          }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
            <option value="">Sin categoría</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* Prices / margin */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Precio venta</label>
            <input type="number" value={editSalePrice} onChange={e => { setEditSalePrice(e.target.value); markDirty() }}
              placeholder="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Costo proveedor</label>
            <input type="number" value={editSupplierCost} onChange={e => { setEditSupplierCost(e.target.value); markDirty() }}
              placeholder="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
        </div>
        {m != null && (
          <div className={`text-sm ${marginColor(m)}`}>
            Margen: {m.toFixed(1)}% ({formatCurrency((parseFloat(editSalePrice) || 0) - (parseFloat(editSupplierCost) || 0))})
          </div>
        )}

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Descripción</label>
          <textarea value={editDescription} onChange={e => { setEditDescription(e.target.value); markDirty() }}
            rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none" />
        </div>

        {/* Phone */}
        <div>
          <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Teléfono contacto</label>
          <input type="text" value={editPhone} onChange={e => { setEditPhone(e.target.value); markDirty() }}
            placeholder="573001234567" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Notas</label>
          <textarea value={editNotes} onChange={e => { setEditNotes(e.target.value); markDirty() }}
            rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none" />
        </div>

        {/* Save button */}
        {dirty && (
          <button onClick={handleSave} disabled={loading}
            className="w-full bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
            {loading ? 'Guardando...' : 'Guardar cambios'}
          </button>
        )}

        {/* WhatsApp */}
        {waUrl && (
          <a href={waUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            Contactar por WhatsApp
          </a>
        )}

        {/* Activity for this item */}
        {activityLog.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Historial reciente</label>
            <div className="space-y-2">
              {activityLog.map(entry => (
                <div key={entry.id} className="text-xs text-gray-500 flex justify-between">
                  <span>{ACTION_LABELS[entry.action] || entry.action}</span>
                  <span>{formatDateTime(entry.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
