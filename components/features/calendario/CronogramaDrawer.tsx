'use client'

import { useState, useEffect, useRef } from 'react'
import { X, ExternalLink, Loader2, Calendar } from 'lucide-react'
import Link from 'next/link'
import { PHASE_META, type Phase } from '@/lib/secop/phase'

type CronogramaEvent = {
  event_name: string
  start_date: string | null
  end_date: string | null
  remaining_days: number | null
  status: 'upcoming' | 'active' | 'past'
}

/**
 * Slide-in drawer derecho con el cronograma completo del proceso clickeado en
 * el calendario. Reusa el patrón visual del DetailPanel del seguimiento.
 */
export default function CronogramaDrawer({
  processId,
  processName,
  phase,
  accountName,
  highlightEventDate,
  onClose,
}: {
  processId: string
  processName: string
  phase: Phase
  accountName: string | null
  highlightEventDate: string | null
  onClose: () => void
}) {
  const [cronograma, setCronograma] = useState<CronogramaEvent[] | null>(null)
  const [loading, setLoading] = useState(true)
  const highlightRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/secop/processes/${processId}/cronograma`)
      .then(r => r.json())
      .then(json => setCronograma(json.cronograma || []))
      .catch(() => setCronograma([]))
      .finally(() => setLoading(false))
  }, [processId])

  // Scroll al evento resaltado cuando carga
  useEffect(() => {
    if (!cronograma || !highlightEventDate || !highlightRef.current) return
    highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [cronograma, highlightEventDate])

  const meta = PHASE_META[phase]

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-lg bg-white h-full overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-[#EAEAEA] px-6 py-4 z-10">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-gray-900 truncate pr-4">Cronograma del proceso</h2>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
              <X size={20} />
            </button>
          </div>
          <p className="text-base font-semibold text-gray-900 truncate">{processName}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ring-1 ring-inset ${meta.pill}`}>
              {meta.label}
            </span>
            {accountName && (
              <span className="text-[11px] text-gray-500">· Cuenta: {accountName}</span>
            )}
          </div>
          <Link
            href={`/secop/seguimiento?process=${processId}`}
            className="inline-flex items-center gap-1.5 mt-3 text-xs text-indigo-600 hover:text-indigo-700"
          >
            <ExternalLink size={12} /> Ir a Seguimiento
          </Link>
        </div>

        <div className="px-6 py-5">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-3 block">
            Eventos del cronograma
          </label>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          ) : !cronograma || cronograma.length === 0 ? (
            <p className="text-xs text-gray-400">Sin datos de cronograma. El worker lo obtiene en el próximo ciclo.</p>
          ) : (
            <div className="space-y-2">
              {cronograma.map((ev, i) => {
                const isHighlight = highlightEventDate &&
                  (ev.end_date === highlightEventDate || ev.start_date === highlightEventDate)
                return (
                  <div
                    key={`${ev.event_name}-${i}`}
                    ref={isHighlight ? highlightRef : null}
                    className={`rounded-lg border p-3 transition-colors ${
                      isHighlight
                        ? 'border-indigo-400 bg-indigo-50/40 ring-2 ring-indigo-200'
                        : statusBorder(ev.status)
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900">{ev.event_name}</p>
                      {ev.remaining_days !== null && ev.remaining_days >= 0 && (
                        <span className={`text-xs font-medium ${
                          ev.remaining_days < 2 ? 'text-red-700' :
                          ev.remaining_days < 7 ? 'text-amber-700' : 'text-gray-500'
                        }`}>
                          {ev.remaining_days < 1 ? 'hoy' : `${ev.remaining_days}d`}
                        </span>
                      )}
                    </div>
                    {ev.end_date && (
                      <p className="text-xs text-gray-500 mt-1">
                        <Calendar size={10} className="inline mr-1" />
                        {new Date(ev.end_date).toLocaleString('es-CO', {
                          day: '2-digit', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function statusBorder(status: 'upcoming' | 'active' | 'past'): string {
  switch (status) {
    case 'past':     return 'border-gray-200 bg-gray-50/30'
    case 'active':   return 'border-emerald-400 bg-emerald-50/30'
    case 'upcoming': return 'border-blue-300 bg-blue-50/30'
  }
}
