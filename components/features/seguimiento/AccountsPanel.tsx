'use client'

import { useState, useCallback, useEffect } from 'react'
import { Plus, Loader2, Star, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'
import type { Account, AccountProcess } from './types'
import { timeAgo, estadoStyle } from './helpers'

export default function AccountsPanel({ accounts, onToggle, onDelete, onCreate, onUpdateEntities, onRequestSync, onRefreshAccounts, onRefreshProcesses }: {
  accounts: Account[]
  onToggle: (id: string, active: boolean) => void
  onDelete: (id: string) => void
  onCreate: (name: string, username: string, password: string) => void
  onUpdateEntities: (id: string, monitored: string[]) => void
  onRequestSync: (id: string) => Promise<void>
  onRefreshAccounts: () => Promise<void>
  onRefreshProcesses: () => void
}) {
  const [showNew, setShowNew] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Pull estado fresco cuando el panel se abre: cubre el caso en que el worker
  // sincronizó mientras el usuario no estaba mirando este panel.
  useEffect(() => {
    onRefreshAccounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
              onRefreshAccounts={onRefreshAccounts}
              onRefreshProcesses={onRefreshProcesses}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AccountRow({ acc, isExpanded, onExpand, onToggle, onDelete, onUpdateEntities, onRequestSync, onRefreshAccounts, onRefreshProcesses }: {
  acc: Account
  isExpanded: boolean
  onExpand: () => void
  onToggle: (id: string, active: boolean) => void
  onDelete: (id: string) => void
  onUpdateEntities: (id: string, monitored: string[]) => void
  onRequestSync: (id: string) => Promise<void>
  onRefreshAccounts: () => Promise<void>
  onRefreshProcesses: () => void
}) {
  const discovered = acc.discovered_entities || []
  const [pending, setPending] = useState<string[]>(acc.monitored_entities || [])
  const [syncing, setSyncing] = useState(Boolean(acc.sync_requested_at))
  const [syncDone, setSyncDone] = useState(false)
  const [saving, setSaving] = useState(false)
  const [contractsKey, setContractsKey] = useState(0)

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
        // Re-fetch cuentas en el padre para propagar cookies_expire_at,
        // discovered_entities, process_count frescos al resto del UI.
        await onRefreshAccounts()
        onRefreshProcesses()
        setTimeout(() => setSyncDone(false), 5000)
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [syncing, acc.id, onRefreshAccounts, onRefreshProcesses])

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
                {pending.length}/{discovered.length} entidades
              </span>
            )}
            {acc.process_count > 0 && (
              <span className="text-xs text-gray-400">{acc.process_count} contratos</span>
            )}
            {syncing && (
              <span className="inline-flex items-center gap-1 text-[10px] text-blue-600">
                <Loader2 size={10} className="animate-spin" /> Descubriendo...
              </span>
            )}
            {acc.last_sync_at && !syncing && (
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

      {isExpanded && (
        <div className="px-3 pb-3 border-t border-[#EAEAEA] pt-3">
          {/* Entity selection */}
          {discovered.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">
                Entidades a monitorear
              </p>
              <div className="space-y-1.5 mb-3 max-h-[200px] overflow-y-auto">
                {discovered.map(entity => {
                  const isChecked = pending.includes(entity.name)
                  return (
                    <label key={entity.name} className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => setPending(prev =>
                          isChecked ? prev.filter(m => m !== entity.name) : [...prev, entity.name]
                        )}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className={`text-sm ${isChecked ? 'text-gray-900' : 'text-gray-500'} group-hover:text-gray-900`}>
                        {entity.name}
                      </span>
                    </label>
                  )
                })}
              </div>
              <div className="flex gap-2 mb-3">
                <button onClick={() => setPending(discovered.map(e => e.name))}
                  className="text-xs text-indigo-600 hover:text-indigo-700">Seleccionar todas</button>
                <span className="text-xs text-gray-300">|</span>
                <button onClick={() => setPending([])}
                  className="text-xs text-gray-500 hover:text-gray-700">Ninguna</button>
              </div>
            </div>
          )}

          {/* Discover button */}
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={handleSaveAndDiscover}
              disabled={saving || syncing || (discovered.length > 0 && pending.length === 0)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-md shadow-sm"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Star size={13} />}
              {isDirty
                ? 'Guardar y descubrir'
                : discovered.length === 0
                  ? 'Descubrir entidades'
                  : 'Descubrir procesos'}
            </button>
            {discovered.length === 0 && !syncing && (
              <span className="text-xs text-gray-500">
                Primer sync: inicia sesión y descubre las entidades disponibles
              </span>
            )}
            {syncing && (
              <span className="inline-flex items-center gap-1.5 text-xs text-blue-600">
                <Loader2 size={12} className="animate-spin" /> Descubriendo...
              </span>
            )}
            {syncDone && <span className="text-xs text-green-600">Listo</span>}
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                Contratos descubiertos
              </p>
              {acc.last_sync_at && (
                <button
                  onClick={handleSaveAndDiscover}
                  disabled={syncing}
                  className="inline-flex items-center gap-1 text-[10px] text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                >
                  {syncing ? <Loader2 size={10} className="animate-spin" /> : <Star size={10} />}
                  Actualizar
                </button>
              )}
            </div>
            <ContractsSection key={contractsKey} accountId={acc.id} onRefresh={onRefreshProcesses} />
          </div>
        </div>
      )}
    </div>
  )
}

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
    return <p className="text-xs text-gray-400 py-2">No hay contratos. Haz clic en "Descubrir procesos".</p>
  }

  const estados = [...new Set(contracts.map(c => c.estado).filter(Boolean))] as string[]
  const filtered = contracts.filter(c => {
    if (estadoFilter !== 'all' && c.estado !== estadoFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        c.entidad.toLowerCase().includes(q) ||
        (c.custom_name || '').toLowerCase().includes(q) ||
        c.objeto.toLowerCase().includes(q) ||
        (c.referencia_proceso || '').toLowerCase().includes(q) ||
        c.secop_process_id.toLowerCase().includes(q)
      )
    }
    return true
  })

  const unmonitored = filtered.filter(c => !c.monitoring_enabled)
  const monCount = filtered.filter(c => c.monitoring_enabled).length

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
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

      <div className="flex items-center justify-between">
        <p className="text-[10px] text-gray-500">{monCount} de {filtered.length} monitoreados</p>
        {unmonitored.length > 0 && (
          <button
            onClick={() => toggleAll(unmonitored.map(c => c.id), true)}
            className="text-[10px] font-medium text-indigo-600 hover:text-indigo-700"
          >
            Monitorear todos ({unmonitored.length})
          </button>
        )}
      </div>

      <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm divide-y divide-gray-100">
        {filtered.map(c => (
          <div
            key={c.id}
            className={`flex items-start gap-3 px-4 py-3 transition-colors ${
              c.monitoring_enabled
                ? 'bg-indigo-50/40 hover:bg-indigo-50/70'
                : 'bg-white hover:bg-gray-50'
            }`}
          >
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

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{c.custom_name || c.entidad}</p>
              {c.custom_name && <p className="text-[10px] text-gray-400 mt-0.5 truncate">{c.entidad}</p>}
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

            {c.valor_estimado != null && (
              <p className="text-sm font-semibold text-gray-900 shrink-0 tabular-nums">{formatCurrency(c.valor_estimado)}</p>
            )}
          </div>
        ))}
      </div>
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
      <p className="text-[10px] text-gray-400">La password se encripta. Despues de guardar, haz clic en "Descubrir procesos".</p>
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
