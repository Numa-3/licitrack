'use client'

import { useState, useCallback } from 'react'
import { formatCurrency } from '@/lib/utils/format'
import {
  Eye, AlertTriangle, Clock, Plus, X,
  ChevronLeft, ChevronRight, Loader2,
  ToggleLeft, ToggleRight, Bell, Activity,
  type LucideIcon,
} from 'lucide-react'
import type { Process, Change, Account, WorkerStatus } from './seguimiento/types'
import { timeAgo } from './seguimiento/helpers'
import ChangesTimeline from './seguimiento/ChangesTimeline'
import DetailPanel from './seguimiento/DetailPanel'
import AccountsPanel from './seguimiento/AccountsPanel'

type Tab = 'all' | 'urgent' | 'changes'
const PAGE_SIZE = 50

type Props = {
  initialProcesses: Process[]
  initialCount: number
  initialChanges: Change[]
  initialAccounts: Account[]
  urgentCount: number
  workerStatus: WorkerStatus
  userRole: string
}

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

  const [showAccounts, setShowAccounts] = useState(false)
  const [showAddProcess, setShowAddProcess] = useState(false)
  const [selected, setSelected] = useState<Process | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null)

  const showToast = (message: string, type: 'error' | 'success' = 'error') => {
    setToast({ message, type })
    // Errors stay longer so the user can read the backend detail
    setTimeout(() => setToast(null), type === 'error' ? 10_000 : 4000)
  }

  // ── Fetch ──────────────────────────────────────────────────

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

  // Re-pull cuenta(s) después de que el worker sincroniza: trae
  // cookies_expire_at / discovered_entities / process_count frescos para
  // que el UI refleje "Sesión activa", entidades descubiertas, etc.
  const refreshAccounts = useCallback(async () => {
    const res = await fetch('/api/secop/accounts').catch(() => null)
    if (!res?.ok) return
    const fresh = await res.json() as Account[]
    setAccounts(fresh)
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

  // ── Accounts CRUD ──────────────────────────────────────────

  const createAccount = async (name: string, username: string, password: string) => {
    const res = await fetch('/api/secop/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, username, password }),
    })
    if (!res.ok) {
      let msg = `Error al crear cuenta (HTTP ${res.status})`
      try {
        const body = await res.json()
        if (body?.error) msg = `Error al crear cuenta: ${body.error}`
      } catch { /* body no era JSON */ }
      console.error('[createAccount]', msg)
      showToast(msg)
      return
    }
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
      setProcesses(prev)
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

  const addManualProcess = async (input: string, tipo: 'precontractual' | 'contractual') => {
    const url = tipo === 'precontractual'
      ? '/api/secop/processes/precontractual'
      : '/api/secop/processes/manual'
    const res = await fetch(url, {
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

  // ── Render ─────────────────────────────────────────────────

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
        <div className={`fixed top-4 right-4 z-[60] px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium transition-all max-w-md whitespace-normal break-words ${
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
        <KpiCard label="Monitoreados" value={String(totalCount)} icon={Eye}
          iconColor="bg-blue-50 text-blue-600 ring-1 ring-blue-500/10"
          detail={`${accounts.filter(a => a.is_active).length} cuenta${accounts.filter(a => a.is_active).length !== 1 ? 's' : ''} activa${accounts.filter(a => a.is_active).length !== 1 ? 's' : ''}`}
        />
        <KpiCard label="Proximos 48h" value={String(urgentCount)} icon={AlertTriangle}
          iconColor="bg-amber-50 text-amber-600 ring-1 ring-amber-500/10"
          detail={urgentCount > 0 ? 'Requiere atencion' : 'Sin urgencias'}
          urgent={urgentCount > 0}
        />
        <KpiCard label="Cambios hoy" value={String(todayChanges.length)} icon={Bell}
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
          onRefreshAccounts={refreshAccounts}
          onRefreshProcesses={() => fetchProcesses(activeTab === 'changes' ? 'all' : activeTab, page * PAGE_SIZE)}
        />
      )}

      {/* Add Process Modal */}
      {showAddProcess && (
        <AddProcessModal onAdd={addManualProcess} onClose={() => setShowAddProcess(false)} />
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
          <ProcessTable
            processes={processes}
            onSelect={setSelected}
            onToggleMonitoring={toggleMonitoring}
          />
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-500">Pagina {page + 1} de {totalPages}</p>
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

      {selected && <DetailPanel process={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

// ── Small components (kept inline — not worth extracting) ────

function KpiCard({ label, value, icon: Icon, iconColor, detail, urgent }: {
  label: string; value: string; icon: LucideIcon; iconColor: string; detail: string; urgent?: boolean
}) {
  return (
    <div className="bg-white border border-[#EAEAEA] rounded-xl p-5 flex flex-col hover:border-gray-300 transition-colors"
      style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-medium text-gray-500">{label}</h3>
        <div className={`p-1.5 rounded-md ${iconColor}`}><Icon size={14} /></div>
      </div>
      <span className={`text-3xl font-semibold tracking-tight ${urgent ? 'text-amber-600' : 'text-gray-900'}`}>{value}</span>
      <span className="text-xs text-gray-400 mt-2">{detail}</span>
    </div>
  )
}

function WorkerStatusCard({ status }: { status: WorkerStatus }) {
  if (!status) {
    return (
      <div className="bg-white border border-[#EAEAEA] rounded-xl p-5 flex flex-col" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-medium text-gray-500">Worker</h3>
          <div className="p-1.5 rounded-md bg-gray-50 text-gray-400 ring-1 ring-gray-200"><Activity size={14} /></div>
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
        <div className="p-1.5 rounded-md bg-gray-50 text-gray-600 ring-1 ring-gray-200"><Activity size={14} /></div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        <span className="text-lg font-semibold text-gray-900">{statusLabel}</span>
      </div>
      <span className="text-xs text-gray-400 mt-2">{ago} &middot; {status.processes_checked} revisados, {status.changes_found} cambios</span>
    </div>
  )
}

function ProcessTable({ processes, onSelect, onToggleMonitoring }: {
  processes: Process[]
  onSelect: (p: Process) => void
  onToggleMonitoring: (id: string, enabled: boolean) => void
}) {
  return (
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
              <tr key={p.id} onClick={() => onSelect(p)}
                className={`hover:bg-gray-50/80 cursor-pointer transition-colors ${!p.monitoring_enabled ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 max-w-[300px]">
                  <p className="font-medium text-gray-900 truncate">{p.entidad}</p>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{p.objeto}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <SourceBadge source={p.source} />
                    {p.api_pending && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ring-1 ring-inset bg-amber-50 text-amber-700 ring-amber-600/20">
                        <Loader2 size={10} className="animate-spin" /> Enriqueciendo
                      </span>
                    )}
                    {p.referencia_proceso && <span className="text-[10px] text-gray-400">{p.referencia_proceso}</span>}
                  </div>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  <span className="text-xs text-gray-500">{p.secop_accounts?.name || '—'}</span>
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
                  <button onClick={() => onToggleMonitoring(p.id, !p.monitoring_enabled)}
                    title={p.monitoring_enabled ? 'Desactivar seguimiento' : 'Activar seguimiento'}
                    className="transition-colors">
                    {p.monitoring_enabled
                      ? <ToggleRight size={22} className="text-indigo-600" />
                      : <ToggleLeft size={22} className="text-gray-300" />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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

function DeadlineBadge({ deadline, label }: { deadline: string | null; label: string | null }) {
  if (!deadline) return <span className="text-xs text-gray-400">Sin monitoreo aun</span>
  const now = Date.now()
  const deadlineMs = new Date(deadline).getTime()
  const hoursLeft = Math.round((deadlineMs - now) / (60 * 60 * 1000))
  const isPast = deadlineMs < now
  const isUrgent = !isPast && hoursLeft < 48
  const dateStr = new Date(deadline).toLocaleDateString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
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

function EmptyState({ hasAccounts, onShowAccounts }: { hasAccounts: boolean; onShowAccounts: () => void }) {
  return (
    <div className="text-center py-20">
      <Eye size={40} className="mx-auto text-gray-300 mb-3" />
      {hasAccounts ? (
        <>
          <h3 className="text-base font-medium text-gray-900">Sin procesos monitoreados</h3>
          <p className="text-sm text-gray-500 mt-1">El worker descubrira procesos automaticamente en el proximo ciclo, o agrega uno manualmente.</p>
        </>
      ) : (
        <>
          <h3 className="text-base font-medium text-gray-900">Configura tu primera cuenta SECOP</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">Agrega una cuenta de SECOP para que el worker descubra automaticamente tus procesos y contratos.</p>
          <button onClick={onShowAccounts}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-md shadow-sm">
            <Plus size={16} /> Agregar cuenta
          </button>
        </>
      )}
    </div>
  )
}

function AddProcessModal({ onAdd, onClose }: {
  onAdd: (input: string, tipo: 'precontractual' | 'contractual') => Promise<{ message?: string; error?: string }>
  onClose: () => void
}) {
  const [input, setInput] = useState('')
  const [tipo, setTipo] = useState<'precontractual' | 'contractual'>('precontractual')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ message?: string; error?: string } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    setLoading(true)
    setResult(null)
    const res = await onAdd(input.trim(), tipo)
    setResult(res)
    setLoading(false)
    if (!res.error) setTimeout(onClose, 1500)
  }

  const isPrecontractual = tipo === 'precontractual'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Agregar proceso precontractual</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs text-gray-500 -mt-1">
            Los contratos ya adjudicados en tus cuentas SECOP se descubren automáticamente.
            Esta opción es para trackear procesos públicos abiertos (sin adjudicar).
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {isPrecontractual ? 'Link público del proceso (OpportunityDetail)' : 'URL de SECOP, NTC ID o referencia del proceso'}
            </label>
            <input type="text" value={input} onChange={e => setInput(e.target.value)}
              placeholder={isPrecontractual
                ? 'https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=CO1.NTC.xxxxxxx'
                : 'https://community.secop.gov.co/... o CO1.NTC.5398889'}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
            <p className="text-[10px] text-gray-400 mt-1">
              {isPrecontractual
                ? 'Usa la API pública SECOP II (sin login). Trackea cronograma, estado, fase y adjudicación.'
                : 'Forzar carga manual de un contrato adjudicado. Requiere cuenta SECOP configurada para monitorear las 6 pestañas.'}
            </p>
          </div>
          <div className="border-t border-gray-100 pt-3">
            <button type="button" onClick={() => {
              setShowAdvanced(v => !v)
              if (showAdvanced) setTipo('precontractual')
            }}
              className="text-[11px] text-gray-500 hover:text-gray-700 flex items-center gap-1">
              {showAdvanced ? '▼' : '▶'} Opciones avanzadas
            </button>
            {showAdvanced && (
              <div className="mt-2 space-y-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" checked={tipo === 'precontractual'}
                    onChange={() => setTipo('precontractual')} className="mt-0.5" />
                  <div>
                    <div className="text-xs font-medium text-gray-800">Precontractual</div>
                    <div className="text-[10px] text-gray-500">Proceso público, sin adjudicar (default)</div>
                  </div>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" checked={tipo === 'contractual'}
                    onChange={() => setTipo('contractual')} className="mt-0.5" />
                  <div>
                    <div className="text-xs font-medium text-gray-800">Forzar contrato manual</div>
                    <div className="text-[10px] text-gray-500">Solo si el discovery lo saltó o para re-activar monitoreo</div>
                  </div>
                </label>
              </div>
            )}
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
