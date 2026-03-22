'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

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
  type: 'purchase' | 'logistics' | 'service' | 'mixed'
  status: 'draft' | 'active' | 'completed' | 'cancelled'
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
  purchase: 'Compras', logistics: 'Logística', service: 'Servicios', mixed: 'Mixto',
}
const CONTRACT_TYPE_ICONS: Record<string, string> = {
  purchase: '🛒', logistics: '🚚', service: '🔧', mixed: '📦',
}
const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador', active: 'Activo', completed: 'Completado', cancelled: 'Cancelado',
}
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', active: 'bg-blue-50 text-blue-700',
  completed: 'bg-green-50 text-green-700', cancelled: 'bg-red-50 text-red-600',
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

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)
}

function ProgressBar({ items }: { items: { status: string }[] }) {
  if (items.length === 0) return <span className="text-xs text-gray-400">Sin ítems</span>
  const done = items.filter(i => DONE_STATUSES.has(i.status)).length
  const pct = Math.round((done / items.length) * 100)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-gray-900 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-14 text-right">{done}/{items.length}</span>
    </div>
  )
}

type FilterTab = 'all' | 'active' | 'completed'

// ── Component ──────────────────────────────────────────────────
export default function DashboardClient({ contracts, items, shipments, invoices, activities, profiles, supplierDocs, userRole }: Props) {
  const [filter, setFilter] = useState<FilterTab>('active')

  const filtered = contracts.filter(c => {
    if (filter === 'active') return c.status === 'active' || c.status === 'draft'
    if (filter === 'completed') return c.status === 'completed' || c.status === 'cancelled'
    return true
  })

  const counts = {
    active: contracts.filter(c => c.status === 'active' || c.status === 'draft').length,
    completed: contracts.filter(c => c.status === 'completed' || c.status === 'cancelled').length,
    all: contracts.length,
  }

  // ── Metrics ────────────────────────────────────────────────
  const activeContracts = contracts.filter(c => c.status === 'active').length
  const pendingItems = items.filter(i => i.status === 'pending').length
  const shipmentsInTransit = shipments.filter(s => !s.actual_arrival).length
  const unpaidInvoiceTotal = useMemo(() => {
    // All invoices loaded are unpaid (filtered server-side or we sum all)
    return invoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0)
  }, [invoices])

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
    const ops = profiles.filter(p => p.role === 'operadora')
    return ops.map(op => {
      const opItems = items.filter(i => i.assigned_to === op.id)
      const done = opItems.filter(i => DONE_STATUSES.has(i.status)).length
      return { ...op, items: opItems.length, done, pending: opItems.length - done }
    })
  }, [profiles, items])

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">
            {contracts.length} {contracts.length === 1 ? 'contrato' : 'contratos'} en total
          </p>
        </div>
        {userRole === 'jefe' && (
          <Link href="/contracts/new"
            className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
            + Nuevo Contrato
          </Link>
        )}
      </div>

      {/* ── Empty state for no contracts ─────────────────────── */}
      {contracts.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-16 text-center mb-6">
          {userRole === 'jefe' ? (
            <>
              <p className="text-gray-500 text-lg mb-1">No tenés contratos aún.</p>
              <p className="text-gray-400 text-sm mb-4">Creá tu primer contrato para empezar a gestionar licitaciones.</p>
              <Link href="/contracts/new"
                className="inline-block bg-gray-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
                + Crear primer contrato
              </Link>
            </>
          ) : (
            <>
              <p className="text-gray-500 text-lg mb-1">No tenés ítems asignados aún.</p>
              <p className="text-gray-400 text-sm">Brandon te asignará tareas pronto.</p>
            </>
          )}
        </div>
      )}

      {/* ── Metrics cards ─────────────────────────────────────── */}
      {contracts.length > 0 && <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Contratos activos</p>
          <p className="text-2xl font-bold text-gray-900">{activeContracts}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Ítems pendientes</p>
          <p className="text-2xl font-bold text-gray-900">{pendingItems}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Envíos en camino</p>
          <p className="text-2xl font-bold text-gray-900">{shipmentsInTransit}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Facturas total</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(unpaidInvoiceTotal)}</p>
        </div>
      </div>}

      {/* ── Alerts section (jefe only) ────────────────────────── */}
      {userRole === 'jefe' && totalAlerts > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-amber-800 uppercase tracking-wider mb-3">
            Alertas ({totalAlerts})
          </h2>
          <div className="space-y-2">
            {delayedShipments.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-red-500 shrink-0">!</span>
                <div className="text-sm text-gray-800">
                  <span className="font-medium">{delayedShipments.length} envío{delayedShipments.length > 1 ? 's' : ''} retrasado{delayedShipments.length > 1 ? 's' : ''}</span>
                  <span className="text-gray-500"> — </span>
                  {delayedShipments.slice(0, 3).map((s, i) => (
                    <span key={s.id} className="text-gray-600">
                      {i > 0 && ', '}{s.origin_city || '?'} ({s.contracts?.name || '—'})
                    </span>
                  ))}
                  {delayedShipments.length > 3 && <span className="text-gray-400"> y {delayedShipments.length - 3} más</span>}
                </div>
              </div>
            )}
            {staleItems.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-amber-500 shrink-0">!</span>
                <p className="text-sm text-gray-800">
                  <span className="font-medium">{staleItems.length} ítem{staleItems.length > 1 ? 's' : ''} estancado{staleItems.length > 1 ? 's' : ''}</span>
                  <span className="text-gray-500"> — más de 5 días sin cambiar de estado</span>
                </p>
              </div>
            )}
            {expiringDocs.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-orange-500 shrink-0">!</span>
                <div className="text-sm text-gray-800">
                  <span className="font-medium">{expiringDocs.length} documento{expiringDocs.length > 1 ? 's' : ''} por vencer</span>
                  <span className="text-gray-500"> — </span>
                  {expiringDocs.slice(0, 3).map((d, i) => (
                    <span key={d.id} className="text-gray-600">
                      {i > 0 && ', '}{d.suppliers?.name || '?'} ({d.type})
                    </span>
                  ))}
                </div>
              </div>
            )}
            {negativeMarginItems.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-red-600 shrink-0">!</span>
                <p className="text-sm text-gray-800">
                  <span className="font-medium">{negativeMarginItems.length} ítem{negativeMarginItems.length > 1 ? 's' : ''} con margen negativo</span>
                  <span className="text-gray-500"> — </span>
                  {negativeMarginItems.slice(0, 3).map((item, i) => (
                    <span key={item.id} className="text-gray-600">
                      {i > 0 && ', '}{item.short_name}
                    </span>
                  ))}
                  {negativeMarginItems.length > 3 && <span className="text-gray-400"> y {negativeMarginItems.length - 3} más</span>}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Per-person progress (jefe only) ───────────────────── */}
      {userRole === 'jefe' && operadoras.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {operadoras.map(op => (
            <div key={op.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                  {getInitials(op.name)}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{op.name}</p>
                  <p className="text-xs text-gray-400">{op.items} ítems asignados</p>
                </div>
              </div>
              {op.items > 0 ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${Math.round((op.done / op.items) * 100)}%` }} />
                  </div>
                  <span className="text-xs text-gray-500">{op.done}/{op.items}</span>
                </div>
              ) : (
                <p className="text-xs text-gray-400">Sin ítems asignados</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Last 5 activities (jefe only) ─────────────────────── */}
      {userRole === 'jefe' && activities.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Actividad reciente</h2>
            <Link href="/activity" className="text-xs text-blue-600 hover:underline">Ver todo</Link>
          </div>
          <div className="space-y-2">
            {activities.slice(0, 5).map(entry => (
              <div key={entry.id} className="flex items-center gap-3 text-sm">
                <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500 shrink-0">
                  {getInitials(entry.profiles?.name || '??')}
                </div>
                <span className="text-gray-700 truncate flex-1">
                  <span className="font-medium">{entry.profiles?.name || 'Usuario'}</span>{' '}
                  {ACTION_LABELS[entry.action] || entry.action}
                </span>
                <span className="text-xs text-gray-400 shrink-0">{timeAgo(entry.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Contract list ─────────────────────────────────────── */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {([['active', 'Activos'], ['completed', 'Completados'], ['all', 'Todos']] as const).map(
          ([key, label]) => (
            <button key={key} onClick={() => setFilter(key)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filter === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {label}
              <span className={`ml-1.5 text-xs ${filter === key ? 'text-gray-500' : 'text-gray-400'}`}>
                {counts[key]}
              </span>
            </button>
          )
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">No hay contratos en esta categoría.</p>
          {userRole === 'jefe' && filter === 'active' && (
            <p className="text-sm mt-1">
              Creá el primero con <Link href="/contracts/new" className="underline hover:text-gray-600">Nuevo Contrato</Link>.
            </p>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Contrato</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Entidad</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Empresa</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Tipo</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Responsable</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600 w-48">Progreso</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(contract => (
                <tr key={contract.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4">
                    <Link href={`/dashboard/${contract.id}`} className="font-medium text-gray-900 hover:underline">
                      {contract.name}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-gray-600">{contract.entity}</td>
                  <td className="px-5 py-4 text-gray-600">{contract.organizations?.name ?? '—'}</td>
                  <td className="px-5 py-4">
                    <span className="flex items-center gap-1.5">
                      <span>{CONTRACT_TYPE_ICONS[contract.type]}</span>
                      <span className="text-gray-600">{CONTRACT_TYPE_LABELS[contract.type]}</span>
                    </span>
                  </td>
                  <td className="px-5 py-4 text-gray-600">{contract.profiles?.name ?? '—'}</td>
                  <td className="px-5 py-4"><ProgressBar items={contract.items} /></td>
                  <td className="px-5 py-4">
                    <span className={`inline-block text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLORS[contract.status]}`}>
                      {STATUS_LABELS[contract.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
