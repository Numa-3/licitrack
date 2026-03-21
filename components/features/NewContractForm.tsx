'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Organization = { id: string; name: string }
type Profile = { id: string; name: string; role: string }

type Props = {
  organizations: Organization[]
  profiles: Profile[]
  currentUserId: string
}

const CONTRACT_TYPES = [
  { value: 'purchase', label: 'Compras', icon: '🛒', description: 'Adquisición de bienes' },
  { value: 'logistics', label: 'Logística', icon: '🚚', description: 'Coordinación de eventos y transporte' },
  { value: 'service', label: 'Servicios', icon: '🔧', description: 'Prestación de servicios' },
  { value: 'mixed', label: 'Mixto', icon: '📦', description: 'Combinación de tipos' },
]

export default function NewContractForm({ organizations, profiles, currentUserId }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [form, setForm] = useState({
    name: '',
    entity: '',
    organization_id: '',
    type: '',
    assigned_to: currentUserId,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.type) {
      setError('Seleccioná el tipo de contrato.')
      return
    }
    if (!form.organization_id) {
      setError('Seleccioná una empresa.')
      return
    }

    setLoading(true)
    setError(null)

    const { data, error } = await supabase
      .from('contracts')
      .insert({
        name: form.name,
        entity: form.entity,
        organization_id: form.organization_id,
        type: form.type,
        status: 'draft',
        created_by: currentUserId,
        assigned_to: form.assigned_to || null,
      })
      .select('id')
      .single()

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push(`/dashboard/${data.id}`)
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Nuevo Contrato</h1>
        <p className="text-gray-500 text-sm mt-1">Completá los datos básicos del contrato.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Nombre */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nombre del contrato
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
            placeholder="Ej: Suministro materiales de oficina — ANLA 2026"
          />
        </div>

        {/* Entidad */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Entidad contratante
          </label>
          <input
            type="text"
            value={form.entity}
            onChange={(e) => setForm({ ...form, entity: e.target.value })}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
            placeholder="Ej: ANLA, Gobernación del Amazonas"
          />
        </div>

        {/* Empresa */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Empresa (contratante)
          </label>
          {organizations.length === 0 ? (
            <p className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
              No hay empresas registradas.{' '}
              <a href="/organizations" className="underline font-medium">
                Creá una primero.
              </a>
            </p>
          ) : (
            <select
              value={form.organization_id}
              onChange={(e) => setForm({ ...form, organization_id: e.target.value })}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="">Seleccioná una empresa...</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Tipo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tipo de contrato
          </label>
          <div className="grid grid-cols-2 gap-3">
            {CONTRACT_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setForm({ ...form, type: t.value })}
                className={`flex items-start gap-3 p-3 border rounded-lg text-left transition-colors ${
                  form.type === t.value
                    ? 'border-gray-900 bg-gray-50'
                    : 'border-gray-200 hover:border-gray-400'
                }`}
              >
                <span className="text-xl mt-0.5">{t.icon}</span>
                <div>
                  <p className="text-sm font-medium text-gray-900">{t.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Asignar a */}
        {profiles.length > 1 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Asignar a
            </label>
            <select
              value={form.assigned_to}
              onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.role})
                </option>
              ))}
            </select>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-5 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading || organizations.length === 0}
            className="flex-1 bg-gray-900 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Creando...' : 'Crear contrato'}
          </button>
        </div>
      </form>
    </div>
  )
}
