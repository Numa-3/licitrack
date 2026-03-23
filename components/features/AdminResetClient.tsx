'use client'

import { useState } from 'react'
import ConfirmModal from '@/components/ui/ConfirmModal'

export default function AdminResetClient() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ counts: Record<string, number>; storageCounts: Record<string, number> } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleReset() {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/admin/reset', { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Error ${res.status}`)
      }
      const data = await res.json()
      setResult({ counts: data.counts, storageCounts: data.storageCounts })
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al ejecutar el reset')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Reset global */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Limpiar todo el contenido</h2>
            <p className="text-sm text-gray-500 mt-1">
              Elimina permanentemente todos los contratos, items, proveedores, envios, facturas, documentos y archivos.
              Los usuarios y organizaciones no se eliminan.
            </p>
          </div>
          <button
            onClick={() => { setError(null); setResult(null); setOpen(true) }}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors shrink-0"
          >
            Limpiar todo
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm font-medium text-green-800 mb-2">Reset completado</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(result.counts).map(([key, val]) => (
                <div key={key} className="text-xs text-green-700">
                  <span className="font-medium">{key}:</span> {val} eliminados
                </div>
              ))}
              {Object.entries(result.storageCounts).map(([key, val]) => (
                <div key={`storage-${key}`} className="text-xs text-green-700">
                  <span className="font-medium">{key} (archivos):</span> {val}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-amber-800 mb-2">Nota importante</h3>
        <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
          <li>Esta accion es <strong>irreversible</strong>. No se puede deshacer.</li>
          <li>Se eliminan: contratos, items, proveedores, documentos, envios, facturas y archivos de storage.</li>
          <li>No se eliminan: usuarios, organizaciones ni categorias.</li>
          <li>Tambien puedes eliminar registros individuales desde cada pagina de detalle.</li>
        </ul>
      </div>

      <ConfirmModal
        open={open}
        title="Limpiar todo el contenido"
        description="Esta accion eliminara permanentemente TODOS los datos de contenido del sistema (contratos, items, proveedores, envios, facturas, documentos y archivos). Los usuarios y organizaciones se mantienen. Esta accion NO se puede deshacer."
        confirmLabel="Eliminar todo"
        requireTyped="CONFIRMAR"
        loading={loading}
        onConfirm={handleReset}
        onCancel={() => setOpen(false)}
      />
    </div>
  )
}
