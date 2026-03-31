'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import DeleteButton from '@/components/ui/DeleteButton'
import { formatCurrency } from '@/lib/utils/format'

// ── Types ──────────────────────────────────────────────────────
type Supplier = { id: string; name: string; whatsapp: string | null }
type Profile = { id: string; name: string; role: string }
type Category = { id: string; name: string; type: string }

type ItemSupplier = { id: string; name: string; whatsapp: string | null } | null
type ItemProfile = { id: string; name: string } | null

type Item = {
  id: string
  item_number: number | null
  short_name: string
  description: string
  type: 'purchase' | 'logistics' | 'service'
  quantity: number
  unit: string | null
  sale_price: number | null
  supplier_cost: number | null
  status: string
  payment_status: 'unpaid' | 'invoiced' | 'paid'
  due_date: string | null
  contact_phone: string | null
  notes: string
  category_id: string | null
  supplier_id: string | null
  assigned_to: string | null
  created_by: string
  suppliers: ItemSupplier
  profiles: ItemProfile
}

type Contract = {
  id: string
  name: string
  entity: string
  entity_id: string | null
  type: 'supply' | 'construction' | 'sale' | 'service' | 'logistics' | 'mixed'
  status: 'draft' | 'active' | 'completed' | 'settled' | 'cancelled'
  created_at: string
  updated_at: string
  organization_id: string
  organizations: { name: string } | null
  contracting_entities: { id: string; name: string } | null
  created_by_profile: { name: string } | null
  assigned_to_profile: { name: string } | null
}

type ContractingEntity = { id: string; name: string }

type AvailableSupplier = { id: string; name: string; whatsapp: string | null; city: string; trusted: boolean }

type ActivityEntry = {
  id: string
  user_id: string
  action: string
  entity_type: string
  entity_id: string
  details: Record<string, unknown>
  created_at: string
}

type Props = {
  contract: Contract
  items: Item[]
  suppliers: AvailableSupplier[]
  profiles: Profile[]
  categories: Category[]
  entities: ContractingEntity[]
  activityLog: ActivityEntry[]
  userRole: string
  currentUserId: string
}

// ── Constants ──────────────────────────────────────────────────
const CONTRACT_TYPE_LABELS: Record<string, string> = {
  supply: 'Suministro', construction: 'Obra', sale: 'Compraventa',
  service: 'Servicios', logistics: 'Logística', mixed: 'Mixto',
  purchase: 'Compras', // legacy
}
const CONTRACT_TYPE_ICONS: Record<string, string> = {
  supply: '🛒', construction: '🏗️', sale: '💰',
  service: '🔧', logistics: '🚚', mixed: '📦',
  purchase: '🛒', // legacy
}

const STATUS_FLOWS: Record<string, string[]> = {
  supply: ['pending', 'sourced', 'purchased', 'shipped', 'received'],
  purchase: ['pending', 'sourced', 'purchased', 'shipped', 'received'], // legacy
  construction: ['pending', 'in_progress', 'done'],
  sale: ['pending', 'sourced', 'purchased', 'shipped', 'received'],
  logistics: ['pending', 'in_progress', 'done'],
  service: ['pending', 'in_progress', 'done'],
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente', sourced: 'Con proveedor', purchased: 'Comprado',
  shipped: 'Enviado', received: 'Recibido', in_progress: 'En gestión',
  done: 'Listo', completed: 'Completado',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  sourced: 'bg-yellow-50 text-yellow-700',
  purchased: 'bg-blue-50 text-blue-700',
  shipped: 'bg-purple-50 text-purple-700',
  received: 'bg-green-50 text-green-700',
  in_progress: 'bg-yellow-50 text-yellow-700',
  done: 'bg-green-50 text-green-700',
  completed: 'bg-green-50 text-green-700',
}

const PAYMENT_LABELS: Record<string, string> = {
  unpaid: 'Sin pagar', invoiced: 'Facturado', paid: 'Pagado',
}
const PAYMENT_COLORS: Record<string, string> = {
  unpaid: 'bg-red-50 text-red-600',
  invoiced: 'bg-amber-50 text-amber-700',
  paid: 'bg-green-50 text-green-700',
}

const FINAL_STATUSES = new Set(['completed', 'done', 'listo', 'finalizado', 'received'])

const ACTION_LABELS: Record<string, string> = {
  status_changed: 'Cambió estado',
  payment_status_changed: 'Cambió estado de pago',
  supplier_assigned: 'Asignó proveedor',
  assigned_to_changed: 'Reasignó responsable',
  item_updated: 'Editó ítem',
  items_batch_status: 'Cambio masivo de estado',
  items_batch_supplier: 'Asignación masiva de proveedor',
  items_batch_assign: 'Asignación masiva de responsable',
}

// ── Helpers ────────────────────────────────────────────────────

function marginPct(sale: number | null, cost: number | null): number | null {
  if (!sale || !cost || sale === 0) return null
  return ((sale - cost) / sale) * 100
}

function marginColor(pct: number | null): string {
  if (pct == null) return 'text-gray-400'
  if (pct < 0) return 'text-red-600 font-semibold'
  if (pct < 15) return 'text-orange-500 font-medium'
  return 'text-green-600'
}

function buildWhatsAppUrl(phone: string | null, item: Item, contract: Contract): string | null {
  if (!phone) return null
  const clean = phone.replace(/\D/g, '')
  if (clean.length < 7) return null

  let msg = ''
  if (item.type === 'purchase') {
    msg = `Hola, te escribo de ${contract.organizations?.name || 'nuestra empresa'} sobre el contrato "${contract.name}". Necesitamos cotización para: ${item.short_name} (${item.quantity} ${item.unit || 'und'}). ¿Nos puedes ayudar?`
  } else if (item.type === 'logistics') {
    msg = `Hola, te escribo de ${contract.organizations?.name || 'nuestra empresa'} sobre "${contract.name}". Necesitamos coordinar: ${item.short_name}. ¿Podemos hablar?`
  } else {
    msg = `Hola, te escribo de ${contract.organizations?.name || 'nuestra empresa'} sobre "${contract.name}". Necesitamos el servicio: ${item.short_name}. ¿Están disponibles?`
  }
  return `https://wa.me/${clean}?text=${encodeURIComponent(msg)}`
}

// ── Component ──────────────────────────────────────────────────
export default function ContractDetail({
  contract: initialContract, items: initialItems, suppliers: suppliersRaw, profiles: profilesRaw, categories: categoriesRaw,
  entities: entitiesRaw, activityLog: activityLogRaw, userRole, currentUserId,
}: Props) {
  const router = useRouter()
  const supabase = createClient()

  // Defensive defaults for server data
  const suppliers = suppliersRaw || []
  const profiles = profilesRaw || []
  const categories = categoriesRaw || []
  const entities = entitiesRaw || []
  const activityLogInit = activityLogRaw || []

  // ── State ────────────────────────────────────────────
  const [contract, setContract] = useState(initialContract)
  const [items, setItems] = useState(initialItems || [])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sideItem, setSideItem] = useState<Item | null>(null)
  const [showEditContract, setShowEditContract] = useState(false)
  const [editForm, setEditForm] = useState({ name: initialContract.name, entity_id: initialContract.entity_id || '', type: initialContract.type })

  // Shipment modal
  const [showShipmentModal, setShowShipmentModal] = useState(false)
  const [shipmentForm, setShipmentForm] = useState({ method: 'avion' as 'avion' | 'barco' | 'terrestre', origin_city: '', dispatch_date: '', estimated_arrival: '', notes: '' })

  // Batch modals
  const [batchModal, setBatchModal] = useState<'supplier' | 'status' | 'assign' | null>(null)
  const [batchSupplier, setBatchSupplier] = useState('')
  const [batchSupplierCost, setBatchSupplierCost] = useState('')
  const [batchStatus, setBatchStatus] = useState('')
  const [batchAssign, setBatchAssign] = useState('')
  const [supplierSearch, setSupplierSearch] = useState('')

  // Add item manually
  const [showAddItem, setShowAddItem] = useState(false)
  const [newItemForm, setNewItemForm] = useState({
    short_name: '', description: '', type: 'purchase' as 'purchase' | 'logistics' | 'service',
    category_id: '', quantity: '1', unit: '', sale_price: '',
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isJefe = userRole === 'jefe'
  const isActive = contract.status === 'active' || contract.status === 'draft'

  // ── Search / filter ──────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items
    const q = searchQuery.toLowerCase()
    return items.filter(item =>
      (item.short_name || '').toLowerCase().includes(q) ||
      (item.description || '').toLowerCase().includes(q) ||
      (item.item_number != null && String(item.item_number).includes(q))
    )
  }, [items, searchQuery])

  // ── Derived data ─────────────────────────────────────
  const grouped = useMemo(() => {
    const groups: Record<string, { supplier: ItemSupplier; items: Item[] }> = {}
    for (const item of filteredItems) {
      const key = item.supplier_id || '__unassigned__'
      if (!groups[key]) {
        groups[key] = { supplier: item.suppliers, items: [] }
      }
      groups[key].items.push(item)
    }
    // "Sin asignar" first, then alphabetically by supplier name
    const entries = Object.entries(groups)
    entries.sort(([a, aGroup], [b, bGroup]) => {
      if (a === '__unassigned__') return -1
      if (b === '__unassigned__') return 1
      return (aGroup.supplier?.name || '').localeCompare(bGroup.supplier?.name || '')
    })
    return entries
  }, [filteredItems])

  // Margin summary
  const marginSummary = useMemo(() => {
    let totalSale = 0, totalCost = 0, lowMarginCount = 0, negativeMarginCount = 0
    let withSupplier = 0
    const itemMargins: { id: string; short_name: string; margin: number }[] = []
    for (const item of items) {
      if (item.sale_price) totalSale += Number(item.sale_price) * Number(item.quantity)
      if (item.supplier_cost) totalCost += Number(item.supplier_cost) * Number(item.quantity)
      if (item.supplier_id) withSupplier++
      const m = marginPct(item.sale_price, item.supplier_cost)
      if (m != null) {
        itemMargins.push({ id: item.id, short_name: item.short_name, margin: m })
        if (m < 0) negativeMarginCount++
        else if (m < 15) lowMarginCount++
      }
    }
    const totalMargin = totalSale > 0 ? ((totalSale - totalCost) / totalSale) * 100 : null
    const supplierPct = items.length > 0 ? Math.round((withSupplier / items.length) * 100) : 0
    const worstMarginItems = [...itemMargins].sort((a, b) => a.margin - b.margin).slice(0, 5)
    return { totalSale, totalCost, totalMargin, lowMarginCount, negativeMarginCount, supplierPct, worstMarginItems }
  }, [items])

  // Recent suppliers in this contract (for chips)
  const recentSuppliers = useMemo(() => {
    const seen = new Map<string, string>()
    for (const item of items) {
      if (item.supplier_id && item.suppliers?.name) {
        seen.set(item.supplier_id, item.suppliers.name)
      }
    }
    return Array.from(seen.entries()).slice(0, 5).map(([id, name]) => ({ id, name }))
  }, [items])

  // Filtered suppliers for search
  const filteredSuppliers = useMemo(() => {
    const list = suppliers || []
    if (!supplierSearch) return list.slice(0, 10)
    const q = supplierSearch.toLowerCase()
    return list.filter(s => s.name.toLowerCase().includes(q)).slice(0, 10)
  }, [suppliers, supplierSearch])

  // Valid statuses for selected items
  const validStatuses = useMemo(() => {
    const selectedItems = items.filter(i => selected.has(i.id))
    const types = new Set(selectedItems.map(i => i.type))
    if (types.size === 1) {
      const t = [...types][0]
      return STATUS_FLOWS[t] || STATUS_FLOWS.service
    }
    // Mixed types — only show common statuses
    return ['pending', 'in_progress', 'done']
  }, [items, selected])

  // ── Activity log helper ──────────────────────────────
  const logActivity = useCallback(async (action: string, entityId: string, details: Record<string, unknown>) => {
    await supabase.from('activity_log').insert({
      user_id: currentUserId,
      action,
      entity_type: 'item',
      entity_id: entityId,
      details,
    })
  }, [supabase, currentUserId])

  // ── Handlers ─────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === items.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(items.map(i => i.id)))
    }
  }

  async function handleBatchSupplier() {
    if (!batchSupplier) return
    setLoading(true)
    setError(null)
    const ids = [...selected]
    const updateData: Record<string, unknown> = { supplier_id: batchSupplier }
    if (batchSupplierCost) updateData.supplier_cost = parseFloat(batchSupplierCost)

    const { error: err } = await supabase
      .from('items')
      .update(updateData)
      .in('id', ids)

    if (err) { setError(err.message); setLoading(false); return }

    const supplierName = suppliers.find(s => s.id === batchSupplier)?.name || ''
    for (const id of ids) {
      await logActivity('items_batch_supplier', id, { supplier: supplierName, cost: batchSupplierCost || null })
    }

    setBatchModal(null)
    setBatchSupplier('')
    setBatchSupplierCost('')
    setSupplierSearch('')
    setSelected(new Set())
    setLoading(false)
    router.refresh()
  }

  async function handleBatchStatus() {
    if (!batchStatus) return
    setLoading(true)
    setError(null)
    const ids = [...selected]

    const { error: err } = await supabase
      .from('items')
      .update({ status: batchStatus })
      .in('id', ids)

    if (err) { setError(err.message); setLoading(false); return }

    for (const id of ids) {
      await logActivity('items_batch_status', id, { new_status: batchStatus })
    }

    setBatchModal(null)
    setBatchStatus('')
    setSelected(new Set())
    setLoading(false)
    router.refresh()
  }

  async function handleBatchAssign() {
    if (!batchAssign) return
    setLoading(true)
    setError(null)
    const ids = [...selected]

    const { error: err } = await supabase
      .from('items')
      .update({ assigned_to: batchAssign })
      .in('id', ids)

    if (err) { setError(err.message); setLoading(false); return }

    const assignName = profiles.find(p => p.id === batchAssign)?.name || ''
    for (const id of ids) {
      await logActivity('items_batch_assign', id, { assigned_to: assignName })
    }

    setBatchModal(null)
    setBatchAssign('')
    setSelected(new Set())
    setLoading(false)
    router.refresh()
  }

  // Add item manually
  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault()
    if (!newItemForm.short_name.trim()) return
    setLoading(true)
    setError(null)

    const nextNumber = items.length > 0 ? Math.max(...items.map(i => i.item_number ?? 0)) + 1 : 1

    const { data, error: err } = await supabase
      .from('items')
      .insert({
        contract_id: contract.id,
        item_number: nextNumber,
        short_name: newItemForm.short_name.trim(),
        description: newItemForm.description.trim(),
        type: newItemForm.type,
        category_id: newItemForm.category_id || null,
        quantity: parseInt(newItemForm.quantity) || 1,
        unit: newItemForm.unit.trim() || null,
        sale_price: newItemForm.sale_price ? parseFloat(newItemForm.sale_price) : null,
        created_by: currentUserId,
      })
      .select(`
        id, item_number, short_name, description, type, quantity, unit, sale_price,
        supplier_cost, status, payment_status, due_date, contact_phone, notes,
        category_id, supplier_id, assigned_to, created_by,
        suppliers ( id, name, whatsapp ),
        profiles ( id, name )
      `)
      .single()

    if (err) { setError(err.message); setLoading(false); return }

    await logActivity('item_updated', data.id, { action: 'created', short_name: newItemForm.short_name.trim() })

    setItems(prev => [...prev, data as unknown as Item])
    setShowAddItem(false)
    setNewItemForm({ short_name: '', description: '', type: 'purchase', category_id: '', quantity: '1', unit: '', sale_price: '' })
    setLoading(false)
  }

  // Side panel: update individual item field
  async function updateItemField(itemId: string, field: string, value: unknown, label?: string) {
    setLoading(true)
    setError(null)

    // Auto-set payment_status to 'paid' when logistics status changes to 'purchased'
    const autoPayment = field === 'status' && value === 'purchased'
    const updateData: Record<string, unknown> = { [field]: value }
    if (autoPayment) updateData.payment_status = 'paid'

    const { error: err } = await supabase
      .from('items')
      .update(updateData)
      .eq('id', itemId)

    if (err) { setError(err.message); setLoading(false); return }

    // Log activity
    const actionMap: Record<string, string> = {
      status: 'status_changed',
      payment_status: 'payment_status_changed',
      supplier_id: 'supplier_assigned',
      assigned_to: 'assigned_to_changed',
    }
    await logActivity(actionMap[field] || 'item_updated', itemId, { field, new_value: label || value })
    if (autoPayment) await logActivity('payment_status_changed', itemId, { field: 'payment_status', new_value: 'Pagado (auto)' })

    // Update local state
    setItems(prev => prev.map(i => {
      if (i.id !== itemId) return i
      const updated = { ...i, [field]: value }
      if (autoPayment) updated.payment_status = 'paid'
      if (field === 'supplier_id') {
        const sup = suppliers.find(s => s.id === value)
        updated.suppliers = sup ? { id: sup.id, name: sup.name, whatsapp: sup.whatsapp } : null
      }
      if (field === 'assigned_to') {
        const prof = profiles.find(p => p.id === value)
        updated.profiles = prof ? { id: prof.id, name: prof.name } : null
      }
      return updated
    }))
    setSideItem(prev => {
      if (!prev || prev.id !== itemId) return prev
      const updated = { ...prev, [field]: value }
      if (autoPayment) updated.payment_status = 'paid'
      if (field === 'supplier_id') {
        const sup = suppliers.find(s => s.id === value)
        updated.suppliers = sup ? { id: sup.id, name: sup.name, whatsapp: sup.whatsapp } : null
      }
      if (field === 'assigned_to') {
        const prof = profiles.find(p => p.id === value)
        updated.profiles = prof ? { id: prof.id, name: prof.name } : null
      }
      return updated
    })

    setLoading(false)
  }

  // Save side panel notes/description
  async function saveSideItemDetails(itemId: string, data: { description?: string; notes?: string; contact_phone?: string; supplier_cost?: number | null; sale_price?: number | null }) {
    setLoading(true)
    setError(null)

    const { error: err } = await supabase
      .from('items')
      .update(data)
      .eq('id', itemId)

    if (err) { setError(err.message); setLoading(false); return }

    await logActivity('item_updated', itemId, { fields: Object.keys(data) })

    setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...data } : i))
    setSideItem(prev => prev && prev.id === itemId ? { ...prev, ...data } : prev)
    setLoading(false)
  }

  // Contract edit
  async function handleEditContract(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const entityName = entities.find(e => e.id === editForm.entity_id)?.name || ''

    const { data, error: err } = await supabase
      .from('contracts')
      .update({ name: editForm.name, entity: entityName, entity_id: editForm.entity_id || null, type: editForm.type })
      .eq('id', contract.id)
      .select(`
        id, name, entity, entity_id, type, status, created_at, updated_at, organization_id,
        organizations ( name ),
        contracting_entities!contracts_entity_id_fkey ( id, name ),
        created_by_profile:profiles!contracts_created_by_fkey ( name ),
        assigned_to_profile:profiles!contracts_assigned_to_fkey ( name )
      `)
      .single()

    if (err) { setError(err.message) } else { setContract(data as unknown as Contract); setShowEditContract(false) }
    setLoading(false)
  }

  async function handleArchive() {
    if (!confirm('¿Archivar este contrato? Quedará inactivo pero no se eliminará.')) return
    setLoading(true)
    const { error: err } = await supabase.from('contracts').update({ deleted_at: new Date().toISOString() }).eq('id', contract.id)
    if (err) { setError(err.message); setLoading(false); return }
    router.push('/dashboard')
  }

  async function handleComplete() {
    const pending = items.filter(i => !FINAL_STATUSES.has(i.status))
    if (pending.length > 0) {
      setError(`Hay ${pending.length} ${pending.length === 1 ? 'ítem' : 'ítems'} sin completar. Finalizalos antes de cerrar el contrato.`)
      return
    }
    if (!confirm('¿Marcar este contrato como completado?')) return
    setLoading(true)
    const { data, error: err } = await supabase
      .from('contracts')
      .update({ status: 'completed' })
      .eq('id', contract.id)
      .select(`
        id, name, entity, type, status, created_at, updated_at, organization_id,
        organizations ( name ),
        created_by_profile:profiles!contracts_created_by_fkey ( name ),
        assigned_to_profile:profiles!contracts_assigned_to_fkey ( name )
      `)
      .single()
    if (err) { setError(err.message) } else { setContract(data as unknown as Contract) }
    setLoading(false)
  }

  // Purchased items selected for shipment
  const purchasedSelected = useMemo(() => {
    return items.filter(i => selected.has(i.id) && i.type === 'purchase' && i.status === 'purchased')
  }, [items, selected])

  // Create shipment handler
  async function handleCreateShipment(e: React.FormEvent) {
    e.preventDefault()
    if (purchasedSelected.length === 0) return
    setLoading(true)
    setError(null)

    const { data: shipment, error: err } = await supabase
      .from('shipments')
      .insert({
        contract_id: contract.id,
        method: shipmentForm.method,
        origin_city: shipmentForm.origin_city,
        dispatch_date: shipmentForm.dispatch_date,
        estimated_arrival: shipmentForm.estimated_arrival,
        notes: shipmentForm.notes,
        created_by: currentUserId,
      })
      .select('id')
      .single()

    if (err || !shipment) { setError(err?.message || 'Error creando envío'); setLoading(false); return }

    // Link items to shipment
    const itemLinks = purchasedSelected.map(i => ({ shipment_id: shipment.id, item_id: i.id }))
    await supabase.from('shipment_items').insert(itemLinks)

    // Update items to "shipped"
    const ids = purchasedSelected.map(i => i.id)
    await supabase.from('items').update({ status: 'shipped' }).in('id', ids)

    // Log activity
    for (const id of ids) {
      await logActivity('status_changed', id, { new_value: 'Enviado', shipment_id: shipment.id })
    }

    setShowShipmentModal(false)
    setShipmentForm({ method: 'avion', origin_city: '', dispatch_date: '', estimated_arrival: '', notes: '' })
    setSelected(new Set())
    setLoading(false)
    router.refresh()
  }

  // ── Render ───────────────────────────────────────────
  const contractStatusColor: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600', active: 'bg-blue-50 text-blue-700',
    completed: 'bg-green-50 text-green-700', cancelled: 'bg-red-50 text-red-600',
  }
  const contractStatusLabel: Record<string, string> = {
    draft: 'Borrador', active: 'Activo', completed: 'Completado', cancelled: 'Cancelado',
  }

  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className={`flex-1 overflow-y-auto p-8 ${sideItem ? 'mr-[420px]' : ''}`}>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">{CONTRACT_TYPE_ICONS[contract.type]}</span>
              <h1 className="text-2xl font-bold text-gray-900">{contract.name}</h1>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${contractStatusColor[contract.status]}`}>
                {contractStatusLabel[contract.status]}
              </span>
            </div>
            <p className="text-gray-500 text-sm">
              {contract.contracting_entities?.name ?? contract.entity} · {contract.organizations?.name ?? '—'}
            </p>
          </div>

          {isJefe && (
            <div className="flex items-center gap-2">
              <button onClick={() => { setEditForm({ name: contract.name, entity_id: contract.entity_id || '', type: contract.type }); setError(null); setShowEditContract(true) }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Editar
              </button>
              {isActive && (
                <button onClick={handleComplete} disabled={loading}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
                  Completar contrato
                </button>
              )}
              {isActive && (
                <button onClick={handleArchive} disabled={loading}
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

        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Margin summary */}
        {items.length > 0 && (marginSummary.totalSale > 0 || marginSummary.totalCost > 0) && (
          <div className="space-y-4 mb-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Ingreso total</p>
                <p className="text-lg font-semibold text-gray-900">{formatCurrency(marginSummary.totalSale)}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Costo total</p>
                <p className="text-lg font-semibold text-gray-900">{formatCurrency(marginSummary.totalCost)}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Margen</p>
                <p className={`text-lg font-semibold ${marginColor(marginSummary.totalMargin)}`}>
                  {marginSummary.totalMargin != null ? `${marginSummary.totalMargin.toFixed(1)}%` : '—'}
                </p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Con proveedor</p>
                <p className="text-lg font-semibold text-gray-900">{marginSummary.supplierPct}%</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Alertas</p>
                <div className="flex gap-2">
                  {marginSummary.negativeMarginCount > 0 && (
                    <span className="text-sm text-red-600 font-medium">{marginSummary.negativeMarginCount} negativo{marginSummary.negativeMarginCount > 1 ? 's' : ''}</span>
                  )}
                  {marginSummary.lowMarginCount > 0 && (
                    <span className="text-sm text-orange-500 font-medium">{marginSummary.lowMarginCount} bajo{marginSummary.lowMarginCount > 1 ? 's' : ''}</span>
                  )}
                  {marginSummary.negativeMarginCount === 0 && marginSummary.lowMarginCount === 0 && (
                    <span className="text-sm text-green-600">Todo bien</span>
                  )}
                </div>
              </div>
            </div>
            {/* Worst margin items */}
            {marginSummary.worstMarginItems.length > 0 && marginSummary.worstMarginItems[0].margin < 15 && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Ítems con peor margen</p>
                <div className="flex flex-wrap gap-2">
                  {marginSummary.worstMarginItems.map(wi => (
                    <span key={wi.id} className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border ${
                      wi.margin < 0 ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'
                    }`}>
                      {wi.short_name}
                      <span className="font-semibold">{wi.margin.toFixed(1)}%</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Info cards */}
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
                <dd className="text-gray-500">{new Date(contract.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Batch toolbar */}
        {selected.size > 0 && (
          <div className="mb-4 bg-gray-900 text-white rounded-xl px-5 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <span className="text-sm font-medium">{selected.size} ítem{selected.size > 1 ? 's' : ''} seleccionado{selected.size > 1 ? 's' : ''}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => { setBatchModal('supplier'); setBatchSupplier(''); setBatchSupplierCost(''); setSupplierSearch('') }}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors">
                Asignar proveedor
              </button>
              <button onClick={() => { setBatchModal('status'); setBatchStatus('') }}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors">
                Cambiar estado
              </button>
              <button onClick={() => { setBatchModal('assign'); setBatchAssign('') }}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors">
                Asignar a
              </button>
              {purchasedSelected.length > 0 && (
                <button onClick={() => setShowShipmentModal(true)}
                  className="px-3 py-1.5 bg-purple-500/80 hover:bg-purple-500 rounded-lg text-sm transition-colors">
                  🚚 Crear envío ({purchasedSelected.length})
                </button>
              )}
              <button onClick={() => setSelected(new Set())}
                className="px-3 py-1.5 hover:bg-white/20 rounded-lg text-sm transition-colors ml-2">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Items grouped by supplier */}
        <div className="bg-white border border-gray-200 rounded-xl">
          <div className="px-5 py-4 border-b border-gray-200 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="font-semibold text-gray-900">
                  Ítems <span className="ml-1 text-sm font-normal text-gray-400">({filteredItems.length}{searchQuery ? ` de ${items.length}` : ''})</span>
                </h2>
                {isActive && (
                  <button onClick={() => setShowAddItem(true)}
                    className="px-3 py-1 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-700 transition-colors">
                    + Agregar ítem
                  </button>
                )}
              </div>
              {items.length > 0 && (
                <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
                  <input type="checkbox" checked={selected.size === items.length && items.length > 0}
                    onChange={toggleSelectAll} className="rounded border-gray-300" />
                  Seleccionar todos
                </label>
              )}
            </div>
            {items.length > 5 && (
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar item por nombre, descripcion o numero..."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 placeholder:text-gray-400"
              />
            )}
          </div>

          {items.length === 0 ? (
            <div className="px-5 py-10 text-center text-gray-400">
              <p className="text-lg mb-1">Este contrato no tiene ítems.</p>
              <p className="text-sm">Subí un Excel o agregá ítems manualmente.</p>
            </div>
          ) : (
            <div>
              {grouped.map(([key, group]) => (
                <div key={key}>
                  {/* Supplier group header */}
                  <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">
                      {key === '__unassigned__' ? '📋 Sin proveedor asignado' : `🏪 ${group.supplier?.name}`}
                    </span>
                    <span className="text-xs text-gray-400">({group.items.length})</span>
                  </div>

                  {/* Items table */}
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[600px]">
                    <tbody className="divide-y divide-gray-100">
                      {group.items.map(item => {
                        const m = marginPct(item.sale_price, item.supplier_cost)
                        return (
                          <tr key={item.id}
                            className={`hover:bg-gray-50 transition-colors cursor-pointer ${selected.has(item.id) ? 'bg-blue-50/50' : ''}`}
                            onClick={() => setSideItem(item)}>
                            <td className="pl-5 py-3 w-10" onClick={e => e.stopPropagation()}>
                              <input type="checkbox" checked={selected.has(item.id)}
                                onChange={() => toggleSelect(item.id)} className="rounded border-gray-300" />
                            </td>
                            <td className="py-3 w-12 text-gray-400 text-xs">
                              {item.item_number ?? '—'}
                            </td>
                            <td className="py-3 pr-4">
                              <div className="font-medium text-gray-900">{item.short_name}</div>
                              <div className="text-xs text-gray-400">{item.quantity} {item.unit || 'und'}</div>
                            </td>
                            <td className="py-3 pr-4">
                              <div className="flex gap-1.5">
                                <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[item.status] || STATUS_COLORS.pending}`}>
                                  {STATUS_LABELS[item.status] || item.status}
                                </span>
                                <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${PAYMENT_COLORS[item.payment_status]}`}>
                                  {PAYMENT_LABELS[item.payment_status]}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 pr-4 text-gray-500 text-xs">
                              {item.profiles?.name ?? '—'}
                            </td>
                            <td className="py-3 pr-5 text-right">
                              {m != null && (
                                <span className={`text-xs ${marginColor(m)}`}>
                                  {m.toFixed(0)}%
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent activity */}
        {activityLogInit.length > 0 && (
          <div className="mt-6 bg-white border border-gray-200 rounded-xl">
            <div className="px-5 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Actividad reciente</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {activityLogInit.slice(0, 10).map(entry => (
                <div key={entry.id} className="px-5 py-3 flex items-center justify-between text-sm">
                  <div>
                    <span className="text-gray-700 font-medium">
                      {ACTION_LABELS[entry.action] || entry.action}
                    </span>
                    {entry.details && Object.keys(entry.details).length > 0 && (
                      <span className="text-gray-400 ml-2">
                        {entry.details.new_value ? `→ ${entry.details.new_value as string}` : ''}
                        {entry.details.supplier ? `→ ${entry.details.supplier as string}` : ''}
                        {entry.details.assigned_to ? `→ ${entry.details.assigned_to as string}` : ''}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(entry.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Side panel */}
      {sideItem && (
        <SidePanel
          item={sideItem}
          contract={contract}
          suppliers={suppliers}
          profiles={profiles}
          categories={categories}
          recentSuppliers={recentSuppliers}
          loading={loading}
          onClose={() => setSideItem(null)}
          onUpdateField={updateItemField}
          onSaveDetails={saveSideItemDetails}
          activityLog={activityLogInit.filter(a => a.entity_id === sideItem.id).slice(0, 5)}
        />
      )}

      {/* Batch modal: Assign supplier */}
      {batchModal === 'supplier' && (
        <Modal title="Asignar proveedor" onClose={() => setBatchModal(null)}>
          {recentSuppliers.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Recientes en este contrato</p>
              <div className="flex flex-wrap gap-2">
                {recentSuppliers.map(s => (
                  <button key={s.id} onClick={() => setBatchSupplier(s.id)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${batchSupplier === s.id ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mb-3">
            <input type="text" placeholder="Buscar proveedor..." value={supplierSearch}
              onChange={e => setSupplierSearch(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div className="max-h-40 overflow-y-auto mb-4 space-y-1">
            {filteredSuppliers.map(s => (
              <button key={s.id} onClick={() => setBatchSupplier(s.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${batchSupplier === s.id ? 'bg-gray-900 text-white' : 'hover:bg-gray-50 text-gray-700'}`}>
                {s.name} {s.city && <span className="text-gray-400">· {s.city}</span>} {s.trusted && <span className="text-green-500 ml-1">✓</span>}
              </button>
            ))}
            {filteredSuppliers.length === 0 && <p className="text-sm text-gray-400 text-center py-2">Sin resultados</p>}
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Costo proveedor (opcional)</label>
            <input type="number" value={batchSupplierCost} onChange={e => setBatchSupplierCost(e.target.value)}
              placeholder="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div className="flex gap-3">
            <button onClick={() => setBatchModal(null)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Cancelar</button>
            <button onClick={handleBatchSupplier} disabled={!batchSupplier || loading}
              className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50">
              {loading ? 'Guardando...' : 'Asignar'}
            </button>
          </div>
        </Modal>
      )}

      {/* Batch modal: Change status */}
      {batchModal === 'status' && (
        <Modal title="Cambiar estado" onClose={() => setBatchModal(null)}>
          <div className="space-y-2 mb-4">
            {validStatuses.map(s => (
              <button key={s} onClick={() => setBatchStatus(s)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${batchStatus === s ? 'bg-gray-900 text-white' : 'hover:bg-gray-50 text-gray-700'}`}>
                <span className={`inline-block w-2 h-2 rounded-full mr-2 ${(STATUS_COLORS[s] || '').split(' ')[0]?.replace('bg-', 'bg-') || 'bg-gray-300'}`} />
                {STATUS_LABELS[s] || s}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={() => setBatchModal(null)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Cancelar</button>
            <button onClick={handleBatchStatus} disabled={!batchStatus || loading}
              className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50">
              {loading ? 'Guardando...' : 'Cambiar'}
            </button>
          </div>
        </Modal>
      )}

      {/* Batch modal: Assign user */}
      {batchModal === 'assign' && (
        <Modal title="Asignar responsable" onClose={() => setBatchModal(null)}>
          <div className="space-y-2 mb-4">
            {profiles.map(p => (
              <button key={p.id} onClick={() => setBatchAssign(p.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${batchAssign === p.id ? 'bg-gray-900 text-white' : 'hover:bg-gray-50 text-gray-700'}`}>
                {p.name} <span className="text-gray-400">· {p.role}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={() => setBatchModal(null)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Cancelar</button>
            <button onClick={handleBatchAssign} disabled={!batchAssign || loading}
              className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50">
              {loading ? 'Guardando...' : 'Asignar'}
            </button>
          </div>
        </Modal>
      )}

      {/* Shipment modal */}
      {showShipmentModal && (
        <Modal title="Crear envío" onClose={() => setShowShipmentModal(false)}>
          <form onSubmit={handleCreateShipment} className="space-y-4">
            <p className="text-sm text-gray-500">{purchasedSelected.length} ítem{purchasedSelected.length > 1 ? 's' : ''} de tipo compra pasarán a &quot;Enviado&quot;.</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Método de envío</label>
              <select value={shipmentForm.method} onChange={e => setShipmentForm({ ...shipmentForm, method: e.target.value as 'avion' | 'barco' | 'terrestre' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
                <option value="avion">✈️ Avión</option>
                <option value="barco">🚢 Barco</option>
                <option value="terrestre">🚛 Terrestre</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad origen</label>
              <input type="text" value={shipmentForm.origin_city} onChange={e => setShipmentForm({ ...shipmentForm, origin_city: e.target.value })} required
                placeholder="Ej: Bogotá" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha despacho</label>
                <input type="date" value={shipmentForm.dispatch_date} onChange={e => setShipmentForm({ ...shipmentForm, dispatch_date: e.target.value })} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Llegada estimada</label>
                <input type="date" value={shipmentForm.estimated_arrival} onChange={e => setShipmentForm({ ...shipmentForm, estimated_arrival: e.target.value })} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
              <textarea value={shipmentForm.notes} onChange={e => setShipmentForm({ ...shipmentForm, notes: e.target.value })}
                rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none" />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowShipmentModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancelar</button>
              <button type="submit" disabled={loading}
                className="flex-1 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors">
                {loading ? 'Creando...' : 'Crear envío'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit contract modal */}
      {showEditContract && (
        <Modal title="Editar contrato" onClose={() => setShowEditContract(false)}>
          <form onSubmit={handleEditContract} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del contrato</label>
              <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Entidad contratante</label>
              <select value={editForm.entity_id} onChange={e => setEditForm({ ...editForm, entity_id: e.target.value })} required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
                <option value="">Seleccioná una entidad...</option>
                {entities.map(ent => (
                  <option key={ent.id} value={ent.id}>{ent.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
              <select value={editForm.type} onChange={e => setEditForm({ ...editForm, type: e.target.value as typeof editForm.type })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
                <option value="purchase">Compras</option>
                <option value="logistics">Logística</option>
                <option value="service">Servicios</option>
                <option value="mixed">Mixto</option>
              </select>
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowEditContract(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancelar</button>
              <button type="submit" disabled={loading}
                className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
                {loading ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add item modal */}
      {showAddItem && (
        <Modal title="Agregar ítem" onClose={() => setShowAddItem(false)}>
          <form onSubmit={handleAddItem} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre corto *</label>
              <input type="text" value={newItemForm.short_name} onChange={e => setNewItemForm(f => ({ ...f, short_name: e.target.value }))} required
                placeholder="Ej: Resma carta" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
              <textarea value={newItemForm.description} onChange={e => setNewItemForm(f => ({ ...f, description: e.target.value }))}
                rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select value={newItemForm.type} onChange={e => setNewItemForm(f => ({ ...f, type: e.target.value as 'purchase' | 'logistics' | 'service' }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
                  <option value="purchase">Compra</option>
                  <option value="logistics">Logística</option>
                  <option value="service">Servicio</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                <select value={newItemForm.category_id} onChange={e => setNewItemForm(f => ({ ...f, category_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
                  <option value="">Sin categoría</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad *</label>
                <input type="number" min="1" value={newItemForm.quantity} onChange={e => setNewItemForm(f => ({ ...f, quantity: e.target.value }))} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unidad</label>
                <input type="text" value={newItemForm.unit} onChange={e => setNewItemForm(f => ({ ...f, unit: e.target.value }))}
                  placeholder="und" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Precio venta</label>
                <input type="number" value={newItemForm.sale_price} onChange={e => setNewItemForm(f => ({ ...f, sale_price: e.target.value }))}
                  placeholder="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowAddItem(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancelar</button>
              <button type="submit" disabled={!newItemForm.short_name.trim() || loading}
                className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
                {loading ? 'Guardando...' : 'Agregar ítem'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ── Modal wrapper ──────────────────────────────────────────────
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

// ── Side panel ─────────────────────────────────────────────────
function SidePanel({
  item, contract, suppliers, profiles, categories, recentSuppliers, loading,
  onClose, onUpdateField, onSaveDetails, activityLog,
}: {
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
}) {
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
                  <span>{new Date(entry.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
