'use client'

import { useState } from 'react'
import { Activity, Loader2 } from 'lucide-react'
import type { Change } from './types'
import { timeAgo } from './helpers'

export default function ChangesTimeline({ initialChanges }: { initialChanges: Change[] }) {
  const [allChanges, setAllChanges] = useState<Change[]>(initialChanges)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filterPriority, setFilterPriority] = useState<'all' | 'high' | 'medium'>('all')
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(initialChanges.length >= 20)

  const filtered = filterPriority === 'all'
    ? allChanges
    : allChanges.filter(c => c.priority === filterPriority)

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const params = new URLSearchParams({
        offset: String(allChanges.length),
        limit: '20',
      })
      if (filterPriority !== 'all') params.set('priority', filterPriority)
      const res = await fetch(`/api/secop/changes/recent?${params}`)
      const json = await res.json()
      if (json.data?.length) {
        setAllChanges(prev => [...prev, ...json.data])
        setHasMore(json.data.length >= 20)
      } else {
        setHasMore(false)
      }
    } finally {
      setLoadingMore(false)
    }
  }

  if (filtered.length === 0 && allChanges.length === 0) {
    return (
      <div className="text-center py-20">
        <Activity size={40} className="mx-auto text-gray-300 mb-3" />
        <h3 className="text-base font-medium text-gray-900">Sin cambios detectados</h3>
        <p className="text-sm text-gray-500 mt-1">Los cambios aparecen cuando el worker detecta modificaciones en los procesos monitoreados.</p>
      </div>
    )
  }

  const grouped = new Map<string, Change[]>()
  for (const c of filtered) {
    const dateKey = new Date(c.detected_at).toLocaleDateString('es-CO', {
      day: '2-digit', month: 'long', year: 'numeric',
    })
    const list = grouped.get(dateKey) || []
    list.push(c)
    grouped.set(dateKey, list)
  }

  const dotColors: Record<string, string> = {
    high: 'bg-red-500',
    medium: 'bg-amber-500',
    low: 'bg-gray-400',
  }

  const filters: { key: 'all' | 'high' | 'medium'; label: string }[] = [
    { key: 'all', label: 'Todas' },
    { key: 'high', label: 'Alta' },
    { key: 'medium', label: 'Media' },
  ]

  return (
    <div>
      <div className="flex gap-1 mb-4">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilterPriority(f.key)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              filterPriority === f.key
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        {Array.from(grouped).map(([date, items]) => (
          <div key={date}>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">{date}</p>
            <div className="relative pl-6">
              <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-gray-200" />
              <div className="space-y-3">
                {items.map(c => (
                  <div key={c.id} className="relative">
                    <div className={`absolute -left-6 top-4 w-3.5 h-3.5 rounded-full border-2 border-white ${dotColors[c.priority]}`}
                      style={{ boxShadow: '0 0 0 2px #f9fafb' }} />
                    <div
                      className={`bg-white rounded-xl border p-4 cursor-pointer transition-colors ${
                        expandedId === c.id ? 'border-gray-300 bg-gray-50/50' : 'border-[#EAEAEA] hover:border-gray-300'
                      }`}
                      style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
                      onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900">{c.summary}</p>
                          {c.secop_processes && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate">
                              {c.secop_processes.entidad} — {c.secop_processes.objeto}
                            </p>
                          )}
                        </div>
                        <span className="text-[10px] text-gray-400 shrink-0">
                          {timeAgo(c.detected_at)}
                        </span>
                      </div>
                      {expandedId === c.id && c.before_json != null && (
                        <div className="mt-3 pt-3 border-t border-gray-200 grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-[10px] font-medium text-gray-500 mb-1">Antes</p>
                            <pre className="text-[11px] text-gray-600 bg-red-50/50 rounded p-2 overflow-auto max-h-32">
                              {JSON.stringify(c.before_json, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <p className="text-[10px] font-medium text-gray-500 mb-1">Despues</p>
                            <pre className="text-[11px] text-gray-600 bg-green-50/50 rounded p-2 overflow-auto max-h-32">
                              {JSON.stringify(c.after_json, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="text-center mt-6">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
          >
            {loadingMore ? <Loader2 size={14} className="inline animate-spin mr-1" /> : null}
            Cargar mas
          </button>
        </div>
      )}
    </div>
  )
}
