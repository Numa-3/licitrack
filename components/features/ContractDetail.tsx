'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// ── Types ──────────────────────────────────────────────────────
type Contract = {
  id: string
  name: string
  entity: string
  type: 'purchase' | 'logistics' | 'service' | 'mixed'
  status: 'draft' | 'active' | 'completed' | 'cancelled'
  created_at: string
  updated_at: string
  organizations: { name: string } | null
  created_by_profile: { name: string } | null
  assigned_to_profile: { name: string } | null
}

type Item = {
  id: string
  item_number: number | null
  short_name: string
  description: string
  type: string
  quantity: number
  unit: string | null
  sale_price: number | null
  supplier_cost: number | null
  status: string
  payment_status: string
  due_date: string | null
  contact_phone: string | null
  notes: string | null
  supplier: { id: string; name: string; whatsapp: string | null } | null
  assigned_to_profile: { id: string; name: string } | null
  category: { id: string; name: string } | null
}

type Supplier = { id: string; name: string; whatsapp: string | null; city: string | null }
type Profile = { id: string; name: string; role: string }
type Category = { id: string; name: string; type: string }

type Props = {
  contract: Contract
  items: Item[]
  userRole: string
  currentUserId: string
  suppliers: Supplier[]
  profiles: Profile[]
  categories: Category[]
}

// ── Constants ──────────────────────────────────────────────────
const TYPE_LABELS: Record<string, string> = {
  purchase: 'Compras', logistics: 'Logistica', service: 'Servicios', mixed: 'Mixto',
}
const TYPE_ICONS: Record<string, string> = {
  purchase: '🛒', logistics: '🚚', service: '🔧', mixed: '📦',
}

const STATUS_FLOWS: Record<string, string[]> = {
  purchase: ['pending', 'sourced', 'purchased', 'shipped', 'received'],
  logistics: ['pending', 'in_progress', 'done'],
  service: ['pending', 'in_progress', 'done'],
}
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente', sourced: 'Cotizado', purchased: 'Comprado',
  shipped: 'Enviado', received: 'Recibido', in_progress: 'En progreso', done: 'Listo',
}
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600', sourced: 'bg-yellow-50 text-yellow-700',
  purchased: 'bg-blue-50 text-blue-700', shipped: 'bg-purple-50 text-purple-700',
  received: 'bg-green-50 text-green-700', in_progress: 'bg-blue-50 text-blue-700',
  done: 'bg-green-50 text-green-700',
}
const PAYMENT_LABELS: Record<string, string> = {
  unpaid: 'Sin pagar', invoiced: 'Facturado', paid: 'Pagado',
}
const PAYMENT_COLORS: Record<string, string> = {
  unpaid: 'bg-red-50 text-red-600', invoiced: 'bg-amber-50 text-amber-700',
  paid: 'bg-green-50 text-green-700',
}
const CONTRACT_STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador', active: 'Activo', completed: 'Completado', cancelled: 'Cancelado',
}
const CONTRACT_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', active: 'bg-blue-50 text-blue-700',
  completed: 'bg-green-50 text-green-700', cancelled: 'bg-red-50 text-red-600',
}
const FINAL_STATUSES = new Set(['completed', 'done', 'received'])

function formatCurrency(n: number | null) {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n)
}

// ── Component ──────────────────────────────────────────────────
export default function ContractDetail({
  contract: initial, items: initialItems, userRole, currentUserId, suppliers, profiles, categories,
}: Props) {
  const router = useRouter()
  const supabase = createClient()

  // Contract state
  const [contract, setContract] = useState(initial)
  const [allItems, setAllItems] = useState<Item[]>(initialItems)

  // UI state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [detailItem, setDetailItem] = useState<Item | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showSupplierModal, setShowSupplierModal] = useState(false)
  const [editForm, setEditForm] = useState({ name: initial.name, entity: initial.entity, type: initial.type })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Supplier modal state
  const [supplierSearch, setSupplierSearch] = useState('')
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null)
  const [supplierCost, setSupplierCost] = useState('')

  const isJefe = userRole === 'jefe'
  const isActive = contract.status === 'active' || contract.status === 'draft'

  // ── Computed ────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const groups: Record<string, { supplier: { id: string; name: string } | null; items: Item[] }> = {}
    for (const item of allItems) {
      const key = item.supplier?.id ?? '__unassigned__'
      if (!groups[key]) groups[key] = { supplier: item.supplier, items: [] }
      groups[key].items.push(item)
    }
    // Put unassigned first
    const entries = Object.entries(groups)
    entries.sort((a, b) => {
      if (a[0] === '__unassigned__') return -1
      if (b[0] === '__unassigned__') return 1
      return (a[1].supplier?.name ?? '').localeCompare(b[1].supplier?.name ?? '')
    })
    return entries.map(([, v]) => v)
  }, [allItems])

  const margin = useMemo(() => {
    let income = 0, cost = 0
    for (const item of allItems) {
      if (item.sale_price) income += item.sale_price * item.quantity
      if (item.supplier_cost) cost += item.supplier_cost * item.quantity
    }
    const profit = income - cost
    const pct = income > 0 ? (profit / income) * 100 : 0
    return { income, cost, profit, pct }
  }, [allItems])

  // Recent suppliers used in this contract
  const recentSupplierIds = useMemo(() => {
    const ids: string[] = []
    for (const item of allItems) {
      if (item.supplier && !ids.includes(item.supplier.id)) {
        ids.push(item.supplier.id)
        if (ids.length >= 5) break
      }
    }
    return ids
  }, [allItems])

  // ── Helpers ─────────────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selectedIds.size === allItems.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(allItems.map((i) => i.id)))
    }
  }

  async function logActivity(action: string, entityType: string, entityId: string, details: Record<string, unknown>) {
    await supabase.from('activity_log').insert({
      user_id: currentUserId, action, entity_type: entityType, entity_id: entityId, details,
    })
  }

  function updateItemLocal(id: string, changes: Partial<Item>) {
    setAllItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...changes } : i)))
    if (detailItem?.id === id) setDetailItem((prev) => prev ? { ...prev, ...changes } : prev)
  }

  // ── Item actions ────────────────────────────────────────────
  async function updateItemStatus(itemId: string, newStatus: string) {
    const item = allItems.find((i) => i.id === itemId)
    if (!item) return
    const oldStatus = item.status
    const { error } = await supabase.from('items').update({ status: newStatus }).eq('id', itemId)
    if (error) { setError(error.message); return }
    updateItemLocal(itemId, { status: newStatus })
    await logActivity('item_status_changed', 'item', itemId, {
      from: oldStatus, to: newStatus, item_name: item.short_name,
    })
  }

  async function updateItemPayment(itemId: string, newStatus: string) {
    const item = allItems.find((i) => i.id === itemId)
    if (!item) return
    const oldStatus = item.payment_status
    const { error } = await supabase.from('items').update({ payment_status: newStatus }).eq('id', itemId)
    if (error) { setError(error.message); return }
    updateItemLocal(itemId, { payment_status: newStatus })
    await logActivity('payment_status_changed', 'item', itemId, {
      from: oldStatus, to: newStatus, item_name: item.short_name,
    })
  }

  async function assignSupplierToItems(itemIds: string[], supplierId: string, cost: number | null) {
    const supplier = suppliers.find((s) => s.id === supplierId)
    const { error } = await supabase.from('items')
      .update({ supplier_id: supplierId, ...(cost !== null ? { supplier_cost: cost } : {}) })
      .in('id', itemIds)
    if (error) { setError(error.message); return }

    setAllItems((prev) => prev.map((i) =>
      itemIds.includes(i.id) ? {
        ...i,
        supplier: supplier ? { id: supplier.id, name: supplier.name, whatsapp: supplier.whatsapp } : i.supplier,
        supplier_cost: cost ?? i.supplier_cost,
      } : i
    ))
    for (const id of itemIds) {
      const item = allItems.find((i) => i.id === id)
      await logActivity('supplier_assigned', 'item', id, {
        supplier_name: supplier?.name, item_name: item?.short_name,
      })
    }
    setSelectedIds(new Set())
    setShowSupplierModal(false)
  }

  async function batchChangeStatus(newStatus: string) {
    const ids = Array.from(selectedIds)
    const { error } = await supabase.from('items').update({ status: newStatus }).in('id', ids)
    if (error) { setError(error.message); return }
    for (const id of ids) {
      const item = allItems.find((i) => i.id === id)
      if (item) {
        updateItemLocal(id, { status: newStatus })
        await logActivity('item_status_changed', 'item', id, {
          from: item.status, to: newStatus, item_name: item.short_name,
        })
      }
    }
    setSelectedIds(new Set())
  }

  async function batchAssignTo(profileId: string) {
    const ids = Array.from(selectedIds)
    const profile = profiles.find((p) => p.id === profileId)
    const { error } = await supabase.from('items').update({ assigned_to: profileId }).in('id', ids)
    if (error) { setError(error.message); return }
    setAllItems((prev) => prev.map((i) =>
      ids.includes(i.id) ? {
        ...i,
        assigned_to_profile: profile ? { id: profile.id, name: profile.name } : i.assigned_to_profile,
      } : i
    ))
    setSelectedIds(new Set())
  }

  // ── Detail panel actions ────────────────────────────────────
  async function saveDetailField(field: string, value: unknown) {
    if (!detailItem) return
    const { error } = await supabase.from('items').update({ [field]: value }).eq('id', detailItem.id)
    if (error) { setError(error.message); return }
    updateItemLocal(detailItem.id, { [field]: value } as Partial<Item>)
  }

  function getWhatsAppUrl(item: Item) {
    const phone = item.contact_phone || item.supplier?.whatsapp
    if (!phone) return null
    const messages: Record<string, string> = {
      purchase: `Hola, me comunico por el item "${item.short_name}" (${item.quantity} ${item.unit ?? 'und'}). Necesito cotizacion y disponibilidad.`,
      logistics: `Hola, me comunico por la coordinacion de "${item.short_name}". Necesito confirmar detalles.`,
      service: `Hola, me comunico por el servicio "${item.short_name}". Necesito confirmar disponibilidad y precio.`,
    }
    const msg = messages[item.type] ?? messages.purchase
    return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`
  }

  // ── Contract actions ────────────────────────────────────────
  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { data, error } = await supabase.from('contracts').update({
      name: editForm.name, entity: editForm.entity, type: editForm.type,
    }).eq('id', contract.id).select(`
      id, name, entity, type, status, created_at, updated_at,
      organizations ( name ),
      created_by_profile:profiles!contracts_created_by_fkey ( name ),
      assigned_to_profile:profiles!contracts_assigned_to_fkey ( name )
    `).single()
    if (error) { setError(error.message) } else {
      setContract(data as unknown as Contract)
      setShowEditModal(false)
    }
    setLoading(false)
  }

  async function handleArchive() {
    if (!confirm('Archivar este contrato? Quedara inactivo pero no se eliminara.')) return
    setLoading(true)
    const { error } = await supabase.from('contracts').update({ deleted_at: new Date().toISOString() }).eq('id', contract.id)
    if (error) { setError(error.message) } else { router.push('/dashboard') }
    setLoading(false)
  }

  async function handleComplete() {
    const pending = allItems.filter((i) => !FINAL_STATUSES.has(i.status))
    if (pending.length > 0) {
      setError(`Hay ${pending.length} item(s) sin completar.`)
      return
    }
    if (!confirm('Marcar este contrato como completado?')) return
    setLoading(true)
    const { data, error } = await supabase.from('contracts').update({ status: 'completed' }).eq('id', contract.id).select(`
      id, name, entity, type, status, created_at, updated_at,
      organizations ( name ),
      created_by_profile:profiles!contracts_created_by_fkey ( name ),
      assigned_to_profile:profiles!contracts_assigned_to_fkey ( name )
    `).single()
    if (error) { setError(error.message) } else { setContract(data as unknown as Contract) }
    setLoading(false)
  }

  // Status flow for the contract type
  const statusFlow = STATUS_FLOWS[contract.type] ?? STATUS_FLOWS.purchase

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">{TYPE_ICONS[contract.type]}</span>
            <h1 className="text-2xl font-bold text-gray-900">{contract.name}</h1>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${CONTRACT_STATUS_COLORS[contract.status]}`}>
              {CONTRACT_STATUS_LABELS[contract.status]}
            </span>
          </div>
          <p className="text-gray-500 text-sm">
            {contract.entity} · {contract.organizations?.name ?? '—'}
          </p>
        </div>
        {isJefe && (
          <div className="flex items-center gap-2">
            <button onClick={() => { setEditForm({ name: contract.name, entity: contract.entity, type: contract.type }); setError(null); setShowEditModal(true) }}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Editar
            </button>
            {isActive && (
              <>
                <button onClick={handleComplete} disabled={loading}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
                  Completar contrato
                </button>
                <button onClick={handleArchive} disabled={loading}
                  className="px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors">
                  Archivar
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Info cards + Margin summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Contrato</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-gray-500">Tipo</dt><dd className="text-gray-900 font-medium">{TYPE_ICONS[contract.type]} {TYPE_LABELS[contract.type]}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Entidad</dt><dd className="text-gray-900">{contract.entity}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Empresa</dt><dd className="text-gray-900">{contract.organizations?.name ?? '—'}</dd></div>
          </dl>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Equipo</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-gray-500">Creado por</dt><dd className="text-gray-900">{contract.created_by_profile?.name ?? '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Responsable</dt><dd className="text-gray-900">{contract.assigned_to_profile?.name ?? '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Creado</dt><dd className="text-gray-500">{new Date(contract.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}</dd></div>
          </dl>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Margen</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-gray-500">Ingreso</dt><dd className="text-gray-900 font-medium">{formatCurrency(margin.income)}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Costo</dt><dd className="text-gray-900">{formatCurrency(margin.cost)}</dd></div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Margen</dt>
              <dd className={`font-bold ${margin.pct < 0 ? 'text-red-600' : margin.pct < 15 ? 'text-amber-600' : 'text-green-600'}`}>
                {formatCurrency(margin.profit)} ({margin.pct.toFixed(1)}%)
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Batch toolbar */}
      {selectedIds.size > 0 && (
        <div className="mb-4 bg-gray-900 text-white px-4 py-3 rounded-lg flex items-center gap-4 text-sm">
          <span className="font-medium">{selectedIds.size} seleccionado(s)</span>
          <div className="h-4 w-px bg-gray-600" />
          <button onClick={() => setShowSupplierModal(true)}
            className="hover:text-blue-300 transition-colors">Asignar proveedor</button>
          <div className="h-4 w-px bg-gray-600" />
          <select onChange={(e) => { if (e.target.value) batchChangeStatus(e.target.value); e.target.value = '' }}
            className="bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 text-xs">
            <option value="">Cambiar estado...</option>
            {statusFlow.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
          <select onChange={(e) => { if (e.target.value) batchAssignTo(e.target.value); e.target.value = '' }}
            className="bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 text-xs">
            <option value="">Asignar a...</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="flex-1" />
          <button onClick={() => setSelectedIds(new Set())} className="text-gray-400 hover:text-white">Cancelar</button>
        </div>
      )}

      {/* Items grouped by supplier */}
      <div className="flex gap-6">
        <div className={`${detailItem ? 'w-2/3' : 'w-full'} transition-all`}>
          <div className="bg-white border border-gray-200 rounded-xl">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">
                Items <span className="ml-1 text-sm font-normal text-gray-400">({allItems.length})</span>
              </h2>
              <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                <input type="checkbox" checked={selectedIds.size === allItems.length && allItems.length > 0}
                  onChange={toggleAll} className="rounded border-gray-300" />
                Seleccionar todo
              </label>
            </div>

            {allItems.length === 0 ? (
              <div className="px-5 py-10 text-center text-gray-400">
                <p>No hay items en este contrato.</p>
              </div>
            ) : (
              <div>
                {grouped.map((group, gi) => (
                  <div key={gi}>
                    {/* Group header */}
                    <div className="px-5 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {group.supplier?.name ?? 'Sin asignar'}
                      </span>
                      <span className="text-xs text-gray-400">({group.items.length})</span>
                    </div>
                    {/* Items */}
                    {group.items.map((item) => {
                      const itemMargin = item.sale_price && item.supplier_cost
                        ? ((item.sale_price - item.supplier_cost) / item.sale_price) * 100 : null
                      return (
                        <div key={item.id}
                          className={`px-5 py-3 border-b border-gray-100 flex items-center gap-3 hover:bg-gray-50 transition-colors cursor-pointer ${detailItem?.id === item.id ? 'bg-blue-50' : ''}`}
                          onClick={() => setDetailItem(item)}>
                          <input type="checkbox" checked={selectedIds.has(item.id)}
                            onChange={(e) => { e.stopPropagation(); toggleSelect(item.id) }}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded border-gray-300" />
                          <span className="text-xs text-gray-400 w-6 text-right">{item.item_number ?? '—'}</span>
                          <span className="font-medium text-gray-900 text-sm flex-1 truncate">{item.short_name}</span>
                          <span className="text-xs text-gray-500 w-24 text-right">
                            {item.quantity} {item.unit ?? 'und'}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[item.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {STATUS_LABELS[item.status] ?? item.status}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${PAYMENT_COLORS[item.payment_status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {PAYMENT_LABELS[item.payment_status] ?? item.payment_status}
                          </span>
                          {itemMargin !== null && (
                            <span className={`text-xs font-medium w-14 text-right ${itemMargin < 0 ? 'text-red-600' : itemMargin < 15 ? 'text-amber-600' : 'text-green-600'}`}>
                              {itemMargin.toFixed(0)}%
                            </span>
                          )}
                          <span className="text-xs text-gray-400 w-20 truncate text-right">
                            {item.assigned_to_profile?.name ?? ''}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Detail side panel */}
        {detailItem && (
          <div className="w-1/3 bg-white border border-gray-200 rounded-xl p-5 sticky top-4 self-start max-h-[calc(100vh-6rem)] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 text-lg">{detailItem.short_name}</h3>
              <button onClick={() => setDetailItem(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>

            {/* Description */}
            <p className="text-sm text-gray-600 mb-4 whitespace-pre-wrap">{detailItem.description}</p>

            {/* Quick info */}
            <div className="space-y-3 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Cantidad</span>
                <span className="text-gray-900">{detailItem.quantity} {detailItem.unit ?? 'und'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Precio venta</span>
                <span className="text-gray-900">{formatCurrency(detailItem.sale_price)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Costo proveedor</span>
                <span className="text-gray-900">{formatCurrency(detailItem.supplier_cost)}</span>
              </div>
              {detailItem.sale_price && detailItem.supplier_cost && (() => {
                const m = ((detailItem.sale_price - detailItem.supplier_cost) / detailItem.sale_price) * 100
                return (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Margen</span>
                    <span className={`font-bold ${m < 0 ? 'text-red-600' : m < 15 ? 'text-amber-600' : 'text-green-600'}`}>
                      {m.toFixed(1)}%
                    </span>
                  </div>
                )
              })()}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Categoria</span>
                <span className="text-gray-900">{detailItem.category?.name ?? '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Proveedor</span>
                <span className="text-gray-900">{detailItem.supplier?.name ?? 'Sin asignar'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Responsable</span>
                <span className="text-gray-900">{detailItem.assigned_to_profile?.name ?? '—'}</span>
              </div>
            </div>

            {/* Logistics status */}
            <div className="mb-4">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 block">Estado logistico</label>
              <div className="flex flex-wrap gap-1">
                {(STATUS_FLOWS[detailItem.type] ?? STATUS_FLOWS.purchase).map((s) => (
                  <button key={s} onClick={() => updateItemStatus(detailItem.id, s)}
                    className={`text-xs px-2.5 py-1 rounded-full transition-colors ${detailItem.status === s
                      ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment status */}
            <div className="mb-4">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 block">Estado de pago</label>
              <div className="flex gap-1">
                {['unpaid', 'invoiced', 'paid'].map((s) => (
                  <button key={s} onClick={() => updateItemPayment(detailItem.id, s)}
                    className={`text-xs px-2.5 py-1 rounded-full transition-colors ${detailItem.payment_status === s
                      ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {PAYMENT_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            {/* Editable fields */}
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Costo proveedor</label>
                <input type="number" defaultValue={detailItem.supplier_cost ?? ''}
                  onBlur={(e) => saveDetailField('supplier_cost', e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-gray-900 bg-white" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Categoria</label>
                <select defaultValue={detailItem.category?.id ?? ''}
                  onChange={(e) => {
                    saveDetailField('category_id', e.target.value || null)
                    const cat = categories.find((c) => c.id === e.target.value)
                    updateItemLocal(detailItem.id, { category: cat ? { id: cat.id, name: cat.name } : null })
                  }}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-gray-900 bg-white">
                  <option value="">— Sin categoria —</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Responsable</label>
                <select defaultValue={detailItem.assigned_to_profile?.id ?? ''}
                  onChange={(e) => {
                    saveDetailField('assigned_to', e.target.value || null)
                    const p = profiles.find((pr) => pr.id === e.target.value)
                    updateItemLocal(detailItem.id, {
                      assigned_to_profile: p ? { id: p.id, name: p.name } : null,
                    })
                  }}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-gray-900 bg-white">
                  <option value="">— Sin asignar —</option>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Notas</label>
                <textarea defaultValue={detailItem.notes ?? ''} rows={2}
                  onBlur={(e) => saveDetailField('notes', e.target.value || null)}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-gray-900 bg-white resize-none" />
              </div>
            </div>

            {/* WhatsApp button */}
            {(() => {
              const url = getWhatsAppUrl(detailItem)
              return url ? (
                <a href={url} target="_blank" rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors mb-4">
                  WhatsApp
                </a>
              ) : null
            })()}
          </div>
        )}
      </div>

      {/* Supplier modal */}
      {showSupplierModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Asignar proveedor</h2>
              <p className="text-sm text-gray-500 mt-1">{selectedIds.size} item(s) seleccionado(s)</p>
            </div>
            <div className="p-6 space-y-4">
              {/* Recent suppliers */}
              {recentSupplierIds.length > 0 && (
                <div>
                  <label className="text-xs text-gray-500 mb-2 block">Recientes en este contrato</label>
                  <div className="flex flex-wrap gap-2">
                    {recentSupplierIds.map((id) => {
                      const s = suppliers.find((x) => x.id === id)
                      if (!s) return null
                      return (
                        <button key={id} onClick={() => setSelectedSupplierId(id)}
                          className={`text-xs px-3 py-1.5 rounded-full transition-colors ${selectedSupplierId === id
                            ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                          {s.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Buscar proveedor</label>
                <input type="text" value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)}
                  placeholder="Nombre del proveedor..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
                {supplierSearch && (
                  <div className="mt-1 border border-gray-200 rounded-lg max-h-40 overflow-y-auto">
                    {suppliers
                      .filter((s) => s.name.toLowerCase().includes(supplierSearch.toLowerCase()))
                      .map((s) => (
                        <button key={s.id} onClick={() => { setSelectedSupplierId(s.id); setSupplierSearch('') }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${selectedSupplierId === s.id ? 'bg-gray-100 font-medium' : ''}`}>
                          {s.name} {s.city ? `· ${s.city}` : ''}
                        </button>
                      ))}
                  </div>
                )}
              </div>

              {selectedSupplierId && (
                <p className="text-sm text-gray-700">
                  Seleccionado: <strong>{suppliers.find((s) => s.id === selectedSupplierId)?.name}</strong>
                </p>
              )}

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Costo del proveedor (opcional)</label>
                <input type="number" value={supplierCost} onChange={(e) => setSupplierCost(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowSupplierModal(false); setSelectedSupplierId(null); setSupplierSearch(''); setSupplierCost('') }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button type="button" disabled={!selectedSupplierId}
                  onClick={() => assignSupplierToItems(
                    Array.from(selectedIds), selectedSupplierId!,
                    supplierCost ? Number(supplierCost) : null
                  )}
                  className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
                  Asignar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit contract modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Editar contrato</h2>
            </div>
            <form onSubmit={handleEdit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Entidad contratante</label>
                <input type="text" value={editForm.entity} onChange={(e) => setEditForm({ ...editForm, entity: e.target.value })} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value as typeof editForm.type })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
                  <option value="purchase">Compras</option>
                  <option value="logistics">Logistica</option>
                  <option value="service">Servicios</option>
                  <option value="mixed">Mixto</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowEditModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
                  {loading ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
