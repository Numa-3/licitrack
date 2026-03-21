'use client'

import { useState } from 'react'
import Link from 'next/link'

type Item = { status: string }

type Contract = {
  id: string
  name: string
  entity: string
  type: 'purchase' | 'logistics' | 'service' | 'mixed'
  status: 'draft' | 'active' | 'completed' | 'cancelled'
  created_at: string
  organizations: { name: string } | null
  profiles: { name: string } | null
  items: Item[]
}

type Props = {
  contracts: Contract[]
  userRole: string
}

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  purchase: 'Compras',
  logistics: 'Logística',
  service: 'Servicios',
  mixed: 'Mixto',
}

const CONTRACT_TYPE_ICONS: Record<string, string> = {
  purchase: '🛒',
  logistics: '🚚',
  service: '🔧',
  mixed: '📦',
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  active: 'Activo',
  completed: 'Completado',
  cancelled: 'Cancelado',
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  active: 'bg-blue-50 text-blue-700',
  completed: 'bg-green-50 text-green-700',
  cancelled: 'bg-red-50 text-red-600',
}

// Item statuses considered "done" for progress bar
const DONE_STATUSES = new Set(['completed', 'done', 'listo', 'finalizado', 'paid'])

function ProgressBar({ items }: { items: Item[] }) {
  if (items.length === 0) {
    return <span className="text-xs text-gray-400">Sin ítems</span>
  }

  const done = items.filter((i) => DONE_STATUSES.has(i.status)).length
  const pct = Math.round((done / items.length) * 100)

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gray-900 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 w-14 text-right">
        {done}/{items.length}
      </span>
    </div>
  )
}

type FilterTab = 'all' | 'active' | 'completed'

export default function DashboardClient({ contracts, userRole }: Props) {
  const [filter, setFilter] = useState<FilterTab>('active')

  const filtered = contracts.filter((c) => {
    if (filter === 'active') return c.status === 'active' || c.status === 'draft'
    if (filter === 'completed') return c.status === 'completed' || c.status === 'cancelled'
    return true
  })

  const counts = {
    active: contracts.filter((c) => c.status === 'active' || c.status === 'draft').length,
    completed: contracts.filter((c) => c.status === 'completed' || c.status === 'cancelled').length,
    all: contracts.length,
  }

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
          <Link
            href="/contracts/new"
            className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            + Nuevo Contrato
          </Link>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {([['active', 'Activos'], ['completed', 'Completados'], ['all', 'Todos']] as const).map(
          ([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filter === key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
              <span
                className={`ml-1.5 text-xs ${
                  filter === key ? 'text-gray-500' : 'text-gray-400'
                }`}
              >
                {counts[key]}
              </span>
            </button>
          )
        )}
      </div>

      {/* Contract list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">No hay contratos en esta categoría.</p>
          {userRole === 'jefe' && filter === 'active' && (
            <p className="text-sm mt-1">
              Creá el primero con{' '}
              <Link href="/contracts/new" className="underline hover:text-gray-600">
                Nuevo Contrato
              </Link>
              .
            </p>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
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
              {filtered.map((contract) => (
                <tr key={contract.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4">
                    <Link
                      href={`/dashboard/${contract.id}`}
                      className="font-medium text-gray-900 hover:underline"
                    >
                      {contract.name}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-gray-600">{contract.entity}</td>
                  <td className="px-5 py-4 text-gray-600">
                    {contract.organizations?.name ?? '—'}
                  </td>
                  <td className="px-5 py-4">
                    <span className="flex items-center gap-1.5">
                      <span>{CONTRACT_TYPE_ICONS[contract.type]}</span>
                      <span className="text-gray-600">{CONTRACT_TYPE_LABELS[contract.type]}</span>
                    </span>
                  </td>
                  <td className="px-5 py-4 text-gray-600">
                    {contract.profiles?.name ?? '—'}
                  </td>
                  <td className="px-5 py-4">
                    <ProgressBar items={contract.items} />
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-block text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLORS[contract.status]}`}
                    >
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
