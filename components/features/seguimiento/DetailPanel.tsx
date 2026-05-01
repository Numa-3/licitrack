'use client'

import { useState, useEffect } from 'react'
import { X, ExternalLink, Loader2, Calendar, Pencil, Check, X as XIcon } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'
import type { Process, Change, CronogramaEvent } from './types'
import { timeAgo } from './helpers'

type SnapshotInfo = {
  id: string
  captured_at: string
  hash: string
  source_type: string
}

export default function DetailPanel({ process: p, onClose, onRename, canEdit }: {
  process: Process
  onClose: () => void
  onRename?: (id: string, name: string | null) => Promise<void>
  canEdit?: boolean
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

  useEffect(() => {
    setLoadingData(true)
    Promise.all([
      fetch(`/api/secop/processes/${p.id}/cronograma`).then(r => r.json()),
      fetch(`/api/secop/processes/${p.id}/changes?limit=10`).then(r => r.json()),
    ]).then(([cronoData, changesData]) => {
      setCronograma(cronoData.cronograma || [])
      setChanges(changesData.data || [])
      setLastSnapshot(changesData.last_snapshot || null)
      setPrevSnapshot(changesData.prev_snapshot || null)
      setSnapshotMatch(changesData.snapshot_match ?? null)
    }).finally(() => setLoadingData(false))
  }, [p.id])

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

          {/* Source badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <SourceBadge source={p.source} />
          </div>

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

          {/* SECOP link */}
          {p.url_publica && (
            <a href={p.url_publica} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700">
              <ExternalLink size={14} /> Ver en SECOP II
            </a>
          )}

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
