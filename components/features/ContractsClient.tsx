'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils/format'

// ── Types ──────────────────────────────────────────────────────
type Contract = {
  id: string
  name: string
  entity: string
  type: 'supply' | 'construction' | 'sale' | 'service' | 'logistics' | 'mixed'
  status: 'draft' | 'active' | 'completed' | 'settled' | 'cancelled'
  start_date: string | null
  end_date: string | null
  created_at: string
  contracting_entities: { id: string; name: string } | null
  profiles: { name: string } | null
  items: { id: string }[]
}

type Entity = {
  id: string
  name: string
}

type Props = {
  contracts: Contract[]
  entities: Entity[]
  userRole: string
}

// ── Constants ──────────────────────────────────────────────────
const TYPE_LABELS: Record<string, string> = {
  supply: 'Suministro',
  construction: 'Obra',
  sale: 'Compraventa',
  service: 'Servicios',
  logistics: 'Logística',
  mixed: 'Mixto',
}

const TYPE_COLORS: Record<string, string> = {
  supply: 'bg-blue-50 text-blue-700',
  construction: 'bg-orange-50 text-orange-700',
  sale: 'bg-green-50 text-green-700',
  service: 'bg-purple-50 text-purple-700',
  logistics: 'bg-cyan-50 text-cyan-700',
  mixed: 'bg-gray-100 text-gray-700',
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  active: 'Activo',
  completed: 'Terminado',
  settled: 'Liquidado',
  cancelled: 'Cancelado',
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  active: 'bg-green-50 text-green-700',
  completed: 'bg-blue-50 text-blue-700',
  settled: 'bg-indigo-50 text-indigo-700',
  cancelled: 'bg-red-50 text-red-700',
}

// ── Helpers ────────────────────────────────────────────────────
function daysRemaining(endDate: string | null): number | null {
  if (!endDate) return null
  const end = new Date(endDate + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

// ── Component ──────────────────────────────────────────────────
export default function ContractsClient({ contracts, entities, userRole }: Props) {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterEntity, setFilterEntity] = useState('')

  const filtered = useMemo(() => {
    let result = contracts
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.contracting_entities?.name || c.entity).toLowerCase().includes(q)
      )
    }
    if (filterStatus) result = result.filter(c => c.status === filterStatus)
    if (filterType) result = result.filter(c => c.type === filterType)
    if (filterEntity) result = result.filter(c => c.contracting_entities?.id === filterEntity)
    return result
  }, [contracts, search, filterStatus, filterType, filterEntity])

  const hasFilters = search || filterStatus || filterType || filterEntity

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contratos</h1>
          <p className="text-gray-500 text-sm mt-1">
            {contracts.length} contrato{contracts.length !== 1 ? 's' : ''} en total
          </p>
        </div>
        <Link
          href="/contracts/new"
          className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
        >
          + Nuevo contrato
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input
          type="text"
          placeholder="Buscar por nombre o entidad..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 w-72"
        />
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">Todos los estados</option>
          <option value="draft">Borrador</option>
          <option value="active">Activo</option>
          <option value="completed">Terminado</option>
          <option value="settled">Liquidado</option>
          <option value="cancelled">Cancelado</option>
        </select>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">Todos los tipos</option>
          <option value="supply">Suministro</option>
          <option value="construction">Obra</option>
          <option value="sale">Compraventa</option>
          <option value="service">Servicios</option>
          <option value="logistics">Logística</option>
          <option value="mixed">Mixto</option>
        </select>
        <select
          value={filterEntity}
          onChange={e => setFilterEntity(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">Todas las entidades</option>
          {entities.map(e => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setFilterStatus(''); setFilterType(''); setFilterEntity('') }}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-12 text-center">
          {hasFilters ? (
            <p className="text-gray-400 text-lg">No hay contratos con esos filtros</p>
          ) : (
            <>
              <p className="text-gray-500 text-lg mb-1">No hay contratos registrados.</p>
              <p className="text-gray-400 text-sm mb-4">Crea tu primer contrato para empezar.</p>
              <Link
                href="/contracts/new"
                className="inline-block bg-gray-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
              >
                + Crear primer contrato
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Nombre</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Entidad</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Tipo</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Estado</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Inicio</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Fin</th>
                <th className="text-center px-5 py-3 font-medium text-gray-600">Días rest.</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Asignado a</th>
                <th className="text-center px-5 py-3 font-medium text-gray-600">Ítems</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(contract => {
                const days = contract.status === 'active' ? daysRemaining(contract.end_date) : null
                const entityName = contract.contracting_entities?.name || contract.entity

                return (
                  <tr key={contract.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4">
                      <Link
                        href={`/dashboard/${contract.id}`}
                        className="font-medium text-gray-900 hover:underline"
                      >
                        {contract.name}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-gray-600">{entityName}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-block text-xs font-medium px-2 py-1 rounded-full ${TYPE_COLORS[contract.type] || 'bg-gray-100 text-gray-700'}`}>
                        {TYPE_LABELS[contract.type] || contract.type}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-block text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLORS[contract.status]}`}>
                        {STATUS_LABELS[contract.status]}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-600">{formatDate(contract.start_date)}</td>
                    <td className="px-5 py-4 text-gray-600">{formatDate(contract.end_date)}</td>
                    <td className="px-5 py-4 text-center">
                      {days !== null ? (
                        <span className={`font-medium ${days <= 10 ? 'text-red-600' : days <= 30 ? 'text-amber-600' : 'text-gray-600'}`}>
                          {days <= 0 ? 'Vencido' : `${days}d`}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-gray-600">
                      {contract.profiles?.name || '—'}
                    </td>
                    <td className="px-5 py-4 text-center text-gray-600">
                      {contract.items?.length || 0}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
