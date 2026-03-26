'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

// ── Types ──────────────────────────────────────────────────────
type Entity = {
  id: string
  name: string
  nit: string
  address: string
  city: string
  contact_name: string
  phone: string
  email: string
  notes: string
  created_at: string
  deleted_at: string | null
  entity_documents: { type: string; verified: boolean }[]
}

type Props = {
  entities: Entity[]
  userRole: string
  currentUserId: string
}

// ── Component ──────────────────────────────────────────────────
export default function EntitiesClient({ entities: initialEntities, userRole, currentUserId }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [entities, setEntities] = useState(initialEntities)
  const [search, setSearch] = useState('')
  const [filterCity, setFilterCity] = useState('')

  // New entity modal
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState({
    name: '', nit: '', address: '', city: '', contact_name: '', phone: '', email: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isJefe = userRole === 'jefe'

  // Unique cities for filter
  const cities = useMemo(() => {
    const set = new Set(entities.map(e => e.city).filter(Boolean))
    return Array.from(set).sort()
  }, [entities])

  // Filter logic
  const filtered = useMemo(() => {
    let result = entities
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.nit.toLowerCase().includes(q) ||
        e.city.toLowerCase().includes(q)
      )
    }
    if (filterCity) result = result.filter(e => e.city === filterCity)
    return result
  }, [entities, search, filterCity])

  function getDocBadge(ok: boolean): string {
    return ok ? 'text-green-600' : 'text-gray-300'
  }

  async function handleCreate() {
    if (!newForm.name.trim()) return
    setLoading(true)
    setError(null)

    const { data, error: err } = await supabase
      .from('contracting_entities')
      .insert({
        name: newForm.name.trim(),
        nit: newForm.nit.trim(),
        address: newForm.address.trim(),
        city: newForm.city.trim(),
        contact_name: newForm.contact_name.trim(),
        phone: newForm.phone.trim(),
        email: newForm.email.trim(),
      })
      .select()
      .single()

    if (err) { setError(err.message); setLoading(false); return }

    // Log activity
    await supabase.from('activity_log').insert({
      user_id: currentUserId,
      action: 'created',
      entity_type: 'contracting_entity',
      entity_id: data.id,
      details: { name: data.name },
    })

    setEntities(prev => [{ ...data, entity_documents: [] } as Entity, ...prev])
    setShowNew(false)
    setNewForm({ name: '', nit: '', address: '', city: '', contact_name: '', phone: '', email: '' })
    setLoading(false)
    router.refresh()
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Entidades contratantes</h1>
          <p className="text-gray-500 text-sm mt-1">{entities.length} entidad{entities.length !== 1 ? 'es' : ''} registrada{entities.length !== 1 ? 's' : ''}</p>
        </div>
        {isJefe && (
          <button onClick={() => setShowNew(true)}
            className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
            + Nueva entidad
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input type="text" placeholder="Buscar por nombre, NIT o ciudad..." value={search} onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 w-72" />
        <select value={filterCity} onChange={e => setFilterCity(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
          <option value="">Todas las ciudades</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-lg">{error}</div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-12 text-center">
          {search || filterCity ? (
            <p className="text-gray-400 text-lg">No hay entidades con esos filtros</p>
          ) : (
            <>
              <p className="text-gray-500 text-lg mb-1">No hay entidades registradas.</p>
              <p className="text-gray-400 text-sm mb-4">Agregá tu primera entidad contratante para empezar.</p>
              {isJefe && (
                <button onClick={() => setShowNew(true)}
                  className="inline-block bg-gray-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
                  + Agregar primera entidad
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Nombre</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">NIT</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Ciudad</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Contacto</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Teléfono</th>
                <th className="text-center px-5 py-3 font-medium text-gray-600">RUT</th>
                <th className="text-center px-5 py-3 font-medium text-gray-600">Cámara</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(entity => {
                const docs = entity.entity_documents || []
                const rutDoc = docs.find(d => d.type === 'rut')
                const chamberDoc = docs.find(d => d.type === 'chamber_cert')
                const rutOk = !!(rutDoc && rutDoc.verified)
                const chamberOk = !!(chamberDoc && chamberDoc.verified)

                return (
                  <tr key={entity.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => router.push(`/entities/${entity.id}`)}>
                    <td className="px-5 py-4">
                      <span className="font-medium text-gray-900">
                        {entity.name}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-600">{entity.nit || '—'}</td>
                    <td className="px-5 py-4 text-gray-600">{entity.city || '—'}</td>
                    <td className="px-5 py-4 text-gray-600">{entity.contact_name || '—'}</td>
                    <td className="px-5 py-4 text-gray-600">{entity.phone || '—'}</td>
                    <td className="px-5 py-4 text-center">
                      <span className={`text-lg ${getDocBadge(rutOk)}`} title={rutOk ? 'RUT verificado' : rutDoc ? 'RUT sin verificar' : 'Sin RUT'}>
                        {rutOk ? '✓' : rutDoc ? '○' : '✗'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={`text-lg ${getDocBadge(chamberOk)}`} title={chamberOk ? 'Cámara verificada' : chamberDoc ? 'Cámara sin verificar' : 'Sin Cámara'}>
                        {chamberOk ? '✓' : chamberDoc ? '○' : '✗'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* New entity modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowNew(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Nueva entidad contratante</h2>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                <input type="text" value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ej: SENA, Gobernación del Amazonas"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">NIT</label>
                <input type="text" value={newForm.nit} onChange={e => setNewForm(f => ({ ...f, nit: e.target.value }))}
                  placeholder="Ej: 899.999.034-1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad</label>
                  <input type="text" value={newForm.city} onChange={e => setNewForm(f => ({ ...f, city: e.target.value }))}
                    placeholder="Ej: Leticia"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                  <input type="text" value={newForm.address} onChange={e => setNewForm(f => ({ ...f, address: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de contacto</label>
                <input type="text" value={newForm.contact_name} onChange={e => setNewForm(f => ({ ...f, contact_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                  <input type="text" value={newForm.phone} onChange={e => setNewForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" value={newForm.email} onChange={e => setNewForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button onClick={() => setShowNew(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button onClick={handleCreate} disabled={loading || !newForm.name.trim()}
                className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
                {loading ? 'Creando...' : 'Crear entidad'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
