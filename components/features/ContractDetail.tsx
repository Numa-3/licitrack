'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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
  short_name: string
  status: string
  payment_status: string
}

type Props = {
  contract: Contract
  items: Item[]
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

const FINAL_STATUSES = new Set(['completed', 'done', 'listo', 'finalizado'])

export default function ContractDetail({ contract: initial, items, userRole }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [contract, setContract] = useState(initial)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editForm, setEditForm] = useState({
    name: initial.name,
    entity: initial.entity,
    type: initial.type,
  })
  const [loadingEdit, setLoadingEdit] = useState(false)
  const [loadingArchive, setLoadingArchive] = useState(false)
  const [loadingComplete, setLoadingComplete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isJefe = userRole === 'jefe'
  const isActive = contract.status === 'active' || contract.status === 'draft'

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    setLoadingEdit(true)
    setError(null)

    const { data, error } = await supabase
      .from('contracts')
      .update({
        name: editForm.name,
        entity: editForm.entity,
        type: editForm.type,
      })
      .eq('id', contract.id)
      .select(`
        id, name, entity, type, status, created_at, updated_at,
        organizations ( name ),
        created_by_profile:profiles!contracts_created_by_fkey ( name ),
        assigned_to_profile:profiles!contracts_assigned_to_fkey ( name )
      `)
      .single()

    if (error) {
      setError(error.message)
    } else {
      setContract(data as unknown as Contract)
      setShowEditModal(false)
    }
    setLoadingEdit(false)
  }

  async function handleArchive() {
    if (!confirm('¿Archivar este contrato? Quedará inactivo pero no se eliminará.')) return
    setLoadingArchive(true)
    setError(null)

    const { error } = await supabase
      .from('contracts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', contract.id)

    if (error) {
      setError(error.message)
    } else {
      router.push('/dashboard')
    }
    setLoadingArchive(false)
  }

  async function handleComplete() {
    // Validate all items are in a final status
    const pending = items.filter((i) => !FINAL_STATUSES.has(i.status))
    if (pending.length > 0) {
      setError(
        `Hay ${pending.length} ${pending.length === 1 ? 'ítem' : 'ítems'} sin completar. Finalizalos antes de cerrar el contrato.`
      )
      return
    }

    if (!confirm('¿Marcar este contrato como completado?')) return
    setLoadingComplete(true)
    setError(null)

    const { data, error } = await supabase
      .from('contracts')
      .update({ status: 'completed' })
      .eq('id', contract.id)
      .select(`
        id, name, entity, type, status, created_at, updated_at,
        organizations ( name ),
        created_by_profile:profiles!contracts_created_by_fkey ( name ),
        assigned_to_profile:profiles!contracts_assigned_to_fkey ( name )
      `)
      .single()

    if (error) {
      setError(error.message)
    } else {
      setContract(data as unknown as Contract)
    }
    setLoadingComplete(false)
  }

  const statusColor: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    active: 'bg-blue-50 text-blue-700',
    completed: 'bg-green-50 text-green-700',
    cancelled: 'bg-red-50 text-red-600',
  }

  const statusLabel: Record<string, string> = {
    draft: 'Borrador',
    active: 'Activo',
    completed: 'Completado',
    cancelled: 'Cancelado',
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">{CONTRACT_TYPE_ICONS[contract.type]}</span>
            <h1 className="text-2xl font-bold text-gray-900">{contract.name}</h1>
            <span
              className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColor[contract.status]}`}
            >
              {statusLabel[contract.status]}
            </span>
          </div>
          <p className="text-gray-500 text-sm">
            {contract.entity} · {contract.organizations?.name ?? '—'}
          </p>
        </div>

        {/* Action buttons */}
        {isJefe && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEditForm({ name: contract.name, entity: contract.entity, type: contract.type })
                setError(null)
                setShowEditModal(true)
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Editar
            </button>
            {isActive && (
              <button
                onClick={handleComplete}
                disabled={loadingComplete}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {loadingComplete ? 'Procesando...' : 'Completar contrato'}
              </button>
            )}
            {isActive && (
              <button
                onClick={handleArchive}
                disabled={loadingArchive}
                className="px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                {loadingArchive ? 'Archivando...' : 'Archivar'}
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-6 text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Info cards */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
            Información del contrato
          </h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Tipo</dt>
              <dd className="text-gray-900 font-medium">
                {CONTRACT_TYPE_ICONS[contract.type]} {CONTRACT_TYPE_LABELS[contract.type]}
              </dd>
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
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
            Equipo
          </h2>
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
              <dd className="text-gray-500">
                {new Date(contract.created_at).toLocaleDateString('es-CO', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Items section (placeholder) */}
      <div className="bg-white border border-gray-200 rounded-xl">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">
            Ítems{' '}
            <span className="ml-1 text-sm font-normal text-gray-400">({items.length})</span>
          </h2>
        </div>
        {items.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400">
            <p>No hay ítems en este contrato.</p>
            <p className="text-sm mt-1">Los ítems se agregan en el próximo módulo.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Ítem</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Estado</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Pago</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 text-gray-900">{item.short_name}</td>
                  <td className="px-5 py-3 text-gray-600 capitalize">{item.status}</td>
                  <td className="px-5 py-3 text-gray-600 capitalize">{item.payment_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Editar contrato</h2>
            </div>

            <form onSubmit={handleEdit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre del contrato
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Entidad contratante
                </label>
                <input
                  type="text"
                  value={editForm.entity}
                  onChange={(e) => setEditForm({ ...editForm, entity: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo
                </label>
                <select
                  value={editForm.type}
                  onChange={(e) =>
                    setEditForm({ ...editForm, type: e.target.value as typeof editForm.type })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="purchase">🛒 Compras</option>
                  <option value="logistics">🚚 Logística</option>
                  <option value="service">🔧 Servicios</option>
                  <option value="mixed">📦 Mixto</option>
                </select>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loadingEdit}
                  className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  {loadingEdit ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
