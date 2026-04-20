'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import DeleteButton from '@/components/ui/DeleteButton'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils/format'
import {
  CONTRACT_TYPE_LABELS, CONTRACT_TYPE_ICONS, STATUS_FLOWS, STATUS_LABELS, STATUS_COLORS,
  PAYMENT_LABELS, PAYMENT_COLORS, FINAL_STATUSES, ACTION_LABELS,
  CONTRACT_STATUS_COLOR, CONTRACT_STATUS_LABEL,
} from './contract-detail/constants'
import { marginPct, marginColor, buildWhatsAppUrl } from './contract-detail/utils'
import { useItemGrouping, useMarginSummary, useRecentSuppliers } from './contract-detail/hooks'
import SidePanel from './contract-detail/SidePanel'
import ContractHeader from './contract-detail/ContractHeader'
import MarginSummary from './contract-detail/MarginSummary'
import InfoCards from './contract-detail/InfoCards'
import ActivityFeed from './contract-detail/ActivityFeed'
import BatchSupplierModal from './contract-detail/BatchSupplierModal'
import BatchStatusModal from './contract-detail/BatchStatusModal'
import BatchAssignModal from './contract-detail/BatchAssignModal'
import ShipmentModal from './contract-detail/ShipmentModal'
import EditContractModal from './contract-detail/EditContractModal'
import AddItemModal from './contract-detail/AddItemModal'
import BatchToolbar from './contract-detail/BatchToolbar'
import ItemsTable from './contract-detail/ItemsTable'
import type {
  Profile, Category, Item, Contract, ContractingEntity, AvailableSupplier, ActivityEntry,
} from './contract-detail/types'

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
  const grouped = useItemGrouping(filteredItems)
  const marginSummary = useMarginSummary(items)
  const recentSuppliers = useRecentSuppliers(items)

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
  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className={`flex-1 overflow-y-auto p-8 ${sideItem ? 'mr-[420px]' : ''}`}>

        <ContractHeader
          contract={contract}
          isJefe={isJefe}
          isActive={isActive}
          loading={loading}
          onEdit={() => { setEditForm({ name: contract.name, entity_id: contract.entity_id || '', type: contract.type }); setError(null); setShowEditContract(true) }}
          onComplete={handleComplete}
          onArchive={handleArchive}
        />

        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <MarginSummary summary={marginSummary} itemsCount={items.length} />

        <InfoCards contract={contract} />

        <BatchToolbar
          selectedCount={selected.size}
          purchasedSelectedCount={purchasedSelected.length}
          onAssignSupplier={() => { setBatchModal('supplier'); setBatchSupplier(''); setBatchSupplierCost(''); setSupplierSearch('') }}
          onChangeStatus={() => { setBatchModal('status'); setBatchStatus('') }}
          onAssignUser={() => { setBatchModal('assign'); setBatchAssign('') }}
          onCreateShipment={() => setShowShipmentModal(true)}
          onClear={() => setSelected(new Set())}
        />

        <ItemsTable
          grouped={grouped}
          totalCount={items.length}
          filteredCount={filteredItems.length}
          selected={selected}
          isActive={isActive}
          searchQuery={searchQuery}
          showSearch={items.length > 5}
          onSearchChange={setSearchQuery}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onAddItem={() => setShowAddItem(true)}
          onItemClick={setSideItem}
        />

        <ActivityFeed entries={activityLogInit} />
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

      {batchModal === 'supplier' && (
        <BatchSupplierModal
          recentSuppliers={recentSuppliers}
          filteredSuppliers={filteredSuppliers}
          supplierSearch={supplierSearch}
          batchSupplier={batchSupplier}
          batchSupplierCost={batchSupplierCost}
          loading={loading}
          onSearchChange={setSupplierSearch}
          onSupplierSelect={setBatchSupplier}
          onCostChange={setBatchSupplierCost}
          onCancel={() => setBatchModal(null)}
          onConfirm={handleBatchSupplier}
        />
      )}

      {batchModal === 'status' && (
        <BatchStatusModal
          validStatuses={validStatuses}
          batchStatus={batchStatus}
          loading={loading}
          onStatusSelect={setBatchStatus}
          onCancel={() => setBatchModal(null)}
          onConfirm={handleBatchStatus}
        />
      )}

      {batchModal === 'assign' && (
        <BatchAssignModal
          profiles={profiles}
          batchAssign={batchAssign}
          loading={loading}
          onAssignSelect={setBatchAssign}
          onCancel={() => setBatchModal(null)}
          onConfirm={handleBatchAssign}
        />
      )}

      {showShipmentModal && (
        <ShipmentModal
          form={shipmentForm}
          itemsCount={purchasedSelected.length}
          loading={loading}
          error={error}
          onFormChange={setShipmentForm}
          onCancel={() => setShowShipmentModal(false)}
          onSubmit={handleCreateShipment}
        />
      )}

      {showEditContract && (
        <EditContractModal
          form={editForm}
          entities={entities}
          loading={loading}
          error={error}
          onFormChange={setEditForm}
          onCancel={() => setShowEditContract(false)}
          onSubmit={handleEditContract}
        />
      )}

      {showAddItem && (
        <AddItemModal
          form={newItemForm}
          categories={categories}
          loading={loading}
          error={error}
          onFormChange={setNewItemForm}
          onCancel={() => setShowAddItem(false)}
          onSubmit={handleAddItem}
        />
      )}
    </div>
  )
}
