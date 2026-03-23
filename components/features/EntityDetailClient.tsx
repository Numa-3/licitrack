'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import DeleteButton from '@/components/ui/DeleteButton'

// ── Types ──────────────────────────────────────────────────────
type EntityDoc = {
  id: string
  type: 'rut' | 'chamber_cert' | 'other'
  file_url: string
  verified: boolean
  verified_by: string | null
  expires_at: string | null
  notes: string | null
  uploaded_by: string
  created_at: string
  profiles: { name: string } | null
}

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
}

type AssociatedContract = {
  id: string
  name: string
  type: string
  status: string
  created_at: string
  organizations: { name: string } | null
}

type Props = {
  entity: Entity
  documents: EntityDoc[]
  contracts: AssociatedContract[]
  userRole: string
  currentUserId: string
}

// ── Constants ──────────────────────────────────────────────────
const DOC_TYPE_LABELS: Record<string, string> = {
  rut: 'RUT', chamber_cert: 'Cámara de Comercio', other: 'Otro',
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador', active: 'Activo', completed: 'Completado', cancelled: 'Cancelado',
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-green-50 text-green-700',
  completed: 'bg-blue-50 text-blue-700',
  cancelled: 'bg-red-50 text-red-700',
}

// ── Helpers ────────────────────────────────────────────────────
function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Component ──────────────────────────────────────────────────
export default function EntityDetailClient({ entity: initial, documents: initialDocs, contracts, userRole, currentUserId }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [entity, setEntity] = useState(initial)
  const [docs, setDocs] = useState(initialDocs)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    name: entity.name,
    nit: entity.nit,
    address: entity.address,
    city: entity.city,
    contact_name: entity.contact_name,
    phone: entity.phone,
    email: entity.email,
    notes: entity.notes,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Upload state
  const [uploadType, setUploadType] = useState<'rut' | 'chamber_cert' | 'other'>('rut')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadExpiresAt, setUploadExpiresAt] = useState('')
  const [uploadNotes, setUploadNotes] = useState('')
  const [uploading, setUploading] = useState(false)

  const isJefe = userRole === 'jefe'

  // ── Save entity details ──────────────────────────────────
  async function handleSave() {
    setLoading(true)
    setError(null)
    setSuccess(null)

    const { error: err } = await supabase
      .from('contracting_entities')
      .update({
        name: form.name.trim(),
        nit: form.nit.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        contact_name: form.contact_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        notes: form.notes.trim(),
      })
      .eq('id', entity.id)

    if (err) { setError(err.message); setLoading(false); return }

    // Log activity
    await supabase.from('activity_log').insert({
      user_id: currentUserId,
      action: 'updated',
      entity_type: 'contracting_entity',
      entity_id: entity.id,
      details: { name: form.name.trim() },
    })

    setEntity(prev => ({
      ...prev,
      name: form.name.trim(),
      nit: form.nit.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      contact_name: form.contact_name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      notes: form.notes.trim(),
    }))
    setEditing(false)
    setLoading(false)
    setSuccess('Entidad actualizada')
    setTimeout(() => setSuccess(null), 3000)
    router.refresh()
  }

  // ── Upload document ────────────────────────────────────────
  async function handleUpload() {
    if (!uploadFile) return
    setUploading(true)
    setError(null)

    const ext = uploadFile.name.split('.').pop() || 'pdf'
    const path = `${entity.id}/${uploadType}-${Date.now()}.${ext}`

    const { error: storageErr } = await supabase.storage
      .from('entity-documents')
      .upload(path, uploadFile)

    if (storageErr) { setError(storageErr.message); setUploading(false); return }

    const { data: urlData } = supabase.storage.from('entity-documents').getPublicUrl(path)

    const { data: doc, error: insertErr } = await supabase
      .from('entity_documents')
      .insert({
        entity_id: entity.id,
        type: uploadType,
        file_url: urlData.publicUrl,
        expires_at: uploadExpiresAt || null,
        notes: uploadNotes.trim() || null,
        uploaded_by: currentUserId,
      })
      .select('id, type, file_url, verified, verified_by, expires_at, notes, uploaded_by, created_at')
      .single()

    if (insertErr) { setError(insertErr.message); setUploading(false); return }

    setDocs(prev => [{ ...doc, profiles: null } as EntityDoc, ...prev])
    setUploadFile(null)
    setUploadExpiresAt('')
    setUploadNotes('')
    setUploading(false)
    setSuccess('Documento subido')
    setTimeout(() => setSuccess(null), 3000)
    router.refresh()
  }

  // ── Verify document (jefe only) ───────────────────────────
  async function handleVerify(docId: string) {
    setError(null)
    const { error: err } = await supabase
      .from('entity_documents')
      .update({ verified: true, verified_by: currentUserId })
      .eq('id', docId)

    if (err) { setError(err.message); return }

    setDocs(prev => prev.map(d => d.id === docId ? { ...d, verified: true, verified_by: currentUserId } : d))
    setSuccess('Documento verificado')
    setTimeout(() => setSuccess(null), 3000)
    router.refresh()
  }

  function resetForm() {
    setForm({
      name: entity.name, nit: entity.nit, address: entity.address,
      city: entity.city, contact_name: entity.contact_name,
      phone: entity.phone, email: entity.email, notes: entity.notes,
    })
  }

  return (
    <div className="p-8 max-w-4xl">
      {/* Breadcrumb */}
      <div className="mb-4">
        <Link href="/entities" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
          ← Entidades contratantes
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{entity.name}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {entity.nit ? `NIT: ${entity.nit}` : 'Sin NIT'} · {entity.city || 'Sin ciudad'}
          </p>
        </div>
        <div className="flex gap-2">
          {isJefe && !editing && (
            <button onClick={() => setEditing(true)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Editar
            </button>
          )}
          {editing && (
            <>
              <button onClick={() => { setEditing(false); resetForm() }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={loading || !form.name.trim()}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
                {loading ? 'Guardando...' : 'Guardar'}
              </button>
            </>
          )}
          {isJefe && (
            <DeleteButton
              apiPath={`/api/admin/entities/${entity.id}`}
              entityLabel="esta entidad"
              redirectTo="/entities"
            />
          )}
        </div>
      </div>

      {/* Alerts */}
      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-lg">{error}</div>}
      {success && <div className="mb-4 text-sm text-green-600 bg-green-50 border border-green-200 px-4 py-3 rounded-lg">{success}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Info + Docs */}
        <div className="lg:col-span-2 space-y-6">
          {/* Info section */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Información</h2>
            {editing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                  <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">NIT</label>
                    <input type="text" value={form.nit} onChange={e => setForm(f => ({ ...f, nit: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad</label>
                    <input type="text" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                  <input type="text" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de contacto</label>
                  <input type="text" value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                    <input type="text" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <InfoRow label="NIT" value={entity.nit} />
                <InfoRow label="Ciudad" value={entity.city} />
                <InfoRow label="Dirección" value={entity.address} />
                <InfoRow label="Contacto" value={entity.contact_name} />
                <InfoRow label="Teléfono" value={entity.phone} />
                <InfoRow label="Email" value={entity.email} />
                {entity.notes && <InfoRow label="Notas" value={entity.notes} />}
                <InfoRow label="Creada" value={formatDate(entity.created_at)} />
              </div>
            )}
          </div>

          {/* Documents section */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Documentos legales</h2>

            {/* Upload form */}
            <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                  <select value={uploadType} onChange={e => setUploadType(e.target.value as typeof uploadType)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
                    <option value="rut">RUT</option>
                    <option value="chamber_cert">Cámara de Comercio</option>
                    <option value="other">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Archivo</label>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png"
                    onChange={e => setUploadFile(e.target.files?.[0] || null)}
                    className="text-sm text-gray-600 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gray-200 file:text-gray-700 hover:file:bg-gray-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Vence</label>
                  <input type="date" value={uploadExpiresAt} onChange={e => setUploadExpiresAt(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <button onClick={handleUpload} disabled={uploading || !uploadFile}
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
                  {uploading ? 'Subiendo...' : 'Subir'}
                </button>
              </div>
              <input type="text" placeholder="Notas (opcional)" value={uploadNotes} onChange={e => setUploadNotes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>

            {/* Document list */}
            {docs.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">No hay documentos subidos.</p>
            ) : (
              <div className="space-y-2">
                {docs.map(doc => (
                  <div key={doc.id} className="flex items-center justify-between border border-gray-100 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className={`text-lg ${doc.verified ? 'text-green-600' : 'text-gray-300'}`}>
                        {doc.verified ? '✓' : '○'}
                      </span>
                      <div>
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                          className="text-sm font-medium text-gray-900 hover:underline">
                          {DOC_TYPE_LABELS[doc.type] || doc.type}
                        </a>
                        <p className="text-xs text-gray-400">
                          {formatDate(doc.created_at)}
                          {doc.expires_at && ` · Vence: ${formatDate(doc.expires_at)}`}
                          {doc.notes && ` · ${doc.notes}`}
                        </p>
                      </div>
                    </div>
                    {isJefe && !doc.verified && (
                      <button onClick={() => handleVerify(doc.id)}
                        className="text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
                        Verificar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column: Contracts */}
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Contratos asociados
              <span className="ml-2 text-sm font-normal text-gray-400">({contracts.length})</span>
            </h2>
            {contracts.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">No hay contratos asociados a esta entidad.</p>
            ) : (
              <div className="space-y-2">
                {contracts.map(contract => (
                  <Link key={contract.id} href={`/dashboard/${contract.id}`}
                    className="block border border-gray-100 rounded-lg px-4 py-3 hover:bg-gray-50 transition-colors">
                    <p className="text-sm font-medium text-gray-900">{contract.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[contract.status] || 'bg-gray-100 text-gray-700'}`}>
                        {STATUS_LABELS[contract.status] || contract.status}
                      </span>
                      {contract.organizations?.name && (
                        <span className="text-xs text-gray-400">{contract.organizations.name}</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── InfoRow helper ─────────────────────────────────────────────
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex">
      <span className="text-gray-500 w-24 shrink-0">{label}</span>
      <span className="text-gray-900">{value || '—'}</span>
    </div>
  )
}
