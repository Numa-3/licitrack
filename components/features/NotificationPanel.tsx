'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { X, Bell, CheckCheck, Loader2 } from 'lucide-react'

type Notification = {
  id: string
  process_id: string | null
  change_id: string | null
  title: string
  body: string
  priority: 'low' | 'medium' | 'high'
  read: boolean
  created_at: string
  secop_processes?: {
    secop_process_id: string
    entidad: string
    objeto: string
  } | null
}

type Props = {
  open: boolean
  onClose: () => void
  onCountChange: (count: number) => void
}

export default function NotificationPanel({ open, onClose, onCountChange }: Props) {
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [filter, setFilter] = useState<'all' | 'high' | 'medium'>('all')
  const [markingAll, setMarkingAll] = useState(false)

  const fetchNotifications = useCallback(async (offset = 0, append = false) => {
    if (offset === 0) setLoading(true)
    else setLoadingMore(true)
    try {
      const params = new URLSearchParams({
        limit: '20',
        offset: String(offset),
      })
      if (filter !== 'all') params.set('priority', filter)

      const res = await fetch(`/api/notifications?${params}`)
      const json = await res.json()
      if (res.ok) {
        const items = json.data || []
        setNotifications(prev => append ? [...prev, ...items] : items)
        setHasMore(items.length >= 20)
        onCountChange(json.unread_count || 0)
      }
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [filter, onCountChange])

  useEffect(() => {
    if (open) fetchNotifications()
  }, [open, fetchNotifications])

  const markAsRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    await fetch(`/api/notifications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ read: true }),
    })
    onCountChange(notifications.filter(n => !n.read && n.id !== id).length)
  }

  const markAllRead = async () => {
    setMarkingAll(true)
    const res = await fetch('/api/notifications/mark-all-read', { method: 'POST' })
    if (res.ok) {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      onCountChange(0)
    }
    setMarkingAll(false)
  }

  const handleClick = (n: Notification) => {
    if (!n.read) markAsRead(n.id)
    if (n.process_id) {
      onClose()
      router.push('/secop/seguimiento')
    }
  }

  const unreadCount = notifications.filter(n => !n.read).length

  // Group by date
  const grouped = new Map<string, Notification[]>()
  for (const n of notifications) {
    const dateKey = new Date(n.created_at).toLocaleDateString('es-CO', {
      day: '2-digit', month: 'long', year: 'numeric',
    })
    const list = grouped.get(dateKey) || []
    list.push(n)
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

  if (!open) return null

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/40 z-[70]" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-xl z-[71] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#EAEAEA]">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Notificaciones</h2>
            {unreadCount > 0 && (
              <p className="text-xs text-gray-500">{unreadCount} sin leer</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                disabled={markingAll}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
              >
                <CheckCheck size={12} />
                Marcar todas
              </button>
            )}
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-md">
              <X size={18} className="text-gray-500" />
            </button>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-1 px-4 pt-3 pb-2">
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => { setFilter(f.key); setNotifications([]) }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                filter === f.key
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-20">
              <Bell size={40} className="mx-auto text-gray-300 mb-3" />
              <h3 className="text-sm font-medium text-gray-500">Sin notificaciones</h3>
            </div>
          ) : (
            <div className="px-4 py-2 space-y-4">
              {Array.from(grouped).map(([date, items]) => (
                <div key={date}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">{date}</p>
                  <div className="space-y-1">
                    {items.map(n => (
                      <button
                        key={n.id}
                        onClick={() => handleClick(n)}
                        className={`w-full text-left p-3 rounded-lg transition-colors ${
                          n.read
                            ? 'hover:bg-gray-50'
                            : 'bg-blue-50/50 hover:bg-blue-50'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${dotColors[n.priority]}`} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm ${n.read ? 'text-gray-700' : 'text-gray-900 font-medium'}`}>
                              {n.title}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>
                            {n.secop_processes && (
                              <p className="text-[10px] text-gray-400 mt-1 truncate">
                                {n.secop_processes.entidad}
                              </p>
                            )}
                          </div>
                          <span className="text-[10px] text-gray-400 shrink-0 mt-0.5">
                            {timeAgo(n.created_at)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {/* Load more */}
              {hasMore && (
                <div className="text-center py-3">
                  <button
                    onClick={() => fetchNotifications(notifications.length, true)}
                    disabled={loadingMore}
                    className="px-4 py-2 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {loadingMore && <Loader2 size={12} className="inline animate-spin mr-1" />}
                    Cargar mas
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diffMs = now - date
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days}d`
  return new Date(dateStr).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
}
