'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import DeleteButton from '@/components/ui/DeleteButton'

// ── Types ──────────────────────────────────────────────────────
type SupplierDoc = {
  id: string
  type: 'rut' | 'chamber_cert' | 'bank_cert' | 'other'
  file_url: string
  verified: boolean
  verified_by: string | null
  expires_at: string | null
  notes: string | null
  uploaded_by: string
  created_at: string
  profiles: { name: string } | null
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
}

type Props = {
  supplier: Supplier
  documents: SupplierDoc[]
  userRole: string
  currentUserId: string
}

// ── Constants ──────────────────────────────────────────────────
const TYPE_LABELS: Record<string, string> = {
  vendor: 'Proveedor', service_provider: 'Prestador de servicio', both: 'Ambos',
}

const DOC_TYPE_LABELS: Record<string, string> = {
  rut: 'RUT', chamber_cert: 'Cámara de Comercio', bank_cert: 'Certificado Bancario', other: 'Otro',
}

// ── Helpers ────────────────────────────────────────────────────
function formatDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

function isExpiringSoon(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  const thirtyDays = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
  const today = new Date().toISOString().split('T')[0]
  return expiresAt <= thirtyDays && expiresAt >= today
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  const today = new Date().toISOString().split('T')[0]
  return expiresAt < today
}

// ── Component ──────────────────────────────────────────────────
export default function SupplierDetailClient({ supplier: initial, documents: initialDocs, userRole, currentUserId }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [supplier, setSupplier] = useState(initial)
  const [docs, setDocs] = useState(initialDocs)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    name: supplier.name,
    type: supplier.type as string,
    whatsapp: supplier.whatsapp || '',
    email: supplier.email || '',
    city: supplier.city,
    iva_exempt: supplier.iva_exempt,
    bbva_registered: supplier.bbva_registered,
    trusted: supplier.trusted,
    notes: supplier.notes,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Upload state
  const [uploadType, setUploadType] = useState<'rut' | 'chamber_cert' | 'bank_cert' | 'other'>('rut')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadExpiresAt, setUploadExpiresAt] = useState('')
  const [uploadNotes, setUploadNotes] = useState('')
  const [uploading, setUploading] = useState(false)

  // ── Verification checklist ─────────────────────────────────
  const checks = useMemo(() => {
    const rutDoc = docs.find(d => d.type === 'rut')
    const chamberDoc = docs.find(d => d.type === 'chamber_cert')

    const items = [
      {
        label: 'RUT',
        uploaded: !!rutDoc,
        verified: !!(rutDoc && rutDoc.verified),
        expiring: false,
        expired: false,
      },
      {
        label: 'Cámara de Comercio',
        uploaded: !!chamberDoc,
        verified: !!(chamberDoc && chamberDoc.verified),
        expiring: isExpiringSoon(chamberDoc?.expires_at ?? null),
        expired: isExpired(chamberDoc?.expires_at ?? null),
      },
      {
        label: 'Cuenta BBVA',
        uploaded: true, // N/A — this is a boolean flag, not a document
        verified: supplier.bbva_registered,
        expiring: false,
        expired: false,
      },
      {
        label: 'Confiable',
        uploaded: true,
        verified: supplier.trusted,
        expiring: false,
        expired: false,
      },
    ]

    const total = items.length
    const done = items.filter(i => i.verified).length

    return { items, total, done }
  }, [docs, supplier.bbva_registered, supplier.trusted])

  // ── Save supplier details ──────────────────────────────────
  async function handleSave() {
    setLoading(true)
    setError(null)
    setSuccess(null)

    const { error: err } = await supabase
      .from('suppliers')
      .update({
        name: form.name.trim(),
        type: form.type,
        whatsapp: form.whatsapp.trim() || null,
        email: form.email.trim() || null,
        city: form.city.trim(),
        iva_exempt: form.iva_exempt,
        bbva_registered: form.bbva_registered,
        trusted: form.trusted,
        notes: form.notes.trim(),
      })
      .eq('id', supplier.id)

    if (err) { setError(err.message); setLoading(false); return }

    setSupplier(prev => ({
      ...prev,
      name: form.name.trim(),
      type: form.type as Supplier['type'],
      whatsapp: form.whatsapp.trim() || null,
      email: form.email.trim() || null,
      city: form.city.trim(),
      iva_exempt: form.iva_exempt,
      bbva_registered: form.bbva_registered,
      trusted: form.trusted,
      notes: form.notes.trim(),
    }))
    setEditing(false)
    setLoading(false)
    setSuccess('Proveedor actualizado')
    setTimeout(() => setSuccess(null), 3000)
    router.refresh()
  }

  // ── Upload document ────────────────────────────────────────
  async function handleUpload() {
    if (!uploadFile) return
    setUploading(true)
    setError(null)

    const ext = uploadFile.name.split('.').pop() || 'pdf'
    const path = `${supplier.id}/${uploadType}-${Date.now()}.${ext}`

    const { error: storageErr } = await supabase.storage
      .from('supplier-documents')
      .upload(path, uploadFile)

    if (storageErr) { setError(storageErr.message); setUploading(false); return }

    const { data: urlData } = supabase.storage.from('supplier-documents').getPublicUrl(path)

    const { data: doc, error: insertErr } = await supabase
      .from('supplier_documents')
      .insert({
        supplier_id: supplier.id,
        type: uploadType,
        file_url: urlData.publicUrl,
        expires_at: uploadExpiresAt || null,
        notes: uploadNotes.trim() || null,
        uploaded_by: currentUserId,
      })
      .select('id, type, file_url, verified, verified_by, expires_at, notes, uploaded_by, created_at')
      .single()

    if (insertErr) { setError(insertErr.message); setUploading(false); return }

    // Update has_rut / has_chamber_cert on supplier
    if (uploadType === 'rut' || uploadType === 'chamber_cert') {
      const field = uploadType === 'rut' ? 'has_rut' : 'has_chamber_cert'
      await supabase.from('suppliers').update({ [field]: true }).eq('id', supplier.id)
      setSupplier(prev => ({ ...prev, [field]: true }))
    }

    setDocs(prev => [{ ...doc, profiles: null } as SupplierDoc, ...prev])
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
      .from('supplier_documents')
      .update({ verified: true, verified_by: currentUserId })
      .eq('id', docId)

    if (err) { setError(err.message); return }

    setDocs(prev => prev.map(d => d.id === docId ? { ...d, verified: true, verified_by: currentUserId } : d))
    setSuccess('Documento verificado')
    setTimeout(() => setSuccess(null), 3000)
    router.refresh()
  }

  // ── Archive supplier (soft delete) ─────────────────────────
  async function handleArchive() {
    if (!confirm('¿Archivar este proveedor? No se eliminará, pero dejará de aparecer en las listas.')) return
    setLoading(true)
    const { error: err } = await supabase
      .from('suppliers')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', supplier.id)

    if (err) { setError(err.message); setLoading(false); return }
    router.push('/suppliers')
  }

  return (
    <div className="p-8 max-w-4xl">
      {/* Breadcrumb */}
      <div className="mb-4">
        <Link href="/suppliers" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
          ← Proveedores
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{supplier.name}</h1>
          <p className="text-gray-500 text-sm mt-1">{TYPE_LABELS[supplier.type]} · {supplier.city || 'Sin ciudad'}</p>
        </div>
        <div className="flex gap-2">
          {!editing ? (
            <button onClick={() => setEditing(true)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Editar
            </button>
          ) : (
            <>
              <button onClick={() => { setEditing(false); setForm({ name: supplier.name, type: supplier.type, whatsapp: supplier.whatsapp || '', email: supplier.email || '', city: supplier.city, iva_exempt: supplier.iva_exempt, bbva_registered: supplier.bbva_registered, trusted: supplier.trusted, notes: supplier.notes }) }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={loading || !form.name.trim()}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
                {loading ? 'Guardando...' : 'Guardar'}
              </button>
            </>
          )}
          {userRole === 'jefe' && (
            <button onClick={handleArchive}
              className="px-4 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors">
              Archivar
            </button>
          )}
          {userRole === 'jefe' && (
            <DeleteButton
              apiPath={`/api/admin/suppliers/${supplier.id}`}
              entityLabel="este proveedor"
              redirectTo="/suppliers"
            />
          )}
        </div>
      </div>

      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-lg">{error}</div>}
      {success && <div className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 px-4 py-3 rounded-lg">{success}</div>}

      <div className="grid grid-cols-3 gap-6">
        {/* ── Left column: details ─────────────────────────────── */}
        <div className="col-span-2 space-y-6">
          {/* Supplier info */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Información</h2>
            {editing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                    <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                    <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
                      <option value="vendor">Proveedor</option>
                      <option value="service_provider">Prestador de servicio</option>
                      <option value="both">Ambos</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
                    <input type="text" value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad</label>
                  <input type="text" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={form.iva_exempt} onChange={e => setForm(f => ({ ...f, iva_exempt: e.target.checked }))} className="rounded border-gray-300" />
                    Exento de IVA
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={form.bbva_registered} onChange={e => setForm(f => ({ ...f, bbva_registered: e.target.checked }))} className="rounded border-gray-300" />
                    BBVA Cash Net inscrito
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={form.trusted} onChange={e => setForm(f => ({ ...f, trusted: e.target.checked }))} className="rounded border-gray-300" />
                    Confiable
                  </label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none" />
                </div>
              </div>
            ) : (
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between"><dt className="text-gray-500">Tipo</dt><dd className="text-gray-900 font-medium">{TYPE_LABELS[supplier.type]}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">WhatsApp</dt><dd className="text-gray-900">{supplier.whatsapp || '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">Email</dt><dd className="text-gray-900">{supplier.email || '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">Ciudad</dt><dd className="text-gray-900">{supplier.city || '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">IVA exento</dt><dd className="text-gray-900">{supplier.iva_exempt ? 'Sí' : 'No'}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">BBVA Cash Net</dt><dd className="text-gray-900">{supplier.bbva_registered ? 'Inscrito' : 'No inscrito'}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">Confiable</dt><dd className="text-gray-900">{supplier.trusted ? 'Sí' : 'No'}</dd></div>
                {supplier.notes && (
                  <div className="pt-2 border-t border-gray-100">
                    <dt className="text-gray-500 mb-1">Notas</dt>
                    <dd className="text-gray-700 whitespace-pre-wrap">{supplier.notes}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>

          {/* ── Documents section ──────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Documentos</h2>

            {/* Upload form */}
            <div className="border border-dashed border-gray-300 rounded-lg p-4 mb-4">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
                  <select value={uploadType} onChange={e => setUploadType(e.target.value as typeof uploadType)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
                    <option value="rut">RUT</option>
                    <option value="chamber_cert">Cámara de Comercio</option>
                    <option value="bank_cert">Certificado Bancario</option>
                    <option value="other">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Archivo</label>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setUploadFile(e.target.files?.[0] || null)}
                    className="text-sm text-gray-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Vence</label>
                  <input type="date" value={uploadExpiresAt} onChange={e => setUploadExpiresAt(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <button onClick={handleUpload} disabled={!uploadFile || uploading}
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
                  {uploading ? 'Subiendo...' : 'Subir'}
                </button>
              </div>
            </div>

            {/* Document list */}
            {docs.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No hay documentos cargados</p>
            ) : (
              <div className="space-y-2">
                {docs.map(doc => {
                  const expiring = isExpiringSoon(doc.expires_at)
                  const expired = isExpired(doc.expires_at)
                  return (
                    <div key={doc.id} className={`flex items-center justify-between p-3 rounded-lg border ${
                      expired ? 'bg-red-50 border-red-200' : expiring ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'
                    }`}>
                      <div className="flex items-center gap-3">
                        <span className={`text-lg ${doc.verified ? 'text-green-600' : 'text-gray-400'}`}>
                          {doc.verified ? '✓' : '○'}
                        </span>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{DOC_TYPE_LABELS[doc.type] || doc.type}</p>
                          <p className="text-xs text-gray-400">
                            Subido {formatDate(doc.created_at.split('T')[0])}
                            {doc.profiles?.name && ` por ${doc.profiles.name}`}
                            {doc.expires_at && (
                              <span className={expired ? 'text-red-600 font-medium' : expiring ? 'text-amber-600 font-medium' : ''}>
                                {' · '}Vence {formatDate(doc.expires_at)}
                                {expired && ' (VENCIDO)'}
                                {expiring && !expired && ' (por vencer)'}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                          className="px-3 py-1 border border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors">
                          Ver
                        </a>
                        {!doc.verified && userRole === 'jefe' && (
                          <button onClick={() => handleVerify(doc.id)}
                            className="px-3 py-1 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition-colors">
                            Verificar
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Right column: verification checklist ─────────────── */}
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Verificación Legal</h2>

            {/* Progress bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">{checks.done} de {checks.total} completas</span>
                <span className="text-xs font-semibold text-gray-700">{Math.round((checks.done / checks.total) * 100)}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${checks.done === checks.total ? 'bg-green-500' : 'bg-blue-500'}`}
                  style={{ width: `${(checks.done / checks.total) * 100}%` }} />
              </div>
            </div>

            {/* Checklist items */}
            <div className="space-y-3">
              {checks.items.map(item => (
                <div key={item.label} className="flex items-start gap-2">
                  <span className={`text-lg mt-[-2px] ${item.verified ? 'text-green-600' : item.uploaded ? 'text-amber-500' : 'text-gray-300'}`}>
                    {item.verified ? '✓' : item.uploaded ? '○' : '✗'}
                  </span>
                  <div>
                    <p className={`text-sm ${item.verified ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>{item.label}</p>
                    <p className="text-xs text-gray-400">
                      {item.verified ? 'Verificado' : item.uploaded ? 'Pendiente de verificación' : 'No cargado'}
                      {item.expired && <span className="text-red-600 font-medium"> · VENCIDO</span>}
                      {item.expiring && !item.expired && <span className="text-amber-600 font-medium"> · Por vencer</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick info */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Datos rápidos</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Creado</dt>
                <dd className="text-gray-900">{formatDate(supplier.created_at.split('T')[0])}</dd>
              </div>
              {supplier.whatsapp && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">WhatsApp</dt>
                  <dd>
                    <a href={`https://wa.me/${supplier.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                      className="text-green-600 hover:underline text-sm">
                      Abrir chat
                    </a>
                  </dd>
                </div>
              )}
              {supplier.email && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Email</dt>
                  <dd>
                    <a href={`mailto:${supplier.email}`} className="text-blue-600 hover:underline text-sm truncate max-w-[150px] inline-block">
                      {supplier.email}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}
