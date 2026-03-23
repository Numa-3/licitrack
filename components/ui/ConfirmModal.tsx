'use client'

import { useState, useEffect } from 'react'

type Props = {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  requireTyped?: string
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Eliminar',
  requireTyped,
  loading = false,
  onConfirm,
  onCancel,
}: Props) {
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (!open) setTyped('')
  }, [open])

  if (!open) return null

  const canConfirm = requireTyped ? typed === requireTyped : true

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        </div>

        <p className="text-sm text-gray-600 mb-4">{description}</p>

        {requireTyped && (
          <div className="mb-4">
            <p className="text-sm text-gray-500 mb-2">
              Escribe <span className="font-mono font-bold text-red-600">{requireTyped}</span> para confirmar:
            </p>
            <input
              type="text"
              value={typed}
              onChange={e => setTyped(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              placeholder={requireTyped}
              autoFocus
            />
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm || loading}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Eliminando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
