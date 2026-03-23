'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ConfirmModal from './ConfirmModal'

type Props = {
  apiPath: string
  entityLabel: string
  redirectTo?: string
  requireTyped?: string
  buttonLabel?: string
  onSuccess?: () => void
}

export default function DeleteButton({
  apiPath,
  entityLabel,
  redirectTo,
  requireTyped,
  buttonLabel = 'Eliminar',
  onSuccess,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(apiPath, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Error ${res.status}`)
      }
      setOpen(false)
      if (onSuccess) onSuccess()
      if (redirectTo) router.push(redirectTo)
      else router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => { setError(null); setOpen(true) }}
        className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
      >
        {buttonLabel}
      </button>

      <ConfirmModal
        open={open}
        title={`Eliminar ${entityLabel}`}
        description={`Esta acción eliminará ${entityLabel} y todos sus datos relacionados de forma permanente. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar permanentemente"
        requireTyped={requireTyped}
        loading={loading}
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
      />

      {error && (
        <div className="fixed bottom-4 right-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg shadow-lg z-50 max-w-sm">
          <p className="text-sm font-medium">Error</p>
          <p className="text-sm">{error}</p>
          <button onClick={() => setError(null)} className="absolute top-2 right-2 text-red-400 hover:text-red-600">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
      )}
    </>
  )
}
