'use client'

import { useState, useEffect } from 'react'

// ── Types ──────────────────────────────────────────────────────
type Profile = { id: string; name: string }
type Contract = { id: string; name: string }

type Task = {
  id: string
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'done'
  priority: 'low' | 'normal' | 'high' | 'urgent'
  color: string
  position: number
  assigned_to: string | null
  contract_id: string | null
  due_date: string | null
  completed_at: string | null
  created_by: string
  created_at: string
  creator: Profile | null
  assignee: Profile | null
  contract: Contract | null
}

type Props = {
  currentUserId: string
  userRole: string
  profiles: Profile[]
  contracts: Contract[]
}

// ── Constants ─────────────────────────────────────────────────
const COLUMNS: { key: Task['status']; label: string }[] = [
  { key: 'pending', label: 'Pendiente' },
  { key: 'in_progress', label: 'En Progreso' },
  { key: 'done', label: 'Hecho' },
]

const PRIORITIES = [
  { key: 'low', label: 'Baja', cls: 'bg-gray-100 text-gray-600' },
  { key: 'normal', label: 'Normal', cls: 'bg-blue-100 text-blue-700' },
  { key: 'high', label: 'Alta', cls: 'bg-orange-100 text-orange-700' },
  { key: 'urgent', label: 'Urgente', cls: 'bg-red-100 text-red-700' },
]

const COLORS = ['gray', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink']

const COLOR_BORDER: Record<string, string> = {
  gray: 'border-l-gray-400',
  red: 'border-l-red-400',
  orange: 'border-l-orange-400',
  yellow: 'border-l-yellow-400',
  green: 'border-l-green-400',
  blue: 'border-l-blue-400',
  purple: 'border-l-purple-400',
  pink: 'border-l-pink-400',
}

const COLOR_BG: Record<string, string> = {
  gray: 'bg-gray-400',
  red: 'bg-red-400',
  orange: 'bg-orange-400',
  yellow: 'bg-yellow-400',
  green: 'bg-green-400',
  blue: 'bg-blue-400',
  purple: 'bg-purple-400',
  pink: 'bg-pink-400',
}

// ── Component ─────────────────────────────────────────────────
export default function TasksClient({ currentUserId, userRole, profiles, contracts }: Props) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [fetching, setFetching] = useState(true)
  const [quickTitle, setQuickTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filterMine, setFilterMine] = useState(false)
  const [filterUser, setFilterUser] = useState('')
  const [filterContract, setFilterContract] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const selectedTask = tasks.find(t => t.id === selectedId) || null

  useEffect(() => {
    fetch('/api/tasks')
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setTasks(data) })
      .catch(() => setError('Error al cargar tareas'))
      .finally(() => setFetching(false))
  }, [])

  async function handleQuickCreate() {
    if (!quickTitle.trim() || creating) return
    setCreating(true)
    setError(null)

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: quickTitle.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setTasks(prev => [data, ...prev])
      setQuickTitle('')
    } catch {
      setError('Error de conexion')
    } finally {
      setCreating(false)
    }
  }

  async function handleUpdate(id: string, updates: Record<string, unknown>) {
    setSaving(true)
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setTasks(prev => prev.map(t => t.id === id ? data : t))
    } catch {
      setError('Error de conexion')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); setError(d.error); return }
      setTasks(prev => prev.filter(t => t.id !== id))
      setSelectedId(null)
    } catch {
      setError('Error de conexion')
    }
  }

  function handleDrop(status: Task['status']) {
    if (!draggedId) return
    const task = tasks.find(t => t.id === draggedId)
    if (task && task.status !== status) {
      // Optimistic: move card instantly
      setTasks(prev => prev.map(t =>
        t.id === draggedId ? { ...t, status } : t
      ))
      // Then sync with API (will replace with full server data)
      handleUpdate(draggedId, { status })
    }
    setDraggedId(null)
    setDragOverCol(null)
  }

  let displayTasks = tasks
  if (filterMine) {
    displayTasks = displayTasks.filter(t => t.created_by === currentUserId || t.assigned_to === currentUserId)
  }
  if (filterUser) {
    displayTasks = displayTasks.filter(t => t.assigned_to === filterUser || t.created_by === filterUser)
  }
  if (filterContract) {
    displayTasks = displayTasks.filter(t => t.contract_id === filterContract)
  }

  return (
    <div className="p-6 md:p-8 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Apuntes</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {tasks.length} tarea{tasks.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filterUser}
            onChange={e => setFilterUser(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">Todos los usuarios</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select
            value={filterContract}
            onChange={e => setFilterContract(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">Todos los contratos</option>
            {contracts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button
            onClick={() => setFilterMine(!filterMine)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterMine ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Mis tareas
          </button>
        </div>
      </div>

      {/* Quick capture */}
      <form onSubmit={e => { e.preventDefault(); handleQuickCreate() }} className="flex gap-2 mb-6">
        <input
          type="text"
          value={quickTitle}
          onChange={e => setQuickTitle(e.target.value)}
          placeholder="Nueva tarea... presiona Enter"
          className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <button
          type="submit"
          disabled={creating || !quickTitle.trim()}
          className="bg-gray-900 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {creating ? '...' : '+'}
        </button>
      </form>

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-lg">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Cerrar</button>
        </div>
      )}

      {/* Kanban board */}
      {fetching ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400 text-sm">Cargando tareas...</p>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 min-h-0">
          {COLUMNS.map(col => {
            const colTasks = displayTasks.filter(t => t.status === col.key)
            return (
              <div
                key={col.key}
                className={`flex flex-col rounded-xl p-3 min-h-[200px] md:min-h-0 transition-colors duration-150 ${
                  dragOverCol === col.key && draggedId
                    ? 'bg-blue-50 ring-2 ring-blue-300 ring-inset'
                    : 'bg-gray-50'
                }`}
                onDragOver={e => { e.preventDefault(); setDragOverCol(col.key) }}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={() => handleDrop(col.key)}
              >
                <div className="flex items-center justify-between mb-3 px-1">
                  <h3 className="text-sm font-semibold text-gray-700">{col.label}</h3>
                  <span className="text-xs text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">
                    {colTasks.length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2">
                  {colTasks.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-8">Sin tareas</p>
                  ) : (
                    colTasks.map(task => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={() => setDraggedId(task.id)}
                        onDragEnd={() => { setDraggedId(null); setDragOverCol(null) }}
                        onClick={() => setSelectedId(task.id)}
                        className={`bg-white rounded-lg border border-gray-200 p-3 cursor-grab active:cursor-grabbing hover:shadow-sm transition-all duration-150 border-l-4 ${
                          COLOR_BORDER[task.color] || COLOR_BORDER.gray
                        } ${draggedId === task.id ? 'opacity-40 scale-95 rotate-1 shadow-lg' : ''}`}
                      >
                        <p className="text-sm font-medium text-gray-900 mb-2 line-clamp-2">
                          {task.title}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            PRIORITIES.find(p => p.key === task.priority)?.cls || PRIORITIES[1].cls
                          }`}>
                            {PRIORITIES.find(p => p.key === task.priority)?.label || 'Normal'}
                          </span>
                          {task.assignee && (
                            <span className="text-xs text-gray-500">{task.assignee.name}</span>
                          )}
                          {task.due_date && (
                            <span className="text-xs text-gray-400 ml-auto">
                              {new Date(task.due_date + 'T00:00:00').toLocaleDateString('es-CO', {
                                day: 'numeric', month: 'short',
                              })}
                            </span>
                          )}
                        </div>
                        {task.contract && (
                          <p className="text-xs text-gray-400 mt-1.5 truncate">
                            {task.contract.name}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Task detail drawer */}
      {selectedTask && (
        <TaskDrawer
          task={selectedTask}
          profiles={profiles}
          contracts={contracts}
          currentUserId={currentUserId}
          userRole={userRole}
          onUpdate={updates => handleUpdate(selectedTask.id, updates)}
          onDelete={() => handleDelete(selectedTask.id)}
          onClose={() => setSelectedId(null)}
          saving={saving}
        />
      )}
    </div>
  )
}

// ── Task Drawer ───────────────────────────────────────────────
function TaskDrawer({ task, profiles, contracts, currentUserId, userRole, onUpdate, onDelete, onClose, saving }: {
  task: Task
  profiles: Profile[]
  contracts: Contract[]
  currentUserId: string
  userRole: string
  onUpdate: (updates: Record<string, unknown>) => void
  onDelete: () => void
  onClose: () => void
  saving: boolean
}) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Keep local state in sync when switching tasks
  useEffect(() => {
    setTitle(task.title)
    setDescription(task.description)
    setConfirmDelete(false)
  }, [task.id, task.title, task.description])

  const canEdit = userRole === 'jefe' || task.created_by === currentUserId || task.assigned_to === currentUserId
  const canDelete = userRole === 'jefe' || task.created_by === currentUserId

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="bg-black/30 absolute inset-0" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md shadow-xl overflow-y-auto animate-slide-in">
        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {saving ? 'Guardando...' : 'Auto-guardado'}
            </span>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">
              ✕
            </button>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Titulo</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onBlur={() => { if (title.trim() && title !== task.title) onUpdate({ title }) }}
              disabled={!canEdit}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          {/* Contract */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Contrato</label>
            <select
              value={task.contract_id || ''}
              onChange={e => onUpdate({ contract_id: e.target.value || null })}
              disabled={!canEdit}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-50"
            >
              <option value="">Sin contrato</option>
              {contracts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Estado</label>
            <select
              value={task.status}
              onChange={e => onUpdate({ status: e.target.value })}
              disabled={!canEdit}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-50"
            >
              {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Prioridad</label>
            <select
              value={task.priority}
              onChange={e => onUpdate({ priority: e.target.value })}
              disabled={!canEdit}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-50"
            >
              {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Color</label>
            <div className="flex gap-2">
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => canEdit && onUpdate({ color: c })}
                  disabled={!canEdit}
                  className={`w-7 h-7 rounded-full ${COLOR_BG[c]} transition-all ${
                    task.color === c ? 'ring-2 ring-offset-2 ring-gray-900 scale-110' : 'hover:scale-110'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                />
              ))}
            </div>
          </div>

          {/* Assigned to */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Asignado a</label>
            <select
              value={task.assigned_to || ''}
              onChange={e => onUpdate({ assigned_to: e.target.value || null })}
              disabled={!canEdit}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-50"
            >
              <option value="">Sin asignar</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Due date */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Fecha limite</label>
            <input
              type="date"
              value={task.due_date || ''}
              onChange={e => onUpdate({ due_date: e.target.value || null })}
              disabled={!canEdit}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-50"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Descripcion</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              onBlur={() => { if (description !== task.description) onUpdate({ description }) }}
              disabled={!canEdit}
              rows={4}
              placeholder="Notas o descripcion..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-50 resize-none"
            />
          </div>

          {/* Metadata */}
          <div className="border-t border-gray-200 pt-4 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Creado por</span>
              <span className="text-gray-600">{task.creator?.name || '—'}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Creado</span>
              <span className="text-gray-600">
                {new Date(task.created_at).toLocaleDateString('es-CO', {
                  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </span>
            </div>
            {task.completed_at && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Completado</span>
                <span className="text-gray-600">
                  {new Date(task.completed_at).toLocaleDateString('es-CO', {
                    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </div>
            )}
          </div>

          {/* Delete */}
          {canDelete && (
            <div className="border-t border-gray-200 pt-4">
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-red-600">Eliminar esta tarea?</span>
                  <button
                    onClick={onDelete}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700"
                  >
                    Si, eliminar
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-xs text-red-600 hover:text-red-700 font-medium"
                >
                  Eliminar tarea
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
