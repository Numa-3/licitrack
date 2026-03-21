'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Organization = {
  id: string
  name: string
  nit: string
  invoice_email: string
  notes: string
  rut_url: string | null
  chamber_cert_url: string | null
}

type Props = {
  initialOrgs: Organization[]
}

const emptyForm = {
  name: '',
  nit: '',
  invoice_email: '',
  notes: '',
}

export default function OrganizationsClient({ initialOrgs }: Props) {
  const [orgs, setOrgs] = useState<Organization[]>(initialOrgs)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Organization | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [rutFile, setRutFile] = useState<File | null>(null)
  const [chamberFile, setChamberFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setRutFile(null)
    setChamberFile(null)
    setError(null)
    setShowModal(true)
  }

  function openEdit(org: Organization) {
    setEditing(org)
    setForm({
      name: org.name,
      nit: org.nit,
      invoice_email: org.invoice_email,
      notes: org.notes,
    })
    setRutFile(null)
    setChamberFile(null)
    setError(null)
    setShowModal(true)
  }

  async function uploadFile(file: File, path: string): Promise<string> {
    const { error } = await supabase.storage
      .from('documents')
      .upload(path, file, { upsert: true })
    if (error) throw new Error(`Error subiendo archivo: ${error.message}`)
    const { data } = supabase.storage.from('documents').getPublicUrl(path)
    return data.publicUrl
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      let rutUrl = editing?.rut_url ?? null
      let chamberUrl = editing?.chamber_cert_url ?? null

      const orgId = editing?.id ?? crypto.randomUUID()

      if (rutFile) {
        rutUrl = await uploadFile(rutFile, `rut/${orgId}.pdf`)
      }
      if (chamberFile) {
        chamberUrl = await uploadFile(chamberFile, `chamber/${orgId}.pdf`)
      }

      if (editing) {
        const { data, error } = await supabase
          .from('organizations')
          .update({
            name: form.name,
            nit: form.nit,
            invoice_email: form.invoice_email,
            notes: form.notes,
            rut_url: rutUrl,
            chamber_cert_url: chamberUrl,
          })
          .eq('id', editing.id)
          .select()
          .single()

        if (error) throw new Error(error.message)
        setOrgs((prev) => prev.map((o) => (o.id === editing.id ? data : o)))
      } else {
        const { data, error } = await supabase
          .from('organizations')
          .insert({
            id: orgId,
            name: form.name,
            nit: form.nit,
            invoice_email: form.invoice_email,
            notes: form.notes,
            rut_url: rutUrl,
            chamber_cert_url: chamberUrl,
          })
          .select()
          .single()

        if (error) throw new Error(error.message)
        setOrgs((prev) => [...prev, data])
      }

      setShowModal(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mis Empresas</h1>
          <p className="text-gray-500 text-sm mt-1">
            {orgs.length} {orgs.length === 1 ? 'empresa registrada' : 'empresas registradas'}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
        >
          + Nueva Empresa
        </button>
      </div>

      {/* Table */}
      {orgs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">No hay empresas registradas.</p>
          <p className="text-sm mt-1">Creá la primera con el botón de arriba.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Nombre</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">NIT</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Correo facturación</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Documentos</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orgs.map((org) => (
                <tr key={org.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4 font-medium text-gray-900">{org.name}</td>
                  <td className="px-5 py-4 text-gray-600">{org.nit}</td>
                  <td className="px-5 py-4 text-gray-600">{org.invoice_email}</td>
                  <td className="px-5 py-4">
                    <div className="flex gap-2">
                      {org.rut_url ? (
                        <a
                          href={org.rut_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded font-medium hover:bg-green-100 transition-colors"
                        >
                          RUT
                        </a>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-400 px-2 py-1 rounded">RUT</span>
                      )}
                      {org.chamber_cert_url ? (
                        <a
                          href={org.chamber_cert_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded font-medium hover:bg-green-100 transition-colors"
                        >
                          Cámara
                        </a>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-400 px-2 py-1 rounded">Cámara</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={() => openEdit(org)}
                      className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {editing ? 'Editar empresa' : 'Nueva empresa'}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre de la empresa
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="Empresa SAS"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">NIT</label>
                <input
                  type="text"
                  value={form.nit}
                  onChange={(e) => setForm({ ...form, nit: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="900.123.456-7"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Correo de facturación
                </label>
                <input
                  type="email"
                  value={form.invoice_email}
                  onChange={(e) => setForm({ ...form, invoice_email: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="facturas@empresa.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  RUT (PDF)
                  {editing?.rut_url && (
                    <span className="ml-2 text-xs text-green-600 font-normal">✓ ya subido</span>
                  )}
                </label>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setRutFile(e.target.files?.[0] ?? null)}
                  className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cámara de Comercio (PDF)
                  {editing?.chamber_cert_url && (
                    <span className="ml-2 text-xs text-green-600 font-normal">✓ ya subido</span>
                  )}
                </label>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setChamberFile(e.target.files?.[0] ?? null)}
                  className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notas (opcional)
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                  placeholder="Información adicional..."
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear empresa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
