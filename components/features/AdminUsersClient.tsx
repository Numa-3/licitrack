'use client'

import { useState, useEffect } from 'react'

// ── Types ──────────────────────────────────────────────────────
type User = {
  id: string
  name: string
  email: string
  role: string
  banned: boolean
  created_at: string
}

type Props = {
  currentUserId: string
}

// ── Component ──────────────────────────────────────────────────
export default function AdminUsersClient({ currentUserId }: Props) {
  const [users, setUsers] = useState<User[]>([])
  const [fetching, setFetching] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState({ name: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [savingName, setSavingName] = useState(false)

  useEffect(() => {
    fetch('/api/admin/users')
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setUsers(data) })
      .catch(() => setError('Error al cargar usuarios'))
      .finally(() => setFetching(false))
  }, [])

  async function handleCreate() {
    if (!newForm.name.trim() || !newForm.email.trim() || !newForm.password) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newForm),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || `Error ${res.status}`)
        return
      }

      setUsers(prev => [
        { ...data, banned: false, created_at: new Date().toISOString() },
        ...prev,
      ])
      setShowNew(false)
      setNewForm({ name: '', email: '', password: '' })
    } catch {
      setError('Error de conexion')
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleBan(user: User) {
    setTogglingId(user.id)
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banned: !user.banned }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || `Error ${res.status}`)
        return
      }

      setUsers(prev =>
        prev.map(u => (u.id === user.id ? { ...u, banned: data.banned } : u))
      )
    } catch {
      setError('Error de conexion')
    } finally {
      setTogglingId(null)
    }
  }

  async function handleRename(user: User) {
    if (!editName.trim() || editName.trim() === user.name) {
      setEditingId(null)
      return
    }
    setSavingName(true)
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || `Error ${res.status}`)
        return
      }

      setUsers(prev =>
        prev.map(u => (u.id === user.id ? { ...u, name: data.name } : u))
      )
      setEditingId(null)
    } catch {
      setError('Error de conexion')
    } finally {
      setSavingName(false)
    }
  }

  const operadores = users.filter(u => u.role === 'operadora')
  const jefes = users.filter(u => u.role === 'jefe')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Operadores</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {operadores.length} operador{operadores.length !== 1 ? 'es' : ''} registrado{operadores.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => { setError(null); setShowNew(true) }}
          className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
        >
          + Nuevo operador
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-lg">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Cerrar</button>
        </div>
      )}

      {/* Users table */}
      {fetching ? (
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-12 text-center">
          <p className="text-gray-400 text-sm">Cargando usuarios...</p>
        </div>
      ) : users.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-12 text-center">
          <p className="text-gray-500 text-lg mb-1">No hay usuarios registrados.</p>
          <p className="text-gray-400 text-sm mb-4">Crea el primer operador para empezar.</p>
          <button
            onClick={() => setShowNew(true)}
            className="inline-block bg-gray-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            + Crear primer operador
          </button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Nombre</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Rol</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Estado</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Creado</th>
                <th className="text-right px-5 py-3 font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {/* Jefes first, then operadores */}
              {[...jefes, ...operadores].map(user => {
                const isCurrentUser = user.id === currentUserId
                const isToggling = togglingId === user.id

                return (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4">
                      {editingId === user.id ? (
                        <form onSubmit={e => { e.preventDefault(); handleRename(user) }} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            autoFocus
                            onKeyDown={e => { if (e.key === 'Escape') setEditingId(null) }}
                            className="px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 w-40"
                          />
                          <button type="submit" disabled={savingName || !editName.trim()}
                            className="text-xs font-medium px-2 py-1 rounded bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50">
                            {savingName ? '...' : 'OK'}
                          </button>
                          <button type="button" onClick={() => setEditingId(null)}
                            className="text-xs text-gray-500 hover:text-gray-700">
                            X
                          </button>
                        </form>
                      ) : (
                        <span
                          className="font-medium text-gray-900 cursor-pointer hover:underline"
                          onClick={() => { setEditingId(user.id); setEditName(user.name) }}
                          title="Click para editar nombre"
                        >
                          {user.name}
                          {isCurrentUser && (
                            <span className="ml-2 text-xs text-gray-400 font-normal">(tu)</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-gray-600">{user.email}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        user.role === 'jefe'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {user.role === 'jefe' ? 'Jefe' : 'Operadora'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        user.banned
                          ? 'bg-red-100 text-red-700'
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {user.banned ? 'Desactivado' : 'Activo'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-500 text-xs">
                      {new Date(user.created_at).toLocaleDateString('es-CO', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {!isCurrentUser && user.role === 'operadora' && (
                        <button
                          onClick={() => handleToggleBan(user)}
                          disabled={isToggling}
                          className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                            user.banned
                              ? 'text-green-700 bg-green-50 hover:bg-green-100'
                              : 'text-red-700 bg-red-50 hover:bg-red-100'
                          }`}
                        >
                          {isToggling
                            ? '...'
                            : user.banned
                              ? 'Activar'
                              : 'Desactivar'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* New user modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowNew(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Nuevo operador</h2>
              <p className="text-sm text-gray-500 mt-1">Se creara con rol &quot;operadora&quot; automaticamente.</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                <input
                  type="text"
                  value={newForm.name}
                  onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ej: Maria Lopez"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  value={newForm.email}
                  onChange={e => setNewForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="Ej: maria@empresa.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña *</label>
                <input
                  type="text"
                  value={newForm.password}
                  onChange={e => setNewForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Minimo 6 caracteres"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                <p className="text-xs text-gray-400 mt-1">La contraseña se muestra en texto para que puedas compartirla con el operador.</p>
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => setShowNew(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={loading || !newForm.name.trim() || !newForm.email.trim() || newForm.password.length < 6}
                className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Creando...' : 'Crear operador'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
