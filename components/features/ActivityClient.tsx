'use client'

import { useState, useMemo } from 'react'

// ── Types ──────────────────────────────────────────────────────
type Profile = { id: string; name: string; role: string }
type Contract = { id: string; name: string }

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

type Props = {
  activities: ActivityEntry[]
  profiles: Profile[]
  contracts: Contract[]
}

// ── Constants ──────────────────────────────────────────────────
const ACTION_LABELS: Record<string, string> = {
  status_changed: 'cambió estado',
  payment_status_changed: 'cambió estado de pago',
  supplier_assigned: 'asignó proveedor',
  assigned_to_changed: 'reasignó responsable',
  item_updated: 'editó ítem',
  items_batch_status: 'cambio masivo de estado',
  items_batch_supplier: 'asignación masiva de proveedor',
  items_batch_assign: 'asignación masiva de responsable',
  shipment_created: 'creó envío',
  invoice_uploaded: 'subió factura',
}

const ENTITY_LABELS: Record<string, string> = {
  item: 'ítem',
  contract: 'contrato',
  shipment: 'envío',
  invoice: 'factura',
  supplier: 'proveedor',
}

// ── Helpers ────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'justo ahora'
  if (diffMin < 60) return `hace ${diffMin} min`
  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return `hace ${diffHrs}h`
  const diffDays = Math.floor(diffHrs / 24)
  if (diffDays === 1) return 'ayer'
  if (diffDays < 7) return `hace ${diffDays} días`
  return new Date(dateStr).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()
}

function buildDescription(entry: ActivityEntry): string {
  const userName = entry.profiles?.name || 'Usuario'
  const action = ACTION_LABELS[entry.action] || entry.action
  const entity = ENTITY_LABELS[entry.entity_type] || entry.entity_type
  const details = entry.details || {}

  let extra = ''
  if (entry.action === 'status_changed' && details.new_value) {
    extra = ` a "${details.new_value}"`
  } else if (entry.action === 'supplier_assigned' && details.supplier_name) {
    extra = ` "${details.supplier_name}"`
  } else if (entry.action === 'payment_status_changed' && details.new_value) {
    extra = ` a "${details.new_value}"`
  } else if (entry.action === 'assigned_to_changed' && details.new_name) {
    extra = ` a ${details.new_name}`
  } else if (details.item_count) {
    extra = ` (${details.item_count} ítems)`
  }

  return `${userName} ${action} ${entity}${extra}`
}

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-green-100 text-green-700',
  'bg-purple-100 text-purple-700',
  'bg-amber-100 text-amber-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
]

function avatarColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

// ── Component ──────────────────────────────────────────────────
export default function ActivityClient({ activities, profiles, contracts }: Props) {
  const [filterUser, setFilterUser] = useState('')
  const [filterContract, setFilterContract] = useState('')

  const filtered = useMemo(() => {
    let result = activities
    if (filterUser) result = result.filter(a => a.user_id === filterUser)
    if (filterContract) {
      result = result.filter(a => {
        const d = a.details as Record<string, unknown>
        return d.contract_id === filterContract || a.entity_id === filterContract
      })
    }
    return result
  }, [activities, filterUser, filterContract])

  // Group by date
  const grouped = useMemo(() => {
    const groups: { date: string; label: string; entries: ActivityEntry[] }[] = []
    const today = new Date().toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

    for (const entry of filtered) {
      const date = entry.created_at.split('T')[0]
      let label = new Date(date + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
      if (date === today) label = 'Hoy'
      else if (date === yesterday) label = 'Ayer'

      const last = groups[groups.length - 1]
      if (last && last.date === date) {
        last.entries.push(entry)
      } else {
        groups.push({ date, label, entries: [entry] })
      }
    }
    return groups
  }, [filtered])

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Feed de Actividad</h1>
          <p className="text-gray-500 text-sm mt-1">Todas las acciones del equipo</p>
        </div>
        <div className="flex gap-3">
          <select value={filterUser} onChange={e => setFilterUser(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
            <option value="">Todos los usuarios</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={filterContract} onChange={e => setFilterContract(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
            <option value="">Todos los contratos</option>
            {contracts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-12 text-center">
          <p className="text-gray-400 text-lg">No hay actividad registrada</p>
          <p className="text-gray-400 text-sm mt-1">Las acciones del equipo aparecerán aquí.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(group => (
            <div key={group.date}>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 capitalize">{group.label}</h2>
              <div className="space-y-1">
                {group.entries.map(entry => (
                  <div key={entry.id} className="flex items-start gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
                    {/* Avatar */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${avatarColor(entry.user_id)}`}>
                      {getInitials(entry.profiles?.name || '??')}
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">{buildDescription(entry)}</p>
                      {entry.details && typeof (entry.details as Record<string, unknown>).item_name === 'string' && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">
                          {(entry.details as Record<string, string>).item_name}
                        </p>
                      )}
                    </div>
                    {/* Timestamp */}
                    <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">{timeAgo(entry.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
