'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils/format'
import {
  FileText, ClipboardList, Truck, Receipt,
  AlertTriangle, Clock, FileWarning, TrendingDown,
  TrendingUp, Plus, Filter, ArrowUpDown, ChevronRight,
  Search,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────
type Item = {
  id: string
  short_name: string
  status: string
  type: string
  sale_price: number | null
  supplier_cost: number | null
  supplier_id: string | null
  assigned_to: string | null
  updated_at: string
  contract_id: string
  quantity: number
}

type Contract = {
  id: string
  name: string
  entity: string
  type: 'supply' | 'construction' | 'sale' | 'service' | 'logistics' | 'mixed'
  status: 'draft' | 'active' | 'completed' | 'settled' | 'cancelled'
  created_at: string
  organizations: { name: string } | null
  profiles: { name: string } | null
  items: { status: string }[]
}

type Shipment = {
  id: string
  contract_id: string
  estimated_arrival: string
  actual_arrival: string | null
  origin_city: string
  contracts: { name: string } | null
}

type Invoice = {
  id: string
  total: number
  contract_id: string
}

type ActivityEntry = {
  id: string
  user_id: string
  action: string
  entity_type: string
  entity_id: string
  details: Record<string, unknown>
  created_at: string
  profiles: { name: string } | null
}

type Profile = { id: string; name: string; role: string }

type SupplierDoc = {
  id: string
  supplier_id: string
  type: string
  expires_at: string | null
  suppliers: { name: string } | null
}

type Props = {
  contracts: Contract[]
  items: Item[]
  shipments: Shipment[]
  invoices: Invoice[]
  activities: ActivityEntry[]
  profiles: Profile[]
  supplierDocs: SupplierDoc[]
  userRole: string
}

// ── Constants ──────────────────────────────────────────────────
const CONTRACT_TYPE_LABELS: Record<string, string> = {
  supply: 'Suministro', construction: 'Obra', sale: 'Compraventa',
  service: 'Servicios', logistics: 'Logística', mixed: 'Mixto',
  purchase: 'Compras',
}
const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador', active: 'Activo', completed: 'Completado',
  cancelled: 'Cancelado', settled: 'Liquidado',
}
const DONE_STATUSES = new Set(['completed', 'done', 'listo', 'finalizado', 'paid', 'received'])

const ACTION_LABELS: Record<string, string> = {
  status_changed: 'cambió estado',
  payment_status_changed: 'cambió pago',
  supplier_assigned: 'asignó proveedor',
  assigned_to_changed: 'reasignó',
  item_updated: 'editó ítem',
  items_batch_status: 'cambio masivo',
  items_batch_supplier: 'asignación masiva proveedor',
  items_batch_assign: 'asignación masiva',
  shipment_created: 'creó envío',
  invoice_uploaded: 'subió factura',
}

// ── Helpers ────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'justo ahora'
  if (diffMin < 60) return `hace ${diffMin}m`
  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return `hace ${diffHrs}h`
  const diffDays = Math.floor(diffHrs / 24)
  if (diffDays === 1) return 'ayer'
  return `hace ${diffDays}d`
}

function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

// ── Status pill ────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  if (status === 'active') return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-700/10">
      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5" />
      {STATUS_LABELS[status] ?? status}
    </span>
  )
  if (status === 'completed' || status === 'settled') return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ring-1 ring-inset ring-green-600/20"
      style={{ backgroundColor: '#F0FDF4', color: '#15803D' }}>
      <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5" />
      {STATUS_LABELS[status] ?? status}
    </span>
  )
  if (status === 'draft') return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ring-1 ring-inset ring-amber-600/20"
      style={{ backgroundColor: '#FFFBF0', color: '#B45309' }}>
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5" />
      {STATUS_LABELS[status] ?? status}
    </span>
  )
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5" />
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

// ── Progress bar ───────────────────────────────────────────────
function ProgressBar({ items }: { items: { status: string }[] }) {
  if (items.length === 0) return <span className="text-xs text-gray-400">Sin ítems</span>
  const done = items.filter(i => DONE_STATUSES.has(i.status)).length
  const pct = Math.round((done / items.length) * 100)
  const fillColor = pct === 100 ? 'bg-green-500' : 'bg-gray-900'
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-[100px]">
        <div className={`${fillColor} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 font-medium w-12 text-right">{done}/{items.length}</span>
    </div>
  )
}

type FilterTab = 'active' | 'completed' | 'all'

// ── Component ──────────────────────────────────────────────────
export default function DashboardClient({ contracts, items, shipments, invoices, activities, profiles, supplierDocs, userRole }: Props) {
  const [filter, setFilter] = useState<FilterTab>('active')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    let list = contracts.filter(c => {
      if (filter === 'active') return c.status === 'active' || c.status === 'draft'
      if (filter === 'completed') return c.status === 'completed' || c.status === 'cancelled' || c.status === 'settled'
      return true
    })
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.entity.toLowerCase().includes(q) ||
        c.organizations?.name.toLowerCase().includes(q)
      )
    }
    return list
  }, [contracts, filter, search])

  const counts = {
    active: contracts.filter(c => c.status === 'active' || c.status === 'draft').length,
    completed: contracts.filter(c => c.status === 'completed' || c.status === 'cancelled' || c.status === 'settled').length,
    all: contracts.length,
  }

  // ── Metrics ────────────────────────────────────────────────
  const activeContracts = contracts.filter(c => c.status === 'active').length
  const pendingItems = items.filter(i => i.status === 'pending').length
  const shipmentsInTransit = shipments.filter(s => !s.actual_arrival).length
  const unpaidInvoiceTotal = useMemo(() =>
    invoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0),
    [invoices]
  )

  // ── Alerts ─────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0]
  const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString()
  const thirtyDaysFromNow = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]

  const delayedShipments = useMemo(() =>
    shipments.filter(s => !s.actual_arrival && s.estimated_arrival < today),
    [shipments, today]
  )
  const staleItems = useMemo(() =>
    items.filter(i => !DONE_STATUSES.has(i.status) && i.updated_at < fiveDaysAgo),
    [items, fiveDaysAgo]
  )
  const expiringDocs = useMemo(() =>
    supplierDocs.filter(d => d.expires_at && d.expires_at <= thirtyDaysFromNow && d.expires_at >= today),
    [supplierDocs, today, thirtyDaysFromNow]
  )
  const negativeMarginItems = useMemo(() =>
    items.filter(i => i.sale_price && i.supplier_cost && Number(i.supplier_cost) > Number(i.sale_price)),
    [items]
  )
  const totalAlerts = delayedShipments.length + staleItems.length + expiringDocs.length + negativeMarginItems.length

  // ── Per-person view ────────────────────────────────────────
  const operadoras = useMemo(() => {
    return profiles.filter(p => p.role === 'operadora').map(op => {
      const opItems = items.filter(i => i.assigned_to === op.id)
      const done = opItems.filter(i => DONE_STATUSES.has(i.status)).length
      return { ...op, items: opItems.length, done, pending: opItems.length - done }
    })
  }, [profiles, items])

  return (
    <div className="flex flex-col min-h-full">

      {/* ── Sticky header ─────────────────────────────────────── */}
      <header className="sticky top-0 z-10 h-14 bg-white border-b border-[#EAEAEA] flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center text-sm">
          <span className="text-gray-500">Operaciones</span>
          <ChevronRight size={12} className="mx-1.5 text-gray-400" />
          <span className="font-medium text-gray-900">Dashboard</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative hidden md:block">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar contratos..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-56 bg-gray-50 border border-[#EAEAEA] text-sm rounded-md pl-9 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all placeholder:text-gray-400"
            />
          </div>
          {userRole === 'jefe' && (
            <Link href="/contracts/new"
              className="flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-3 py-1.5 rounded-md shadow-sm transition-colors">
              <Plus size={14} />
              Nuevo Contrato
            </Link>
          )}
        </div>
      </header>

      {/* ── Scrollable content ─────────────────────────────────── */}
      <div className="flex-1 p-6 md:p-8 space-y-8">

        {/* ── Empty state ──────────────────────────────────────── */}
        {contracts.length === 0 && (
          <div className="bg-white border border-[#EAEAEA] rounded-xl px-6 py-16 text-center">
            {userRole === 'jefe' ? (
              <>
                <p className="text-gray-500 text-base mb-1">No tenés contratos aún.</p>
                <p className="text-gray-400 text-sm mb-4">Creá tu primer contrato para empezar a gestionar licitaciones.</p>
                <Link href="/contracts/new"
                  className="inline-flex items-center gap-1.5 bg-gray-900 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-800 transition-colors">
                  <Plus size={14} />
                  Crear primer contrato
                </Link>
              </>
            ) : (
              <>
                <p className="text-gray-500 text-base mb-1">No tenés ítems asignados aún.</p>
                <p className="text-gray-400 text-sm">Tu jefe te asignará tareas pronto.</p>
              </>
            )}
          </div>
        )}

        {/* ── KPI Cards ────────────────────────────────────────── */}
        {contracts.length > 0 && (
          <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white border border-[#EAEAEA] rounded-xl p-5 flex flex-col group hover:border-gray-300 transition-colors"
              style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-medium text-gray-500">Contratos activos</h3>
                <div className="p-1.5 bg-blue-50 text-blue-600 rounded-md ring-1 ring-blue-500/10">
                  <FileText size={14} />
                </div>
              </div>
              <span className="text-3xl font-semibold text-gray-900 tracking-tight">{activeContracts}</span>
              <div className="flex items-center mt-2 text-xs text-gray-400">
                <TrendingUp size={12} className="text-emerald-500 mr-1" />
                <span>{contracts.length} total</span>
              </div>
            </div>

            <div className="bg-white border border-[#EAEAEA] rounded-xl p-5 flex flex-col group hover:border-gray-300 transition-colors"
              style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-medium text-gray-500">Ítems pendientes</h3>
                <div className="p-1.5 bg-amber-50 text-amber-600 rounded-md ring-1 ring-amber-500/10">
                  <ClipboardList size={14} />
                </div>
              </div>
              <span className="text-3xl font-semibold text-gray-900 tracking-tight">{pendingItems}</span>
              <div className="flex items-center mt-2 text-xs text-gray-400">
                <span>{items.length} ítems en total</span>
              </div>
            </div>

            <div className="bg-white border border-[#EAEAEA] rounded-xl p-5 flex flex-col group hover:border-gray-300 transition-colors"
              style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-medium text-gray-500">Envíos en camino</h3>
                <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-md ring-1 ring-indigo-500/10">
                  <Truck size={14} />
                </div>
              </div>
              <span className="text-3xl font-semibold text-gray-900 tracking-tight">{shipmentsInTransit}</span>
              <div className="flex items-center mt-2 text-xs">
                {delayedShipments.length > 0
                  ? <span className="text-red-500">{delayedShipments.length} con retraso</span>
                  : <span className="text-gray-400">Sin retrasos</span>
                }
              </div>
            </div>

            <div className="bg-white border border-[#EAEAEA] rounded-xl p-5 flex flex-col group hover:border-gray-300 transition-colors"
              style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-medium text-gray-500">Facturas total</h3>
                <div className="p-1.5 bg-gray-100 text-gray-600 rounded-md ring-1 ring-gray-900/5">
                  <Receipt size={14} />
                </div>
              </div>
              <span className="text-3xl font-semibold text-gray-900 tracking-tight">{formatCurrency(unpaidInvoiceTotal)}</span>
              <div className="flex items-center mt-2 text-xs text-gray-400">
                <span>{invoices.length} factura{invoices.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </section>
        )}

        {/* ── Alert panel (jefe only) ───────────────────────────── */}
        {userRole === 'jefe' && totalAlerts > 0 && (
          <section className="rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-4"
            style={{ backgroundColor: '#FFFDF7', border: '1px solid #FBECC6', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(251,191,36,0.15)' }}>
              <AlertTriangle size={16} className="text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-gray-900">
                {totalAlerts} {totalAlerts === 1 ? 'alerta requiere' : 'alertas requieren'} atención
              </h4>
              <p className="text-xs text-amber-800 mt-0.5">Revisá las excepciones para mantener los plazos.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {delayedShipments.length > 0 && (
                <Link href="/shipments" className="flex items-center bg-white border rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-amber-50 transition-colors"
                  style={{ borderColor: 'rgba(251,191,36,0.4)', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                  <span className="w-2 h-2 rounded-full bg-red-400 mr-2" />
                  {delayedShipments.length} envío{delayedShipments.length > 1 ? 's' : ''} retrasado{delayedShipments.length > 1 ? 's' : ''}
                </Link>
              )}
              {staleItems.length > 0 && (
                <div className="flex items-center bg-white border rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700"
                  style={{ borderColor: 'rgba(251,191,36,0.4)', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                  <Clock size={10} className="text-amber-500 mr-2" />
                  {staleItems.length} ítem{staleItems.length > 1 ? 's' : ''} estancado{staleItems.length > 1 ? 's' : ''}
                </div>
              )}
              {expiringDocs.length > 0 && (
                <Link href="/suppliers" className="flex items-center bg-white border rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-amber-50 transition-colors"
                  style={{ borderColor: 'rgba(251,191,36,0.4)', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                  <FileWarning size={10} className="text-orange-500 mr-2" />
                  {expiringDocs.length} doc{expiringDocs.length > 1 ? 's' : ''} por vencer
                </Link>
              )}
              {negativeMarginItems.length > 0 && (
                <div className="flex items-center bg-white border rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700"
                  style={{ borderColor: 'rgba(251,191,36,0.4)', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                  <TrendingDown size={10} className="text-red-500 mr-2" />
                  {negativeMarginItems.length} margen negativo
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Per-person progress (jefe only) ───────────────────── */}
        {userRole === 'jefe' && operadoras.length > 0 && (
          <section className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {operadoras.map(op => (
              <div key={op.id} className="bg-white border border-[#EAEAEA] rounded-xl p-4"
                style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700">
                    {getInitials(op.name)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{op.name}</p>
                    <p className="text-xs text-gray-400">{op.items} ítems asignados</p>
                  </div>
                </div>
                {op.items > 0 ? (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-green-500 transition-all"
                        style={{ width: `${Math.round((op.done / op.items) * 100)}%` }} />
                    </div>
                    <span className="text-xs text-gray-500 w-10 text-right">{op.done}/{op.items}</span>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">Sin ítems asignados</p>
                )}
              </div>
            ))}
          </section>
        )}

        {/* ── Recent activity (jefe only) ───────────────────────── */}
        {userRole === 'jefe' && activities.length > 0 && (
          <section className="bg-white border border-[#EAEAEA] rounded-xl"
            style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#EAEAEA]">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Actividad reciente</h2>
              <Link href="/activity" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1">
                Ver todo <ChevronRight size={12} />
              </Link>
            </div>
            <div className="divide-y divide-[#EAEAEA]">
              {activities.slice(0, 5).map(entry => (
                <div key={entry.id} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-gray-50/60 transition-colors">
                  <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500 shrink-0">
                    {getInitials(entry.profiles?.name || '??')}
                  </div>
                  <span className="text-gray-700 truncate flex-1">
                    <span className="font-medium">{entry.profiles?.name || 'Usuario'}</span>{' '}
                    <span className="text-gray-500">{ACTION_LABELS[entry.action] || entry.action}</span>
                  </span>
                  <span className="text-xs text-gray-400 shrink-0">{timeAgo(entry.created_at)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Contract list ─────────────────────────────────────── */}
        {contracts.length > 0 && (
          <section>
            {/* Tab filter */}
            <div className="flex items-center justify-between border-b border-[#EAEAEA] mb-0">
              <div className="flex space-x-6 text-sm font-medium text-gray-500">
                {([['active', 'Activos'], ['completed', 'Completados'], ['all', 'Todos']] as const).map(([key, label]) => (
                  <button key={key} onClick={() => setFilter(key)}
                    className={`pb-3 border-b-2 whitespace-nowrap transition-all ${
                      filter === key
                        ? 'border-gray-900 text-gray-900'
                        : 'border-transparent hover:text-gray-900 hover:border-gray-300'
                    }`}>
                    {label}
                    <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] ${filter === key ? 'bg-gray-100 text-gray-600' : 'text-gray-400'}`}>
                      {counts[key]}
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 pb-3">
                <button className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors">
                  <Filter size={14} />
                </button>
                <button className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors">
                  <ArrowUpDown size={14} />
                </button>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="bg-white border border-[#EAEAEA] rounded-xl text-center py-16 text-gray-400">
                <p className="text-base">
                  {search ? `Sin resultados para "${search}"` : 'No hay contratos en esta categoría.'}
                </p>
                {userRole === 'jefe' && filter === 'active' && !search && (
                  <p className="text-sm mt-1">
                    Creá el primero con <Link href="/contracts/new" className="underline hover:text-gray-600">Nuevo Contrato</Link>.
                  </p>
                )}
              </div>
            ) : (
              <div className="bg-white border border-[#EAEAEA] rounded-xl overflow-hidden"
                style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                <table className="w-full text-sm text-left border-collapse min-w-[700px]">
                  <thead>
                    <tr className="border-b border-[#EAEAEA]" style={{ backgroundColor: 'rgba(249,250,251,0.5)' }}>
                      <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Contrato</th>
                      <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Entidad</th>
                      <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Empresa</th>
                      <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                      <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Responsable</th>
                      <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-40">Progreso</th>
                      <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EAEAEA]">
                    {filtered.map(contract => (
                      <tr key={contract.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="px-6 py-4">
                          <Link href={`/dashboard/${contract.id}`}
                            className="font-medium text-gray-900 hover:underline underline-offset-2 decoration-gray-300 decoration-2">
                            {contract.name}
                          </Link>
                          <p className="text-xs text-gray-400 mt-0.5">{CONTRACT_TYPE_LABELS[contract.type]}</p>
                        </td>
                        <td className="px-6 py-4 text-gray-600">{contract.entity}</td>
                        <td className="px-6 py-4 text-gray-600">{contract.organizations?.name ?? '—'}</td>
                        <td className="px-6 py-4 text-gray-600 text-xs">{CONTRACT_TYPE_LABELS[contract.type]}</td>
                        <td className="px-6 py-4">
                          {contract.profiles?.name ? (
                            <div className="flex items-center gap-2">
                              <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[9px] font-bold text-gray-500 shrink-0">
                                {getInitials(contract.profiles.name)}
                              </div>
                              <span className="text-gray-600 text-xs">{contract.profiles.name}</span>
                            </div>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-6 py-4"><ProgressBar items={contract.items} /></td>
                        <td className="px-6 py-4"><StatusPill status={contract.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
