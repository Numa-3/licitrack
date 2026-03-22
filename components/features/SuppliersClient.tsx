'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

// ── Types ──────────────────────────────────────────────────────
type SupplierDoc = {
  type: string
  verified: boolean
  expires_at: string | null
}

type Supplier = {
  id: string
  name: string
  type: 'vendor' | 'service_provider' | 'both'
  whatsapp: string | null
  email: string | null
  city: string
  has_rut: boolean
  has_chamber_cert: boolean
  iva_exempt: boolean
  bbva_registered: boolean
  trusted: boolean
  notes: string
  created_at: string
  deleted_at: string | null
  supplier_documents: SupplierDoc[]
}

type Props = {
  suppliers: Supplier[]
  userRole: string
  currentUserId: string
}

// ── Constants ──────────────────────────────────────────────────
const TYPE_LABELS: Record<string, string> = {
  vendor: 'Proveedor',
  service_provider: 'Prestador',
  both: 'Ambos',
}

const TYPE_COLORS: Record<string, string> = {
  vendor: 'bg-blue-50 text-blue-700',
  service_provider: 'bg-purple-50 text-purple-700',
  both: 'bg-gray-100 text-gray-700',
}

// ── Component ──────────────────────────────────────────────────
export default function SuppliersClient({ suppliers: initialSuppliers, userRole, currentUserId }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [suppliers, setSuppliers] = useState(initialSuppliers)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterCity, setFilterCity] = useState('')
  const [filterVerified, setFilterVerified] = useState(false)
  const [filterPendingDocs, setFilterPendingDocs] = useState(false)

  // New supplier modal
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState({
    name: '', type: 'vendor' as 'vendor' | 'service_provider' | 'both',
    whatsapp: '', email: '', city: '', notes: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Unique cities for filter
  const cities = useMemo(() => {
    const set = new Set(suppliers.map(s => s.city).filter(Boolean))
    return Array.from(set).sort()
  }, [suppliers])

  // Filter logic
  const filtered = useMemo(() => {
    let result = suppliers
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(s => s.name.toLowerCase().includes(q))
    }
    if (filterType) result = result.filter(s => s.type === filterType)
    if (filterCity) result = result.filter(s => s.city === filterCity)
    if (filterVerified) result = result.filter(s => s.trusted)
    if (filterPendingDocs) {
      result = result.filter(s => {
        const docs = s.supplier_documents || []
        const hasRut = docs.some(d => d.type === 'rut')
        const hasChamber = docs.some(d => d.type === 'chamber_cert')
        return !hasRut || !hasChamber || !s.bbva_registered
      })
    }
    return result
  }, [suppliers, search, filterType, filterCity, filterVerified, filterPendingDocs])

  function getBadge(ok: boolean): string {
    return ok ? 'text-green-600' : 'text-gray-300'
  }

  async function handleCreate() {
    if (!newForm.name.trim()) return
    setLoading(true)
    setError(null)

    const { data, error: err } = await supabase
      .from('suppliers')
      .insert({
        name: newForm.name.trim(),
        type: newForm.type,
        whatsapp: newForm.whatsapp.trim() || null,
        email: newForm.email.trim() || null,
        city: newForm.city.trim(),
        notes: newForm.notes.trim(),
      })
      .select()
      .single()

    if (err) { setError(err.message); setLoading(false); return }

    // Add to local state with empty docs
    setSuppliers(prev => [{ ...data, supplier_documents: [] } as Supplier, ...prev])
    setShowNew(false)
    setNewForm({ name: '', type: 'vendor', whatsapp: '', email: '', city: '', notes: '' })
    setLoading(false)
    router.refresh()
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Proveedores</h1>
          <p className="text-gray-500 text-sm mt-1">{suppliers.length} proveedor{suppliers.length !== 1 ? 'es' : ''} registrado{suppliers.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
          + Nuevo proveedor
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input type="text" placeholder="Buscar por nombre..." value={search} onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 w-64" />
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
          <option value="">Todos los tipos</option>
          <option value="vendor">Proveedor</option>
          <option value="service_provider">Prestador</option>
          <option value="both">Ambos</option>
        </select>
        <select value={filterCity} onChange={e => setFilterCity(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
          <option value="">Todas las ciudades</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={filterVerified} onChange={e => setFilterVerified(e.target.checked)}
            className="rounded border-gray-300" />
          Solo confiables
        </label>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={filterPendingDocs} onChange={e => setFilterPendingDocs(e.target.checked)}
            className="rounded border-gray-300" />
          Docs pendientes
        </label>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-lg">{error}</div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-12 text-center">
          <p className="text-gray-400 text-lg">No hay proveedores{search || filterType || filterCity ? ' con esos filtros' : ''}</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Nombre</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Tipo</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Ciudad</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">WhatsApp</th>
                <th className="text-center px-5 py-3 font-medium text-gray-600">RUT</th>
                <th className="text-center px-5 py-3 font-medium text-gray-600">Cámara</th>
                <th className="text-center px-5 py-3 font-medium text-gray-600">BBVA</th>
                <th className="text-center px-5 py-3 font-medium text-gray-600">Confiable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(supplier => {
                const docs = supplier.supplier_documents || []
                const rutDoc = docs.find(d => d.type === 'rut')
                const chamberDoc = docs.find(d => d.type === 'chamber_cert')
                const rutOk = !!(rutDoc && rutDoc.verified)
                const chamberOk = !!(chamberDoc && chamberDoc.verified)

                return (
                  <tr key={supplier.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4">
                      <Link href={`/suppliers/${supplier.id}`} className="font-medium text-gray-900 hover:underline">
                        {supplier.name}
                      </Link>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-block text-xs font-medium px-2 py-1 rounded-full ${TYPE_COLORS[supplier.type]}`}>
                        {TYPE_LABELS[supplier.type]}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-600">{supplier.city || '—'}</td>
                    <td className="px-5 py-4 text-gray-600">{supplier.whatsapp || '—'}</td>
                    <td className="px-5 py-4 text-center">
                      <span className={`text-lg ${getBadge(rutOk)}`} title={rutOk ? 'RUT verificado' : rutDoc ? 'RUT sin verificar' : 'Sin RUT'}>
                        {rutOk ? '✓' : rutDoc ? '○' : '✗'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={`text-lg ${getBadge(chamberOk)}`} title={chamberOk ? 'Cámara verificada' : chamberDoc ? 'Cámara sin verificar' : 'Sin Cámara'}>
                        {chamberOk ? '✓' : chamberDoc ? '○' : '✗'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={`text-lg ${getBadge(supplier.bbva_registered)}`} title={supplier.bbva_registered ? 'BBVA inscrito' : 'BBVA no inscrito'}>
                        {supplier.bbva_registered ? '✓' : '✗'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={`text-lg ${getBadge(supplier.trusted)}`} title={supplier.trusted ? 'Confiable' : 'No verificado'}>
                        {supplier.trusted ? '✓' : '✗'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* New supplier modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowNew(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Nuevo proveedor</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                <input type="text" value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                  <select value={newForm.type} onChange={e => setNewForm(f => ({ ...f, type: e.target.value as 'vendor' | 'service_provider' | 'both' }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
                    <option value="vendor">Proveedor</option>
                    <option value="service_provider">Prestador de servicio</option>
                    <option value="both">Ambos</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad</label>
                  <input type="text" value={newForm.city} onChange={e => setNewForm(f => ({ ...f, city: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
                  <input type="text" value={newForm.whatsapp} onChange={e => setNewForm(f => ({ ...f, whatsapp: e.target.value }))}
                    placeholder="573001234567"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" value={newForm.email} onChange={e => setNewForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                <textarea value={newForm.notes} onChange={e => setNewForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none" />
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowNew(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button onClick={handleCreate} disabled={!newForm.name.trim() || loading}
                  className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
                  {loading ? 'Guardando...' : 'Crear proveedor'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
