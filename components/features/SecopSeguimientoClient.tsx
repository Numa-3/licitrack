'use client'

import { useState, useCallback, useEffect } from 'react'
import { formatCurrency } from '@/lib/utils/format'
import {
  Eye, AlertTriangle, Clock, Plus, X, ExternalLink,
  ChevronLeft, ChevronRight, Loader2, Star, Trash2,
  ToggleLeft, ToggleRight, Calendar, Bell, Activity,
  type LucideIcon,
} from 'lucide-react'

// ── Types ───────────────────────────────────────────────────

type Process = {
  id: string
  secop_process_id: string
  referencia_proceso: string | null
  entidad: string
  objeto: string
  descripcion: string | null
  modalidad: string | null
  tipo_contrato: string | null
  fase: string | null
  estado: string | null
  estado_resumen: string | null
  valor_estimado: number | null
  url_publica: string | null
  departamento: string | null
  municipio: string | null
  source: 'radar' | 'account' | 'manual'
  account_id: string | null
  radar_state: string
  monitoring_enabled: boolean
  last_monitored_at: string | null
  next_deadline: string | null
  next_deadline_label: string | null
  secop_accounts?: { name: string } | null
}

type Change = {
  id: string
  process_id: string
  change_type: string
  priority: 'low' | 'medium' | 'high'
  summary: string
  detected_at: string
  before_json?: Record<string, unknown> | null
  after_json?: Record<string, unknown> | null
  secop_processes?: {
    secop_process_id: string
    entidad: string
    objeto: string
  } | null
}

type Account = {
  id: string
  name: string
  username: string
  is_active: boolean
  entity_name: string | null
  discovered_entities: { name: string; value: string }[] | null
  monitored_entities: string[] | null
  last_login_at: string | null
  last_sync_at: string | null
  sync_requested_at: string | null
  process_count: number
  cookies_expire_at: string | null
}

type WorkerStatus = {
  status: 'running' | 'success' | 'error'
  finished_at: string | null
  processes_checked: number
  changes_found: number
} | null

type Props = {
  initialProcesses: Process[]
  initialCount: number
  initialChanges: Change[]
  initialAccounts: Account[]
  urgentCount: number
  workerStatus: WorkerStatus
  userRole: string
}

type AccountProcess = {
  id: string
  secop_process_id: string
  referencia_proceso: string | null
  entidad: string
  objeto: string
  estado: string | null
  valor_estimado: number | null
  monitoring_enabled: boolean
  url_publica: string | null
  entity_name: string | null
}

type Tab = 'all' | 'urgent' | 'changes'

const PAGE_SIZE = 50

// ── Component ───────────────────────────────────────────────

export default function SecopSeguimientoClient({
  initialProcesses,
  initialCount,
  initialChanges,
  initialAccounts,
  urgentCount,
  workerStatus,
  userRole,
}: Props) {
  const isJefe = userRole === 'jefe'

  const [processes, setProcesses] = useState<Process[]>(initialProcesses)
  const [totalCount, setTotalCount] = useState(initialCount)
  const [changes] = useState<Change[]>(initialChanges)
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts)
  const [activeTab, setActiveTab] = useState<Tab>('all')
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)

  // Panels
  const [showAccounts, setShowAccounts] = useState(false)
  const [showAddProcess, setShowAddProcess] = useState(false)
  const [selected, setSelected] = useState<Process | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null)

  const showToast = (message: string, type: 'error' | 'success' = 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  // ── Fetch ─────────────────────────────────────────────────

  const fetchProcesses = useCallback(async (tab: Tab, offset: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) })
      if (tab === 'urgent') params.set('urgency', 'urgent')

      const res = await fetch(`/api/secop/seguimiento?${params}`)
      const json = await res.json()
      if (res.ok) {
        setProcesses(json.data || [])
        setTotalCount(json.count || 0)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab)
    setPage(0)
    if (tab !== 'changes') fetchProcesses(tab, 0)
  }

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    fetchProcesses(activeTab, newPage * PAGE_SIZE)
  }

  // ── Accounts CRUD ─────────────────────────────────────────

  const createAccount = async (name: string, username: string, password: string) => {
    const res = await fetch('/api/secop/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, username, password }),
    })
    if (!res.ok) { showToast('Error al crear cuenta'); return }
    const newAcc = await res.json()
    setAccounts(prev => [{ ...newAcc, process_count: 0, is_active: true, last_login_at: null, last_sync_at: null, cookies_expire_at: null, discovered_entities: null, monitored_entities: null, entity_name: null, sync_requested_at: null }, ...prev])
    showToast('Cuenta creada', 'success')
  }

  const updateMonitoredEntities = async (id: string, monitored: string[]) => {
    const res = await fetch(`/api/secop/accounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monitored_entities: monitored }),
    })
    if (!res.ok) { showToast('Error al guardar entidades'); return }
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, monitored_entities: monitored } : a))
  }

  const requestSync = async (id: string) => {
    const res = await fetch(`/api/secop/accounts/${id}/sync`, { method: 'POST' })
    if (!res.ok) { showToast('Error al solicitar sync'); return }
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, sync_requested_at: new Date().toISOString() } : a))
  }

  const toggleMonitoring = async (id: string, enabled: boolean) => {
    const prev = processes.map(p => ({ ...p }))
    setProcesses(ps => ps.map(p => p.id === id ? { ...p, monitoring_enabled: enabled } : p))
    const res = await fetch(`/api/secop/processes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monitoring_enabled: enabled }),
    })
    if (!res.ok) {
      setProcesses(prev) // rollback
      showToast('Error al cambiar monitoreo')
    }
  }

  const toggleAccount = async (id: string, active: boolean) => {
    const res = await fetch(`/api/secop/accounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: active }),
    })
    if (!res.ok) { showToast('Error al cambiar estado de cuenta'); return }
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, is_active: active } : a))
  }

  const deleteAccount = async (id: string) => {
    const name = accounts.find(a => a.id === id)?.name || 'esta cuenta'
    if (!confirm(`¿Eliminar "${name}"? Los contratos descubiertos perderan su asociacion con esta cuenta.`)) return
    const res = await fetch(`/api/secop/accounts/${id}`, { method: 'DELETE' })
    if (!res.ok) { showToast('Error al eliminar cuenta'); return }
    setAccounts(prev => prev.filter(a => a.id !== id))
    showToast('Cuenta eliminada', 'success')
  }

  // ── Add manual process ────────────────────────────────────

  const addManualProcess = async (input: string) => {
    const res = await fetch('/api/secop/processes/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
    })
    const json = await res.json()
    if (res.ok) {
      setShowAddProcess(false)
      fetchProcesses(activeTab, page * PAGE_SIZE)
    }
    return json
  }

  // ── Render ────────────────────────────────────────────────

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const todayChanges = changes.filter(c => {
    const d = new Date(c.detected_at)
    const today = new Date()
    return d.toDateString() === today.toDateString()
  })

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[60] px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium transition-all ${
          toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-gray-900 text-white'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Seguimiento SECOP</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {totalCount} proceso{totalCount !== 1 ? 's' : ''} monitoreado{totalCount !== 1 ? 's' : ''}
          </p>
        </div>
        {isJefe && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddProcess(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-md shadow-sm"
            >
              <Plus size={14} /> Agregar proceso
            </button>
            <button
              onClick={() => setShowAccounts(!showAccounts)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-md"
            >
              Mis cuentas ({accounts.filter(a => a.is_active).length})
            </button>
          </div>
        )}
      </div>

      {/* Urgent alerts */}
      {urgentCount > 0 && (
        <div className="mb-6 rounded-xl p-4 flex items-center gap-4"
          style={{ backgroundColor: '#FFFDF7', border: '1px solid #FBECC6' }}>
          <div className="p-2 bg-amber-100 rounded-full shrink-0">
            <AlertTriangle size={18} className="text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">
              {urgentCount} deadline{urgentCount > 1 ? 's' : ''} en las proximas 48 horas
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Revisa los procesos urgentes para no perder plazos
            </p>
          </div>
          <button
            onClick={() => handleTabChange('urgent')}
            className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-md shrink-0"
          >
            Ver urgentes
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="Monitoreados"
          value={String(totalCount)}
          icon={Eye}
          iconColor="bg-blue-50 text-blue-600 ring-1 ring-blue-500/10"
          detail={`${accounts.filter(a => a.is_active).length} cuenta${accounts.filter(a => a.is_active).length !== 1 ? 's' : ''} activa${accounts.filter(a => a.is_active).length !== 1 ? 's' : ''}`}
        />
        <KpiCard
          label="Proximos 48h"
          value={String(urgentCount)}
          icon={AlertTriangle}
          iconColor="bg-amber-50 text-amber-600 ring-1 ring-amber-500/10"
          detail={urgentCount > 0 ? 'Requiere atencion' : 'Sin urgencias'}
          urgent={urgentCount > 0}
        />
        <KpiCard
          label="Cambios hoy"
          value={String(todayChanges.length)}
          icon={Bell}
          iconColor="bg-indigo-50 text-indigo-600 ring-1 ring-indigo-500/10"
          detail={`${todayChanges.filter(c => c.priority === 'high').length} de alta prioridad`}
        />
        <WorkerStatusCard status={workerStatus} />
      </section>

      {/* Accounts Panel */}
      {showAccounts && isJefe && (
        <AccountsPanel
          accounts={accounts}
          onToggle={toggleAccount}
          onDelete={deleteAccount}
          onCreate={createAccount}
          onUpdateEntities={updateMonitoredEntities}
          onRequestSync={requestSync}
          onRefreshProcesses={() => fetchProcesses(activeTab === 'changes' ? 'all' : activeTab, page * PAGE_SIZE)}
        />
      )}

      {/* Add Process Modal */}
      {showAddProcess && (
        <AddProcessModal
          onAdd={addManualProcess}
          onClose={() => setShowAddProcess(false)}
        />
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-[#EAEAEA]">
        {([
          { key: 'all' as Tab, label: 'Todos', count: totalCount },
          { key: 'urgent' as Tab, label: 'Urgentes', count: urgentCount },
          { key: 'changes' as Tab, label: 'Cambios recientes', count: changes.length },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1.5 bg-gray-100 text-gray-600 rounded px-1.5 text-[10px]">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'changes' ? (
        <ChangesTimeline initialChanges={changes} />
      ) : loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : processes.length === 0 ? (
        <EmptyState hasAccounts={accounts.length > 0} onShowAccounts={() => setShowAccounts(true)} />
      ) : (
        <>
          {/* Process Table */}
          <div className="bg-white rounded-xl border border-[#EAEAEA] overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-[#EAEAEA]">
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Proceso</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 hidden lg:table-cell">Cuenta</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Proximo deadline</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 hidden md:table-cell">Estado</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 hidden md:table-cell">Valor</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 w-20">Track</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAEAEA]">
                  {processes.map(p => (
                    <tr
                      key={p.id}
                      onClick={() => setSelected(p)}
                      className={`hover:bg-gray-50/80 cursor-pointer transition-colors ${!p.monitoring_enabled ? 'opacity-50' : ''}`}
                    >
                      <td className="px-4 py-3 max-w-[300px]">
                        <p className="font-medium text-gray-900 truncate">{p.entidad}</p>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{p.objeto}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <SourceBadge source={p.source} />
                          {p.referencia_proceso && (
                            <span className="text-[10px] text-gray-400">{p.referencia_proceso}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-xs text-gray-500">
                          {p.secop_accounts?.name || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <DeadlineBadge deadline={p.next_deadline} label={p.next_deadline_label} />
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-xs text-gray-600">{p.estado_resumen || p.fase || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-right hidden md:table-cell whitespace-nowrap">
                        {formatCurrency(p.valor_estimado)}
                      </td>
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => toggleMonitoring(p.id, !p.monitoring_enabled)}
                          title={p.monitoring_enabled ? 'Desactivar seguimiento' : 'Activar seguimiento'}
                          className="transition-colors"
                        >
                          {p.monitoring_enabled
                            ? <ToggleRight size={22} className="text-indigo-600" />
                            : <ToggleLeft size={22} className="text-gray-300" />
                          }
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-500">
                Pagina {page + 1} de {totalPages}
              </p>
              <div className="flex gap-2">
                <button onClick={() => handlePageChange(page - 1)} disabled={page === 0}
                  className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                  <ChevronLeft size={16} />
                </button>
                <button onClick={() => handlePageChange(page + 1)} disabled={page >= totalPages - 1}
                  className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail Panel */}
      {selected && (
        <DetailPanel
          process={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

// ── KPI Card ────────────────────────────────────────────────

function KpiCard({ label, value, icon: Icon, iconColor, detail, urgent }: {
  label: string
  value: string
  icon: LucideIcon
  iconColor: string
  detail: string
  urgent?: boolean
}) {
  return (
    <div className="bg-white border border-[#EAEAEA] rounded-xl p-5 flex flex-col hover:border-gray-300 transition-colors"
      style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-medium text-gray-500">{label}</h3>
        <div className={`p-1.5 rounded-md ${iconColor}`}>
          <Icon size={14} />
        </div>
      </div>
      <span className={`text-3xl font-semibold tracking-tight ${urgent ? 'text-amber-600' : 'text-gray-900'}`}>{value}</span>
      <span className="text-xs text-gray-400 mt-2">{detail}</span>
    </div>
  )
}

// ── Worker Status Card ──────────────────────────────────────

function WorkerStatusCard({ status }: { status: WorkerStatus }) {
  if (!status) {
    return (
      <div className="bg-white border border-[#EAEAEA] rounded-xl p-5 flex flex-col"
        style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-medium text-gray-500">Worker</h3>
          <div className="p-1.5 rounded-md bg-gray-50 text-gray-400 ring-1 ring-gray-200">
            <Activity size={14} />
          </div>
        </div>
        <span className="text-sm text-gray-400">Sin datos</span>
      </div>
    )
  }

  const dotColor = status.status === 'success' ? 'bg-green-500' : status.status === 'error' ? 'bg-red-500' : 'bg-amber-500'
  const statusLabel = status.status === 'success' ? 'Activo' : status.status === 'error' ? 'Error' : 'Corriendo'
  const ago = status.finished_at ? timeAgo(status.finished_at) : 'en curso'

  return (
    <div className="bg-white border border-[#EAEAEA] rounded-xl p-5 flex flex-col hover:border-gray-300 transition-colors"
      style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-medium text-gray-500">Worker</h3>
        <div className="p-1.5 rounded-md bg-gray-50 text-gray-600 ring-1 ring-gray-200">
          <Activity size={14} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        <span className="text-lg font-semibold text-gray-900">{statusLabel}</span>
      </div>
      <span className="text-xs text-gray-400 mt-2">
        {ago} &middot; {status.processes_checked} revisados, {status.changes_found} cambios
      </span>
    </div>
  )
}

// ── Source Badge ─────────────────────────────────────────────

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

// ── Deadline Badge ──────────────────────────────────────────

function DeadlineBadge({ deadline, label }: { deadline: string | null; label: string | null }) {
  if (!deadline) {
    return <span className="text-xs text-gray-400">Sin monitoreo aun</span>
  }

  const now = Date.now()
  const deadlineMs = new Date(deadline).getTime()
  const hoursLeft = Math.round((deadlineMs - now) / (60 * 60 * 1000))
  const isPast = deadlineMs < now
  const isUrgent = !isPast && hoursLeft < 48

  const dateStr = new Date(deadline).toLocaleDateString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  if (isPast) {
    return (
      <div>
        <p className="text-xs text-gray-400 line-through">{dateStr}</p>
        {label && <p className="text-[10px] text-gray-400">{label}</p>}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <Clock size={12} className={isUrgent ? 'text-amber-500' : 'text-gray-400'} />
        <p className={`text-xs font-medium ${isUrgent ? 'text-amber-700' : 'text-gray-700'}`}>
          {hoursLeft < 24 ? `${hoursLeft}h` : `${Math.ceil(hoursLeft / 24)}d`}
        </p>
        <p className="text-xs text-gray-500">{dateStr}</p>
      </div>
      {label && <p className="text-[10px] text-gray-400 mt-0.5">{label}</p>}
    </div>
  )
}

// ── Changes Timeline ────────────────────────────────────────

function ChangesTimeline({ initialChanges }: { initialChanges: Change[] }) {
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

  // Group by date
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
      {/* Priority filter */}
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

      {/* Timeline */}
      <div className="space-y-6">
        {Array.from(grouped).map(([date, items]) => (
          <div key={date}>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">{date}</p>
            <div className="relative pl-6">
              {/* Vertical line */}
              <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-gray-200" />

              <div className="space-y-3">
                {items.map(c => (
                  <div key={c.id} className="relative">
                    {/* Priority dot on the line */}
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

                      {/* Expandable before/after */}
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

      {/* Load more */}
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

// ── Detail Panel ────────────────────────────────────────────

type SnapshotInfo = {
  id: string
  captured_at: string
  hash: string
  source_type: string
}

function DetailPanel({ process: p, onClose }: { process: Process; onClose: () => void }) {
  const [cronograma, setCronograma] = useState<CronogramaEvent[] | null>(null)
  const [changes, setChanges] = useState<Change[] | null>(null)
  const [lastSnapshot, setLastSnapshot] = useState<SnapshotInfo | null>(null)
  const [prevSnapshot, setPrevSnapshot] = useState<SnapshotInfo | null>(null)
  const [snapshotMatch, setSnapshotMatch] = useState<boolean | null>(null)
  const [loadingData, setLoadingData] = useState(false)

  // Load cronograma and changes on mount
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
          {/* Source + monitoring status */}
          <div className="flex items-center gap-2 flex-wrap">
            <SourceBadge source={p.source} />
            {p.last_monitored_at && (
              <span className="text-[10px] text-gray-400">
                Revisado {timeAgo(p.last_monitored_at)}
              </span>
            )}
          </div>

          {/* Snapshot comparison */}
          {lastSnapshot && (
            <div className="bg-gray-50 rounded-lg border border-[#EAEAEA] p-3 space-y-2">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Ultima comparacion</label>
              <div className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${snapshotMatch ? 'bg-green-500' : 'bg-amber-500'}`} />
                <span className="text-xs text-gray-700 font-medium">
                  {snapshotMatch ? 'Sin cambios' : 'Cambios detectados'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <p className="text-gray-400">Ultima revision</p>
                  <p className="text-gray-700 font-medium">
                    {new Date(lastSnapshot.captured_at).toLocaleString('es-CO', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
                {prevSnapshot && (
                  <div>
                    <p className="text-gray-400">Comparada contra</p>
                    <p className="text-gray-700 font-medium">
                      {new Date(prevSnapshot.captured_at).toLocaleString('es-CO', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                )}
              </div>
              {prevSnapshot && (
                <p className="text-[10px] text-gray-400">
                  Intervalo: {Math.round((new Date(lastSnapshot.captured_at).getTime() - new Date(prevSnapshot.captured_at).getTime()) / 60000)} min
                </p>
              )}
            </div>
          )}

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

type CronogramaEvent = {
  event_name: string
  start_date: string | null
  end_date: string | null
  remaining_days: number | null
  status: 'upcoming' | 'active' | 'past'
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

// ── Empty State ─────────────────────────────────────────────

function EmptyState({ hasAccounts, onShowAccounts }: { hasAccounts: boolean; onShowAccounts: () => void }) {
  return (
    <div className="text-center py-20">
      <Eye size={40} className="mx-auto text-gray-300 mb-3" />
      {hasAccounts ? (
        <>
          <h3 className="text-base font-medium text-gray-900">Sin procesos monitoreados</h3>
          <p className="text-sm text-gray-500 mt-1">
            El worker descubrira procesos automaticamente en el proximo ciclo, o agrega uno manualmente.
          </p>
        </>
      ) : (
        <>
          <h3 className="text-base font-medium text-gray-900">Configura tu primera cuenta SECOP</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
            Agrega una cuenta de SECOP para que el worker descubra automaticamente tus procesos y contratos.
          </p>
          <button onClick={onShowAccounts}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-md shadow-sm">
            <Plus size={16} /> Agregar cuenta
          </button>
        </>
      )}
    </div>
  )
}

// ── Accounts Panel ──────────────────────────────────────────

function AccountsPanel({ accounts, onToggle, onDelete, onCreate, onUpdateEntities, onRequestSync, onRefreshProcesses }: {
  accounts: Account[]
  onToggle: (id: string, active: boolean) => void
  onDelete: (id: string) => void
  onCreate: (name: string, username: string, password: string) => void
  onUpdateEntities: (id: string, monitored: string[]) => void
  onRequestSync: (id: string) => Promise<void>
  onRefreshProcesses: () => void
}) {
  const [showNew, setShowNew] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <div className="mb-6 bg-white rounded-xl border border-[#EAEAEA] p-4" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-gray-900">Cuentas SECOP</h3>
        <button onClick={() => setShowNew(!showNew)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg">
          <Plus size={14} /> Nueva cuenta
        </button>
      </div>

      {showNew && <NewAccountForm onCreate={(n, u, p) => { onCreate(n, u, p); setShowNew(false) }} onCancel={() => setShowNew(false)} />}

      {accounts.length === 0 ? (
        <p className="text-sm text-gray-500 py-4 text-center">No hay cuentas configuradas.</p>
      ) : (
        <div className="space-y-2">
          {accounts.map(acc => (
            <AccountRow
              key={acc.id}
              acc={acc}
              isExpanded={expandedId === acc.id}
              onExpand={() => setExpandedId(expandedId === acc.id ? null : acc.id)}
              onToggle={onToggle}
              onDelete={onDelete}
              onUpdateEntities={onUpdateEntities}
              onRequestSync={onRequestSync}
              onRefreshProcesses={onRefreshProcesses}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AccountRow({ acc, isExpanded, onExpand, onToggle, onDelete, onUpdateEntities, onRequestSync, onRefreshProcesses }: {
  acc: Account
  isExpanded: boolean
  onExpand: () => void
  onToggle: (id: string, active: boolean) => void
  onDelete: (id: string) => void
  onUpdateEntities: (id: string, monitored: string[]) => void
  onRequestSync: (id: string) => Promise<void>
  onRefreshProcesses: () => void
}) {
  const discovered = acc.discovered_entities || []
  const [pending, setPending] = useState<string[]>(acc.monitored_entities || [])
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(Boolean(acc.sync_requested_at))
  const [syncDone, setSyncDone] = useState(false)
  const [contractsKey, setContractsKey] = useState(0)

  // Sync pending state when acc.monitored_entities changes from outside
  const prevMonitored = acc.monitored_entities || []
  const isDirty = JSON.stringify(pending.slice().sort()) !== JSON.stringify(prevMonitored.slice().sort())

  const handleSaveAndDiscover = async () => {
    setSaving(true)
    setSyncDone(false)
    try {
      await onUpdateEntities(acc.id, pending)
      setSyncing(true)
      await onRequestSync(acc.id)
    } finally {
      setSaving(false)
    }
  }

  const hasSyncPending = syncing

  // Poll until worker clears sync_requested_at, then reload contracts
  useEffect(() => {
    if (!syncing) return
    const interval = setInterval(async () => {
      const res = await fetch('/api/secop/accounts').catch(() => null)
      if (!res?.ok) return
      const accounts: Account[] = await res.json()
      const updated = accounts.find(a => a.id === acc.id)
      if (updated && !updated.sync_requested_at) {
        setSyncing(false)
        setSyncDone(true)
        setContractsKey(k => k + 1)
        onRefreshProcesses()
        setTimeout(() => setSyncDone(false), 5000)
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [syncing, acc.id, onRefreshProcesses])

  return (
    <div className={`rounded-lg border ${acc.is_active ? 'border-[#EAEAEA] bg-white' : 'border-gray-100 bg-gray-50'}`}>
      <div className="flex items-center justify-between p-3">
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onExpand}>
          <p className={`font-medium text-sm ${acc.is_active ? 'text-gray-900' : 'text-gray-400'}`}>{acc.name}</p>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="text-xs text-gray-400">{acc.username}</span>
            <SessionStatus expiresAt={acc.cookies_expire_at} />
            {discovered.length > 0 && (
              <span className="text-xs text-gray-400">
                {(acc.monitored_entities || []).length}/{discovered.length} entidades
              </span>
            )}
            {discovered.length === 0 && (
              <span className="text-[10px] text-amber-600">Correr worker --discover</span>
            )}
            {hasSyncPending && (
              <span className="inline-flex items-center gap-1 text-[10px] text-blue-600">
                <Loader2 size={10} className="animate-spin" /> En cola
              </span>
            )}
            {acc.last_sync_at && !hasSyncPending && (
              <span className="text-[10px] text-gray-400">Sync {timeAgo(acc.last_sync_at)}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-3">
          <button onClick={() => onToggle(acc.id, !acc.is_active)}
            className="p-1 text-gray-400 hover:text-indigo-600"
            title={acc.is_active ? 'Desactivar' : 'Activar'}>
            {acc.is_active ? <ToggleRight size={20} className="text-indigo-600" /> : <ToggleLeft size={20} />}
          </button>
          <button onClick={() => onDelete(acc.id)}
            className="p-1 text-gray-400 hover:text-red-500" title="Eliminar">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Entity checklist */}
      {isExpanded && discovered.length > 0 && (
        <div className="px-3 pb-3 border-t border-[#EAEAEA] pt-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">
            Entidades a monitorear
          </p>
          <div className="space-y-1.5 mb-3">
            {discovered.map(entity => {
              const isChecked = pending.includes(entity.name)
              return (
                <label key={entity.name} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {
                      setPending(prev =>
                        isChecked ? prev.filter(m => m !== entity.name) : [...prev, entity.name]
                      )
                    }}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className={`text-sm ${isChecked ? 'text-gray-900' : 'text-gray-500'} group-hover:text-gray-900`}>
                    {entity.name}
                  </span>
                </label>
              )
            })}
          </div>

          {/* Select all / none */}
          <div className="flex gap-2 mb-3">
            <button onClick={() => setPending(discovered.map(e => e.name))}
              className="text-xs text-indigo-600 hover:text-indigo-700">
              Seleccionar todas
            </button>
            <span className="text-xs text-gray-300">|</span>
            <button onClick={() => setPending([])}
              className="text-xs text-gray-500 hover:text-gray-700">
              Ninguna
            </button>
          </div>

          {/* Confirm + discover button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveAndDiscover}
              disabled={saving || syncing || pending.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-md shadow-sm"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Star size={13} />}
              {isDirty ? 'Guardar y descubrir procesos' : 'Descubrir procesos'}
            </button>
            {hasSyncPending && (
              <span className="inline-flex items-center gap-1.5 text-xs text-blue-600">
                <Loader2 size={12} className="animate-spin" /> Descubriendo...
              </span>
            )}
            {syncDone && (
              <span className="text-xs text-green-600">Listo</span>
            )}
          </div>

          {/* Step 2: Contract selection */}
          {acc.last_sync_at && (
            <div className="mt-4 border-t border-[#EAEAEA] pt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                  Contratos descubiertos
                </p>
                <button
                  onClick={async () => {
                    setSyncing(true)
                    setSyncDone(false)
                    await onRequestSync(acc.id)
                  }}
                  disabled={hasSyncPending}
                  className="inline-flex items-center gap-1 text-[10px] text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                >
                  {hasSyncPending ? <Loader2 size={10} className="animate-spin" /> : <Star size={10} />}
                  Actualizar
                </button>
              </div>
              <ContractsSection key={contractsKey} accountId={acc.id} onRefresh={onRefreshProcesses} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Contracts Section (inside AccountRow) ───────────────────

function ContractsSection({ accountId, onRefresh }: { accountId: string; onRefresh: () => void }) {
  const [contracts, setContracts] = useState<AccountProcess[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [toggling, setToggling] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [estadoFilter, setEstadoFilter] = useState<string>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/secop/accounts/${accountId}/processes`)
      if (res.ok) {
        const json = await res.json()
        setContracts(json.data || [])
      }
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => { load() }, [load])

  const toggle = async (id: string, enabled: boolean) => {
    setToggling(prev => new Set([...prev, id]))
    setContracts(prev => prev?.map(c => c.id === id ? { ...c, monitoring_enabled: enabled } : c) ?? null)
    await fetch(`/api/secop/processes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monitoring_enabled: enabled }),
    })
    setToggling(prev => { const s = new Set(prev); s.delete(id); return s })
    onRefresh()
  }

  const toggleAll = async (ids: string[], enabled: boolean) => {
    for (const id of ids) {
      setToggling(prev => new Set([...prev, id]))
    }
    setContracts(prev => prev?.map(c => ids.includes(c.id) ? { ...c, monitoring_enabled: enabled } : c) ?? null)
    await Promise.all(ids.map(id =>
      fetch(`/api/secop/processes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monitoring_enabled: enabled }),
      })
    ))
    setToggling(new Set())
    onRefresh()
  }

  if (loading) {
    return <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-gray-400" /></div>
  }
  if (!contracts || contracts.length === 0) {
    return <p className="text-xs text-gray-400 py-2">No hay contratos. Selecciona entidades y haz clic en "Descubrir procesos".</p>
  }

  // Collect unique estados for filter
  const estados = [...new Set(contracts.map(c => c.estado).filter(Boolean))] as string[]

  // Filter
  const filtered = contracts.filter(c => {
    if (estadoFilter !== 'all' && c.estado !== estadoFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        c.entidad.toLowerCase().includes(q) ||
        c.objeto.toLowerCase().includes(q) ||
        (c.referencia_proceso || '').toLowerCase().includes(q) ||
        c.secop_process_id.toLowerCase().includes(q)
      )
    }
    return true
  })

  // Group by entity_name
  const grouped = new Map<string, AccountProcess[]>()
  for (const c of filtered) {
    const key = c.entity_name || 'Sin entidad'
    const list = grouped.get(key) || []
    list.push(c)
    grouped.set(key, list)
  }

  const estadoStyle = (estado: string | null): string => {
    switch (estado) {
      case 'En ejecución': case 'InExecution': return 'bg-blue-100 text-blue-800'
      case 'Cerrado': case 'Closed': return 'bg-gray-200 text-gray-700'
      case 'Terminado': case 'Terminated': return 'bg-emerald-100 text-emerald-800'
      case 'Modificación aceptada': case 'Modified': return 'bg-orange-100 text-orange-800'
      case 'Liquidado': return 'bg-violet-100 text-violet-800'
      default: return 'bg-gray-200 text-gray-700'
    }
  }

  return (
    <div className="space-y-4">
      {/* Search + filter */}
      <div className="flex gap-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por entidad, objeto o referencia..."
          className="flex-1 px-3 py-1.5 text-xs border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 placeholder:text-gray-400"
        />
        <select
          value={estadoFilter}
          onChange={e => setEstadoFilter(e.target.value)}
          className="px-2 py-1.5 text-xs border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="all">Todos los estados</option>
          {estados.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      <p className="text-[10px] text-gray-500">{filtered.length} de {contracts.length} contratos</p>

      {/* Grouped by entity_name (your company) */}
      {Array.from(grouped).map(([entityName, items]) => {
        const unmonitored = items.filter(c => !c.monitoring_enabled)
        const monCount = items.filter(c => c.monitoring_enabled).length
        return (
          <div key={entityName} className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            {/* Company header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white">
              <div>
                <p className="text-sm font-semibold">{entityName}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {monCount} de {items.length} monitoreados
                </p>
              </div>
              {unmonitored.length > 0 && (
                <button
                  onClick={() => toggleAll(unmonitored.map(c => c.id), true)}
                  className="text-xs font-medium text-indigo-400 hover:text-indigo-300 px-3 py-1 rounded-md hover:bg-white/10 transition-colors"
                >
                  Monitorear todos ({unmonitored.length})
                </button>
              )}
            </div>

            {/* Contract cards */}
            <div className="divide-y divide-gray-100">
              {items.map(c => (
                <div
                  key={c.id}
                  className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                    c.monitoring_enabled
                      ? 'bg-indigo-50/40 hover:bg-indigo-50/70'
                      : 'bg-white hover:bg-gray-50'
                  }`}
                >
                  {/* Toggle */}
                  <button
                    onClick={() => toggle(c.id, !c.monitoring_enabled)}
                    disabled={toggling.has(c.id)}
                    className="shrink-0 mt-1"
                    title={c.monitoring_enabled ? 'Desactivar monitoreo' : 'Activar monitoreo'}
                  >
                    {toggling.has(c.id)
                      ? <Loader2 size={20} className="animate-spin text-gray-400" />
                      : c.monitoring_enabled
                        ? <ToggleRight size={20} className="text-indigo-600" />
                        : <ToggleLeft size={20} className="text-gray-300 hover:text-indigo-500 transition-colors" />
                    }
                  </button>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{c.entidad}</p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{c.objeto}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {c.estado && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${estadoStyle(c.estado)}`}>
                          {c.estado}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-400">{c.referencia_proceso || c.secop_process_id}</span>
                    </div>
                  </div>

                  {/* Value */}
                  {c.valor_estimado != null && (
                    <p className="text-sm font-semibold text-gray-900 shrink-0 tabular-nums">{formatCurrency(c.valor_estimado)}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SessionStatus({ expiresAt }: { expiresAt: string | null }) {
  if (!expiresAt) return <span className="inline-flex items-center gap-1 text-[10px] text-gray-400"><span className="w-1.5 h-1.5 rounded-full bg-gray-300" />Sin sesion</span>
  const active = new Date(expiresAt).getTime() > Date.now()
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] ${active ? 'text-green-600' : 'text-red-500'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-green-500' : 'bg-red-400'}`} />
      {active ? 'Sesion activa' : 'Sesion expirada'}
    </span>
  )
}

function NewAccountForm({ onCreate, onCancel }: {
  onCreate: (name: string, username: string, password: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !username.trim() || !password) return
    onCreate(name, username, password)
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 p-4 bg-gray-50 rounded-lg border border-[#EAEAEA] space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Nombre de referencia *</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Cuenta Javier Rey" required
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Usuario SECOP *</label>
          <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="usuario123" required
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Password SECOP *</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="********" required
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
        </div>
      </div>
      <p className="text-[10px] text-gray-400">La password se encripta. Despues de guardar, corre el worker con --discover para detectar las entidades automaticamente.</p>
      <div className="flex gap-2 pt-1">
        <button type="submit"
          className="px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-md shadow-sm">
          Guardar cuenta
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
          Cancelar
        </button>
      </div>
    </form>
  )
}

// ── Add Process Modal ───────────────────────────────────────

function AddProcessModal({ onAdd, onClose }: {
  onAdd: (input: string) => Promise<{ message?: string; error?: string }>
  onClose: () => void
}) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ message?: string; error?: string } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    setLoading(true)
    setResult(null)
    const res = await onAdd(input.trim())
    setResult(res)
    setLoading(false)
    if (!res.error) {
      setTimeout(onClose, 1500)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Agregar proceso</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">URL de SECOP, NTC ID o referencia del proceso</label>
            <input type="text" value={input} onChange={e => setInput(e.target.value)}
              placeholder="https://community.secop.gov.co/... o CO1.NTC.5398889"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
            <p className="text-[10px] text-gray-400 mt-1">Se busca primero en la API publica de SECOP. Si no se encuentra, se crea un registro minimo.</p>
          </div>

          {result && (
            <div className={`p-3 rounded-lg text-sm ${result.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              {result.error || result.message}
            </div>
          )}

          <div className="flex gap-2">
            <button type="submit" disabled={loading || !input.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-md shadow-sm disabled:opacity-50">
              {loading ? <Loader2 size={14} className="animate-spin" /> : 'Agregar'}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────

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
