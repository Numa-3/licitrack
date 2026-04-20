'use client'

import { useState, useCallback } from 'react'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import {
  Search, ExternalLink, Eye, Star, X, Plus,
  ChevronLeft, ChevronRight, ToggleLeft, ToggleRight,
  Trash2, Loader2,
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
  fecha_publicacion: string | null
  fecha_ultima_pub: string | null
  url_publica: string | null
  departamento: string | null
  municipio: string | null
  radar_state: 'new' | 'reviewing' | 'followed' | 'dismissed'
  first_seen_at: string
  last_seen_at: string
}

type WatchRule = {
  id: string
  name: string
  enabled: boolean
  rule_json: {
    keywords?: string[]
    exclude_keywords?: string[]
    entities?: string[]
    entity_nits?: string[]
    departments?: string[]
    municipalities?: string[]
    modalities?: string[]
    states?: string[]
    contract_types?: string[]
    min_value?: number | null
    max_value?: number | null
    days_back?: number | null
    published_after?: string | null
  }
  created_at: string
}

type Props = {
  initialProcesses: Process[]
  initialCount: number
  initialRules: WatchRule[]
  userRole: string
}

type Tab = 'new' | 'reviewing' | 'followed' | 'dismissed' | 'all'

// ── Constants ───────────────────────────────────────────────

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'new', label: 'Nuevos' },
  { key: 'reviewing', label: 'En revision' },
  { key: 'followed', label: 'Seguidos' },
  { key: 'dismissed', label: 'Descartados' },
]

const STATE_COLORS: Record<string, string> = {
  new: 'bg-blue-50 text-blue-700',
  reviewing: 'bg-yellow-50 text-yellow-700',
  followed: 'bg-green-50 text-green-700',
  dismissed: 'bg-gray-100 text-gray-500',
}

const STATE_LABELS: Record<string, string> = {
  new: 'Nuevo',
  reviewing: 'En revision',
  followed: 'Seguido',
  dismissed: 'Descartado',
}

const PAGE_SIZE = 50

// ── Component ───────────────────────────────────────────────

export default function SecopRadarClient({ initialProcesses, initialCount, initialRules, userRole }: Props) {
  const isJefe = userRole === 'jefe'

  // Process state
  const [processes, setProcesses] = useState<Process[]>(initialProcesses)
  const [totalCount, setTotalCount] = useState(initialCount)
  const [activeTab, setActiveTab] = useState<Tab>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)

  // Watch rules state
  const [rules, setRules] = useState<WatchRule[]>(initialRules)
  const [showRules, setShowRules] = useState(false)
  const [showNewRule, setShowNewRule] = useState(false)

  // Detail panel
  const [selected, setSelected] = useState<Process | null>(null)

  // ── Fetch processes ─────────────────────────────────────

  const fetchProcesses = useCallback(async (tab: Tab, q: string, offset: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) })
      if (tab !== 'all') params.set('radar_state', tab)
      if (q.trim()) params.set('q', q.trim())

      const res = await fetch(`/api/secop/processes?${params}`)
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
    fetchProcesses(tab, search, 0)
  }

  const handleSearch = () => {
    setPage(0)
    fetchProcesses(activeTab, search, 0)
  }

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    fetchProcesses(activeTab, search, newPage * PAGE_SIZE)
  }

  // ── Update radar state ──────────────────────────────────

  const updateRadarState = async (processId: string, newState: string) => {
    const res = await fetch(`/api/secop/processes/${processId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ radar_state: newState }),
    })
    if (res.ok) {
      setProcesses(prev =>
        prev.map(p => p.id === processId ? { ...p, radar_state: newState as Process['radar_state'] } : p)
      )
      if (selected?.id === processId) {
        setSelected(prev => prev ? { ...prev, radar_state: newState as Process['radar_state'] } : null)
      }
    }
  }

  // ── Watch rules CRUD ────────────────────────────────────

  const toggleRule = async (ruleId: string, enabled: boolean) => {
    const res = await fetch(`/api/secop/watch-rules/${ruleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    })
    if (res.ok) {
      setRules(prev => prev.map(r => r.id === ruleId ? { ...r, enabled } : r))
    }
  }

  const deleteRule = async (ruleId: string) => {
    const res = await fetch(`/api/secop/watch-rules/${ruleId}`, { method: 'DELETE' })
    if (res.ok) {
      setRules(prev => prev.filter(r => r.id !== ruleId))
    }
  }

  const createRule = async (name: string, ruleJson: WatchRule['rule_json']) => {
    const res = await fetch('/api/secop/watch-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, rule_json: ruleJson }),
    })
    if (res.ok) {
      const newRule = await res.json()
      setRules(prev => [newRule, ...prev])
      setShowNewRule(false)
    }
  }

  // ── Render ──────────────────────────────────────────────

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Radar SECOP II</h1>
          <p className="text-sm text-gray-500 mt-1">
            {totalCount} proceso{totalCount !== 1 ? 's' : ''} detectado{totalCount !== 1 ? 's' : ''}
          </p>
        </div>
        {isJefe && (
          <button
            onClick={() => setShowRules(!showRules)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
          >
            Reglas de busqueda ({rules.filter(r => r.enabled).length} activa{rules.filter(r => r.enabled).length !== 1 ? 's' : ''})
          </button>
        )}
      </div>

      {/* Watch Rules Panel */}
      {showRules && isJefe && (
        <WatchRulesPanel
          rules={rules}
          onToggle={toggleRule}
          onDelete={deleteRule}
          onCreate={createRule}
          showNew={showNewRule}
          setShowNew={setShowNewRule}
        />
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por objeto, entidad o referencia..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <button
          onClick={handleSearch}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
        >
          Buscar
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : processes.length === 0 ? (
        <EmptyState hasRules={rules.length > 0} onShowRules={() => setShowRules(true)} />
      ) : (
        <>
          {/* Process Table */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Entidad</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Objeto</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 hidden lg:table-cell">Modalidad</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Valor est.</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Estado</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Radar</th>
                    {isJefe && <th className="text-center px-4 py-3 font-medium text-gray-500 w-28">Acciones</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {processes.map(p => (
                    <tr
                      key={p.id}
                      onClick={() => setSelected(p)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 max-w-[200px]">
                        <p className="font-medium text-gray-900 truncate">{p.entidad}</p>
                        {p.departamento && (
                          <p className="text-xs text-gray-400 truncate">{p.departamento}{p.municipio ? ` — ${p.municipio}` : ''}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-[300px]">
                        <p className="text-gray-700 line-clamp-2">{p.objeto}</p>
                        {p.referencia_proceso && (
                          <p className="text-xs text-gray-400 mt-0.5">{p.referencia_proceso}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-gray-600">{p.modalidad || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-right hidden md:table-cell whitespace-nowrap">
                        {formatCurrency(p.valor_estimado)}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-gray-600 text-xs">{p.estado_resumen || p.fase || '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATE_COLORS[p.radar_state]}`}>
                          {STATE_LABELS[p.radar_state]}
                        </span>
                      </td>
                      {isJefe && (
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            {p.radar_state !== 'followed' && (
                              <button
                                onClick={() => updateRadarState(p.id, 'followed')}
                                title="Seguir"
                                className="p-1 text-gray-400 hover:text-green-600 rounded"
                              >
                                <Star size={16} />
                              </button>
                            )}
                            {p.radar_state !== 'reviewing' && p.radar_state !== 'followed' && (
                              <button
                                onClick={() => updateRadarState(p.id, 'reviewing')}
                                title="Revisar"
                                className="p-1 text-gray-400 hover:text-yellow-600 rounded"
                              >
                                <Eye size={16} />
                              </button>
                            )}
                            {p.radar_state !== 'dismissed' && (
                              <button
                                onClick={() => updateRadarState(p.id, 'dismissed')}
                                title="Descartar"
                                className="p-1 text-gray-400 hover:text-red-500 rounded"
                              >
                                <X size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
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
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page === 0}
                  className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages - 1}
                  className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail Panel (slide-over) */}
      {selected && (
        <DetailPanel
          process={selected}
          isJefe={isJefe}
          onClose={() => setSelected(null)}
          onStateChange={(state) => updateRadarState(selected.id, state)}
        />
      )}
    </div>
  )
}

// ── Empty State ─────────────────────────────────────────────

function EmptyState({ hasRules, onShowRules }: { hasRules: boolean; onShowRules: () => void }) {
  return (
    <div className="text-center py-20">
      <div className="text-6xl mb-4">📡</div>
      {hasRules ? (
        <>
          <h3 className="text-lg font-medium text-gray-900">Sin procesos detectados</h3>
          <p className="text-sm text-gray-500 mt-1">
            Las reglas de busqueda estan configuradas pero aun no se ha ejecutado el polling.
          </p>
        </>
      ) : (
        <>
          <h3 className="text-lg font-medium text-gray-900">Configura tu primera regla</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
            Crea una regla de busqueda para que el radar detecte automaticamente procesos de SECOP II que te interesen.
          </p>
          <button
            onClick={onShowRules}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
          >
            <Plus size={16} />
            Crear regla
          </button>
        </>
      )}
    </div>
  )
}

// ── Detail Panel ────────────────────────────────────────────

function DetailPanel({
  process: p,
  isJefe,
  onClose,
  onStateChange,
}: {
  process: Process
  isJefe: boolean
  onClose: () => void
  onStateChange: (state: string) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-lg bg-white h-full overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 truncate pr-4">Detalle del proceso</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Estado radar */}
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATE_COLORS[p.radar_state]}`}>
              {STATE_LABELS[p.radar_state]}
            </span>
            {p.referencia_proceso && (
              <span className="text-xs text-gray-400">{p.referencia_proceso}</span>
            )}
          </div>

          {/* Entidad */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Entidad</label>
            <p className="mt-1 text-sm text-gray-900 font-medium">{p.entidad}</p>
            {(p.departamento || p.municipio) && (
              <p className="text-xs text-gray-500">{[p.departamento, p.municipio].filter(Boolean).join(' — ')}</p>
            )}
          </div>

          {/* Objeto */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Objeto</label>
            <p className="mt-1 text-sm text-gray-700">{p.descripcion || p.objeto}</p>
          </div>

          {/* Grid de datos */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Modalidad" value={p.modalidad} />
            <Field label="Tipo contrato" value={p.tipo_contrato} />
            <Field label="Fase" value={p.fase} />
            <Field label="Estado" value={p.estado_resumen || p.estado} />
            <Field label="Valor estimado" value={formatCurrency(p.valor_estimado)} />
            <Field label="Fecha publicacion" value={formatDate(p.fecha_publicacion)} />
            <Field label="Ultima actualizacion" value={formatDate(p.fecha_ultima_pub)} />
            <Field label="Detectado" value={formatDate(p.first_seen_at)} />
          </div>

          {/* Link SECOP */}
          {p.url_publica && (
            <a
              href={p.url_publica}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700"
            >
              <ExternalLink size={14} />
              Ver en SECOP II
            </a>
          )}

          {/* Actions */}
          {isJefe && (
            <div className="pt-4 border-t border-gray-200 flex flex-wrap gap-2">
              {p.radar_state !== 'followed' && (
                <button
                  onClick={() => onStateChange('followed')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-green-50 text-green-700 hover:bg-green-100"
                >
                  <Star size={14} /> Seguir
                </button>
              )}
              {p.radar_state !== 'reviewing' && (
                <button
                  onClick={() => onStateChange('reviewing')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-yellow-50 text-yellow-700 hover:bg-yellow-100"
                >
                  <Eye size={14} /> Revisar
                </button>
              )}
              {p.radar_state !== 'dismissed' && (
                <button
                  onClick={() => onStateChange('dismissed')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                >
                  <X size={14} /> Descartar
                </button>
              )}
              {p.radar_state !== 'new' && (
                <button
                  onClick={() => onStateChange('new')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"
                >
                  Restablecer
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</label>
      <p className="mt-0.5 text-sm text-gray-800">{value || '—'}</p>
    </div>
  )
}

// ── Watch Rules Panel ───────────────────────────────────────

function WatchRulesPanel({
  rules,
  onToggle,
  onDelete,
  onCreate,
  showNew,
  setShowNew,
}: {
  rules: WatchRule[]
  onToggle: (id: string, enabled: boolean) => void
  onDelete: (id: string) => void
  onCreate: (name: string, ruleJson: WatchRule['rule_json']) => void
  showNew: boolean
  setShowNew: (v: boolean) => void
}) {
  return (
    <div className="mb-6 bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-gray-900">Reglas de busqueda</h3>
        <button
          onClick={() => setShowNew(!showNew)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg"
        >
          <Plus size={14} /> Nueva regla
        </button>
      </div>

      {showNew && <NewRuleForm onCreate={onCreate} onCancel={() => setShowNew(false)} />}

      {rules.length === 0 ? (
        <p className="text-sm text-gray-500 py-4 text-center">
          No hay reglas configuradas. Crea una para activar el radar.
        </p>
      ) : (
        <div className="space-y-2">
          {rules.map(rule => (
            <div
              key={rule.id}
              className={`flex items-center justify-between p-3 rounded-lg border ${
                rule.enabled ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className={`font-medium text-sm ${rule.enabled ? 'text-gray-900' : 'text-gray-400'}`}>
                  {rule.name}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {summarizeRule(rule.rule_json)}
                </p>
              </div>
              <div className="flex items-center gap-2 ml-3">
                <button
                  onClick={() => onToggle(rule.id, !rule.enabled)}
                  className="p-1 text-gray-400 hover:text-indigo-600"
                  title={rule.enabled ? 'Desactivar' : 'Activar'}
                >
                  {rule.enabled ? <ToggleRight size={20} className="text-indigo-600" /> : <ToggleLeft size={20} />}
                </button>
                <button
                  onClick={() => onDelete(rule.id)}
                  className="p-1 text-gray-400 hover:text-red-500"
                  title="Eliminar"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function summarizeRule(rule: WatchRule['rule_json']): string {
  const parts: string[] = []
  if (rule.keywords?.length) parts.push(`palabras: ${rule.keywords.join(', ')}`)
  if (rule.departments?.length) parts.push(`depto: ${rule.departments.join(', ')}`)
  if (rule.entities?.length) parts.push(`entidad: ${rule.entities.join(', ')}`)
  if (rule.modalities?.length) parts.push(`modalidad: ${rule.modalities.join(', ')}`)
  if (rule.min_value != null || rule.max_value != null) {
    const min = rule.min_value != null ? formatCurrency(rule.min_value) : '0'
    const max = rule.max_value != null ? formatCurrency(rule.max_value) : '...'
    parts.push(`valor: ${min} — ${max}`)
  }
  if (rule.days_back != null) parts.push(`últimos ${rule.days_back} días`)
  else if (rule.published_after) parts.push(`desde ${rule.published_after}`)
  return parts.length > 0 ? parts.join(' | ') : 'Sin filtros'
}

// ── New Rule Form ───────────────────────────────────────────

function NewRuleForm({
  onCreate,
  onCancel,
}: {
  onCreate: (name: string, ruleJson: WatchRule['rule_json']) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [keywords, setKeywords] = useState('')
  const [excludeKeywords, setExcludeKeywords] = useState('')
  const [departments, setDepartments] = useState('')
  const [entities, setEntities] = useState('')
  const [modalities, setModalities] = useState('')
  const [minValue, setMinValue] = useState('')
  const [maxValue, setMaxValue] = useState('')
  const [daysBack, setDaysBack] = useState('90')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    const ruleJson: WatchRule['rule_json'] = {}
    if (keywords.trim()) ruleJson.keywords = keywords.split(',').map(s => s.trim()).filter(Boolean)
    if (excludeKeywords.trim()) ruleJson.exclude_keywords = excludeKeywords.split(',').map(s => s.trim()).filter(Boolean)
    if (departments.trim()) ruleJson.departments = departments.split(',').map(s => s.trim()).filter(Boolean)
    if (entities.trim()) ruleJson.entities = entities.split(',').map(s => s.trim()).filter(Boolean)
    if (modalities.trim()) ruleJson.modalities = modalities.split(',').map(s => s.trim()).filter(Boolean)
    if (minValue) ruleJson.min_value = Number(minValue)
    if (maxValue) ruleJson.max_value = Number(maxValue)
    if (daysBack) ruleJson.days_back = Number(daysBack)

    onCreate(name, ruleJson)
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Nombre de la regla *</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ej: Suministros Amazonas"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          required
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Palabras clave (separadas por coma)</label>
          <input
            type="text"
            value={keywords}
            onChange={e => setKeywords(e.target.value)}
            placeholder="suministro, mantenimiento"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Excluir palabras</label>
          <input
            type="text"
            value={excludeKeywords}
            onChange={e => setExcludeKeywords(e.target.value)}
            placeholder="consultoria, asesoria"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Departamentos</label>
          <input
            type="text"
            value={departments}
            onChange={e => setDepartments(e.target.value)}
            placeholder="Amazonas, Putumayo"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Entidades</label>
          <input
            type="text"
            value={entities}
            onChange={e => setEntities(e.target.value)}
            placeholder="ICBF, SENA"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Modalidades</label>
          <input
            type="text"
            value={modalities}
            onChange={e => setModalities(e.target.value)}
            placeholder="Licitacion publica, Minima cuantia"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">Valor minimo</label>
            <input
              type="number"
              value={minValue}
              onChange={e => setMinValue(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">Valor maximo</label>
            <input
              type="number"
              value={maxValue}
              onChange={e => setMaxValue(e.target.value)}
              placeholder="Sin limite"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Publicados en los últimos N días
            <span className="ml-1 font-normal text-gray-400">(deja en blanco para sin límite)</span>
          </label>
          <input
            type="number"
            value={daysBack}
            onChange={e => setDaysBack(e.target.value)}
            placeholder="90"
            min="1"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <p className="text-xs text-gray-400 mt-1">Recomendado: 30–90 días para evitar resultados históricos.</p>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
        >
          Crear regla
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}

