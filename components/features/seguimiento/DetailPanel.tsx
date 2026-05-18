'use client'

import { useState, useEffect } from 'react'
import { X, ExternalLink, Loader2, Calendar, Pencil, Check, X as XIcon, Trash2, MessageSquare, Send } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'
import type { Process, Change, CronogramaEvent, ProcessNote } from './types'
import { timeAgo } from './helpers'
import { derivePhase, PHASE_META, type Phase } from '@/lib/secop/phase'

type SnapshotInfo = {
  id: string
  captured_at: string
  hash: string
  source_type: string
}

export default function DetailPanel({ process: p, onClose, onRename, onUpdatePhase, onRelink, canEdit, currentUserId }: {
  process: Process
  onClose: () => void
  onRename?: (id: string, name: string | null) => Promise<void>
  onUpdatePhase?: (id: string, phase: Phase | null) => Promise<void>
  onRelink?: (id: string, url: string) => Promise<boolean>
  canEdit?: boolean // true for jefe — gates "ver eliminadas" toggle on notes
  currentUserId?: string | null
}) {
  const [cronograma, setCronograma] = useState<CronogramaEvent[] | null>(null)
  const [changes, setChanges] = useState<Change[] | null>(null)
  const [lastSnapshot, setLastSnapshot] = useState<SnapshotInfo | null>(null)
  const [prevSnapshot, setPrevSnapshot] = useState<SnapshotInfo | null>(null)
  const [snapshotMatch, setSnapshotMatch] = useState<boolean | null>(null)
  const [loadingData, setLoadingData] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(p.custom_name ?? '')
  const [savingName, setSavingName] = useState(false)
  const [notes, setNotes] = useState<ProcessNote[] | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [postingNote, setPostingNote] = useState(false)
  const [showDeletedNotes, setShowDeletedNotes] = useState(false)

  useEffect(() => {
    setLoadingData(true)
    const includeDeleted = canEdit && showDeletedNotes ? '?include_deleted=true' : ''
    Promise.all([
      fetch(`/api/secop/processes/${p.id}/cronograma`).then(r => r.json()),
      fetch(`/api/secop/processes/${p.id}/changes?limit=10`).then(r => r.json()),
      fetch(`/api/secop/processes/${p.id}/notes${includeDeleted}`).then(r => r.json()),
    ]).then(([cronoData, changesData, notesData]) => {
      setCronograma(cronoData.cronograma || [])
      setChanges(changesData.data || [])
      setLastSnapshot(changesData.last_snapshot || null)
      setPrevSnapshot(changesData.prev_snapshot || null)
      setSnapshotMatch(changesData.snapshot_match ?? null)
      setNotes(notesData.data || [])
    }).finally(() => setLoadingData(false))
  }, [p.id, canEdit, showDeletedNotes])

  const postNote = async () => {
    const content = noteDraft.trim()
    if (!content) return
    setPostingNote(true)
    try {
      const res = await fetch(`/api/secop/processes/${p.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      const json = await res.json()
      if (!res.ok) {
        alert(json.error || 'Error al publicar la nota')
        return
      }
      // Optimistic prepend (la API ya devuelve la fila completa hidratada)
      setNotes(prev => prev ? [json.data, ...prev] : [json.data])
      setNoteDraft('')
    } finally {
      setPostingNote(false)
    }
  }

  const deleteNote = async (noteId: string) => {
    if (!confirm('¿Eliminar esta nota? Quedará archivada — los jefes pueden auditar las eliminadas.')) return
    const prev = notes
    // Optimistic: marcar como deleted localmente
    setNotes(ns => ns?.map(n =>
      n.id === noteId
        ? { ...n, deleted_at: new Date().toISOString(), deleted_by: currentUserId || null }
        : n,
    ) ?? null)
    const res = await fetch(`/api/secop/processes/${p.id}/notes/${noteId}`, { method: 'DELETE' })
    if (!res.ok) {
      setNotes(prev)
      alert('Error al eliminar la nota')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-lg bg-white h-full overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}>

        <div className="sticky top-0 bg-white border-b border-[#EAEAEA] px-6 py-4 flex items-center justify-between z-10">
          <h2 className="font-semibold text-gray-900 truncate pr-4">Detalle del proceso</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Nombre personalizado */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Nombre</label>
            {editingName ? (
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="text"
                  value={nameDraft}
                  onChange={e => setNameDraft(e.target.value)}
                  placeholder={p.entidad}
                  maxLength={120}
                  autoFocus
                  className="flex-1 px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  onKeyDown={async e => {
                    if (e.key === 'Escape') { setEditingName(false); setNameDraft(p.custom_name ?? '') }
                    if (e.key === 'Enter' && onRename) {
                      setSavingName(true)
                      await onRename(p.id, nameDraft.trim() || null)
                      setSavingName(false)
                      setEditingName(false)
                    }
                  }}
                />
                <button
                  onClick={async () => {
                    if (!onRename) return
                    setSavingName(true)
                    await onRename(p.id, nameDraft.trim() || null)
                    setSavingName(false)
                    setEditingName(false)
                  }}
                  disabled={savingName}
                  className="p-1.5 text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
                  title="Guardar"
                >
                  {savingName ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                </button>
                <button
                  onClick={() => { setEditingName(false); setNameDraft(p.custom_name ?? '') }}
                  className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
                  title="Cancelar"
                >
                  <XIcon size={16} />
                </button>
              </div>
            ) : (
              <div className="mt-1 flex items-center gap-2 group">
                <p className="text-base font-semibold text-gray-900 truncate">
                  {p.custom_name || <span className="text-gray-400 font-normal italic">Sin nombre personalizado</span>}
                </p>
                {canEdit && (
                  <button
                    onClick={() => { setNameDraft(p.custom_name ?? ''); setEditingName(true) }}
                    className="p-1 text-gray-400 hover:text-gray-700 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Editar nombre"
                  >
                    <Pencil size={13} />
                  </button>
                )}
              </div>
            )}
            {p.custom_name && !editingName && (
              <p className="text-[11px] text-gray-400 mt-0.5">{p.entidad}</p>
            )}
          </div>

          {/* Notas del equipo — arriba para acceso rápido y para ver dónde está el proceso */}
          <NotesSection
            notes={notes}
            noteDraft={noteDraft}
            setNoteDraft={setNoteDraft}
            postingNote={postingNote}
            onPost={postNote}
            onDelete={deleteNote}
            currentUserId={currentUserId}
            canSeeDeleted={!!canEdit}
            showDeleted={showDeletedNotes}
            setShowDeleted={setShowDeletedNotes}
          />

          {/* Source badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <SourceBadge source={p.source} />
          </div>

          {/* Etapa (override manual) */}
          {canEdit && onUpdatePhase && (
            <PhaseSelector
              currentPhase={derivePhase(p)}
              isOverridden={!!p.phase_override}
              onChange={phase => onUpdatePhase(p.id, phase)}
            />
          )}

          {/* Estado de monitoreo */}
          <div className="bg-gray-50 rounded-lg border border-[#EAEAEA] p-3 space-y-3">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Estado de monitoreo</label>

            {/* Última verificación del worker — siempre visible si hay last_monitored_at */}
            {p.last_monitored_at && (
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] text-gray-500">Última verificación</span>
                <span className="text-xs text-gray-700 font-medium">
                  {timeAgo(p.last_monitored_at)}
                  <span className="text-gray-400 font-normal">
                    {' · '}
                    {new Date(p.last_monitored_at).toLocaleString('es-CO', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </span>
              </div>
            )}

            {/* Resultado del último diff entre snapshots */}
            {lastSnapshot && (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] text-gray-500">Último cambio</span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                    <span className={`w-1.5 h-1.5 rounded-full ${snapshotMatch ? 'bg-green-500' : 'bg-amber-500'}`} />
                    <span className="text-gray-700">
                      {snapshotMatch
                        ? 'Sin cambios desde el último snapshot'
                        : 'Cambios detectados'}
                    </span>
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] text-gray-500">Snapshot vigente</span>
                  <span className="text-xs text-gray-700 font-medium">
                    {new Date(lastSnapshot.captured_at).toLocaleString('es-CO', {
                      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
                {prevSnapshot && lastSnapshot.captured_at !== prevSnapshot.captured_at && (
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] text-gray-500">Snapshot anterior</span>
                    <span className="text-xs text-gray-700 font-medium">
                      {new Date(prevSnapshot.captured_at).toLocaleString('es-CO', {
                        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </div>
                )}
              </>
            )}

            <p className="text-[10px] text-gray-400 leading-relaxed pt-1 border-t border-gray-200">
              El worker revisa cada ciclo. Solo guarda un snapshot nuevo si SECOP cambia algo —
              si no, la fecha del snapshot vigente se mantiene aunque siga monitoreando.
            </p>
          </div>

          {/* Entity */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-widest text-gray-500">Entidad</label>
            <p className="mt-1 text-sm text-gray-900 font-medium">{p.entidad}</p>
            {(p.departamento || p.municipio) && (
              <p className="text-xs text-gray-500">{[p.departamento, p.municipio].filter(Boolean).join(' — ')}</p>
            )}
          </div>

          {/* Object */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-widest text-gray-500">Objeto</label>
            <p className="mt-1 text-sm text-gray-700">{p.descripcion || p.objeto}</p>
          </div>

          {/* Data grid */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Modalidad" value={p.modalidad} />
            <Field label="Tipo contrato" value={p.tipo_contrato} />
            <Field label="Fase" value={p.fase} />
            <Field label="Estado" value={p.estado_resumen || p.estado} />
            <Field label="Valor estimado" value={formatCurrency(p.valor_estimado)} />
          </div>

          {/* SECOP link + relink */}
          <div className="space-y-2">
            {p.url_publica && (
              <a href={p.url_publica} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700">
                <ExternalLink size={14} /> Ver en SECOP II
              </a>
            )}
            {canEdit && onRelink && (
              <RelinkUrl processId={p.id} currentUrl={p.url_publica} onSubmit={onRelink} />
            )}
          </div>

          {/* Cronograma */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3 block">Cronograma</label>
            {loadingData ? (
              <div className="flex justify-center py-4"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
            ) : !cronograma || cronograma.length === 0 ? (
              <p className="text-xs text-gray-400">Sin datos de cronograma. El worker lo obtiene en el proximo ciclo.</p>
            ) : (
              <div className="space-y-2">
                {cronograma.map((event, i) => (
                  <CronogramaRow key={i} event={event} />
                ))}
              </div>
            )}
          </div>

          {/* Changes */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3 block">Cambios recientes</label>
            {!changes || changes.length === 0 ? (
              <p className="text-xs text-gray-400">Sin cambios detectados aun.</p>
            ) : (
              <div className="space-y-2">
                {changes.map(c => (
                  <div key={c.id} className="flex items-start gap-2 text-xs">
                    <span className={`inline-block w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                      c.priority === 'high' ? 'bg-red-500' : c.priority === 'medium' ? 'bg-amber-500' : 'bg-gray-300'
                    }`} />
                    <div>
                      <p className="text-gray-700">{c.summary}</p>
                      <p className="text-gray-400">{timeAgo(c.detected_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function NotesSection({
  notes, noteDraft, setNoteDraft, postingNote, onPost, onDelete,
  currentUserId, canSeeDeleted, showDeleted, setShowDeleted,
}: {
  notes: ProcessNote[] | null
  noteDraft: string
  setNoteDraft: (s: string) => void
  postingNote: boolean
  onPost: () => Promise<void>
  onDelete: (noteId: string) => Promise<void>
  currentUserId?: string | null
  canSeeDeleted: boolean
  showDeleted: boolean
  setShowDeleted: (b: boolean) => void
}) {
  const activeNotes = (notes || []).filter(n => !n.deleted_at)
  const visibleNotes = (notes || []).filter(n => showDeleted || !n.deleted_at)
  const deletedCount = (notes || []).filter(n => n.deleted_at).length

  return (
    <div className="rounded-xl border border-[#EAEAEA] bg-white p-4" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MessageSquare size={14} className="text-indigo-600" />
          <h3 className="text-sm font-semibold text-gray-900">Notas del equipo</h3>
          {activeNotes.length > 0 && (
            <span className="text-[10px] font-medium text-gray-500 bg-gray-100 rounded-full px-1.5 py-0.5">
              {activeNotes.length}
            </span>
          )}
        </div>
        {canSeeDeleted && deletedCount > 0 && (
          <button onClick={() => setShowDeleted(!showDeleted)}
            className="text-[10px] text-gray-500 hover:text-gray-700">
            {showDeleted ? 'Ocultar eliminadas' : `Ver ${deletedCount} eliminadas`}
          </button>
        )}
      </div>

      {/* Caja de input */}
      <div className="relative mb-3">
        <textarea
          value={noteDraft}
          onChange={e => setNoteDraft(e.target.value)}
          placeholder="Agregar nota… (ej: esperando que nos acepten la póliza)"
          maxLength={2000}
          rows={2}
          className="w-full px-3 py-2 pr-24 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none placeholder:text-gray-400"
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void onPost() }
          }}
        />
        <button
          onClick={() => void onPost()}
          disabled={postingNote || !noteDraft.trim()}
          className="absolute right-2 bottom-2 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {postingNote ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
          Publicar
        </button>
      </div>
      {noteDraft.length > 0 && (
        <p className="text-[10px] text-gray-400 -mt-1.5 mb-2">{noteDraft.length}/2000 · ⌘+Enter</p>
      )}

      {/* Lista de notas */}
      {!notes ? (
        <div className="flex justify-center py-3"><Loader2 size={14} className="animate-spin text-gray-400" /></div>
      ) : visibleNotes.length === 0 ? (
        <p className="text-xs text-gray-400 italic py-1">Sin notas todavía.</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {visibleNotes.map(n => (
            <NoteRow key={n.id} note={n} currentUserId={currentUserId} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  )
}

function NoteRow({ note, currentUserId: _currentUserId, onDelete }: {
  note: ProcessNote
  currentUserId?: string | null
  onDelete: (id: string) => Promise<void>
}) {
  const isDeleted = !!note.deleted_at
  const authorLabel = note.author_email
    ? note.author_email.split('@')[0]
    : 'Usuario'

  return (
    <div className={`group rounded-lg p-2.5 transition-colors ${
      isDeleted
        ? 'bg-gray-50 opacity-60'
        : 'bg-gray-50/60 hover:bg-gray-50'
    }`}>
      <p className={`text-sm whitespace-pre-wrap break-words mb-1 ${
        isDeleted ? 'text-gray-500 line-through' : 'text-gray-800'
      }`}>
        {note.content}
      </p>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] text-gray-500 flex items-baseline gap-1.5 flex-wrap">
          <span className="font-medium">{authorLabel}</span>
          <span className="text-gray-300">·</span>
          <span>{timeAgo(note.created_at)}</span>
          {isDeleted && (
            <>
              <span className="text-gray-300">·</span>
              <span className="text-red-500/80">
                eliminada{note.deleted_by_email ? ` por ${note.deleted_by_email.split('@')[0]}` : ''}
              </span>
            </>
          )}
        </div>
        {!isDeleted && (
          <button onClick={() => void onDelete(note.id)}
            title="Eliminar nota"
            className="p-0.5 text-gray-300 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100">
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

function SourceBadge({ source }: { source: string }) {
  const map: Record<string, { label: string; classes: string }> = {
    radar: { label: 'Radar', classes: 'bg-blue-50 text-blue-700 ring-blue-700/10' },
    account: { label: 'Cuenta', classes: 'bg-green-50 text-green-700 ring-green-600/20' },
    manual: { label: 'Manual', classes: 'bg-gray-100 text-gray-600 ring-gray-500/10' },
  }
  const badge = map[source] || map.manual
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ring-1 ring-inset ${badge.classes}`}>
      {badge.label}
    </span>
  )
}

function PhaseSelector({ currentPhase, isOverridden, onChange }: {
  currentPhase: Phase
  isOverridden: boolean
  onChange: (phase: Phase | null) => Promise<void>
}) {
  const [saving, setSaving] = useState<Phase | 'auto' | null>(null)

  const select = async (next: Phase | null) => {
    setSaving(next === null ? 'auto' : next)
    try { await onChange(next) }
    finally { setSaving(null) }
  }

  const options: { key: Phase; label: string }[] = [
    { key: 'pre', label: 'Precontractual' },
    { key: 'contractual', label: 'En ejecución' },
    { key: 'post', label: 'Post-contractual' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Etapa</label>
        {isOverridden && (
          <button
            onClick={() => select(null)}
            disabled={saving !== null}
            className="text-[10px] text-gray-500 hover:text-gray-900 disabled:opacity-50 inline-flex items-center gap-1"
            title="Quitar override manual"
          >
            {saving === 'auto' ? <Loader2 size={10} className="animate-spin" /> : null}
            Restaurar automático
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => {
          const isActive = currentPhase === o.key
          const meta = PHASE_META[o.key]
          return (
            <button
              key={o.key}
              onClick={() => !isActive && select(o.key)}
              disabled={saving !== null}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ring-1 ring-inset transition-colors disabled:opacity-50 ${
                isActive
                  ? `${meta.pill} ring-current/30`
                  : 'bg-white text-gray-600 ring-gray-200 hover:ring-gray-300'
              }`}
            >
              {saving === o.key && <Loader2 size={10} className="animate-spin" />}
              {o.label}
            </button>
          )
        })}
      </div>
      <p className="text-[10px] text-gray-400 mt-1.5">
        {isOverridden
          ? 'Marcada manualmente.'
          : 'Derivada automáticamente de SECOP. Cámbiala si SECOP no actualizó el estado.'}
      </p>
    </div>
  )
}

function CronogramaRow({ event }: { event: CronogramaEvent }) {
  const now = Date.now()
  const endMs = event.end_date ? new Date(event.end_date).getTime() : null
  const hoursLeft = endMs ? Math.round((endMs - now) / (60 * 60 * 1000)) : null
  const isUrgent = hoursLeft !== null && hoursLeft > 0 && hoursLeft < 48

  const statusColor = {
    upcoming: isUrgent ? 'border-amber-400 bg-amber-50/50' : 'border-blue-300 bg-blue-50/30',
    active: 'border-green-400 bg-green-50/30',
    past: 'border-gray-200 bg-gray-50/30',
  }[event.status]

  return (
    <div className={`rounded-lg border p-3 ${statusColor}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-900">{event.event_name}</p>
        {hoursLeft !== null && hoursLeft > 0 && (
          <span className={`text-xs font-medium ${isUrgent ? 'text-amber-700' : 'text-gray-500'}`}>
            {hoursLeft < 24 ? `${hoursLeft}h` : `${Math.ceil(hoursLeft / 24)}d`}
          </span>
        )}
      </div>
      {event.end_date && (
        <p className="text-xs text-gray-500 mt-1">
          <Calendar size={10} className="inline mr-1" />
          {new Date(event.end_date).toLocaleDateString('es-CO', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
          })}
        </p>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-widest text-gray-500">{label}</label>
      <p className="mt-0.5 text-sm text-gray-800">{value || '—'}</p>
    </div>
  )
}

function RelinkUrl({ processId, currentUrl, onSubmit }: {
  processId: string
  currentUrl: string | null
  onSubmit: (id: string, url: string) => Promise<boolean>
}) {
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      const ok = await onSubmit(processId, trimmed)
      if (ok) {
        setDraft('')
        setExpanded(false)
      }
    } finally {
      setSaving(false)
    }
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="text-[11px] text-gray-500 hover:text-gray-900 inline-flex items-center gap-1"
        title="Si SECOP creó un nuevo notice (adenda) para este proceso, pegá el nuevo URL aquí"
      >
        Reemplazar URL (adenda)
      </button>
    )
  }

  return (
    <div className="rounded-md bg-amber-50 ring-1 ring-inset ring-amber-200/70 p-3 space-y-2">
      <p className="text-[11px] text-amber-900">
        Pegá el nuevo URL de SECOP (cuando SECOP crea una adenda con un notice nuevo).
        Esto reemplaza el link monitoreado y el worker volverá a scrapear en el próximo ciclo.
      </p>
      <p className="text-[10px] text-amber-700/80 break-all">
        URL actual: {currentUrl || '—'}
      </p>
      <textarea
        value={draft}
        onChange={e => setDraft(e.target.value)}
        placeholder="https://www.secop.gov.co/.../notice=CO1.NTC.XXXXXXX"
        rows={2}
        className="w-full px-2.5 py-1.5 text-xs border border-amber-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={saving || !draft.trim()}
          className="px-3 py-1 text-xs font-medium bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {saving && <Loader2 size={12} className="animate-spin" />}
          Reemplazar
        </button>
        <button
          onClick={() => { setExpanded(false); setDraft('') }}
          disabled={saving}
          className="px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-md disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
