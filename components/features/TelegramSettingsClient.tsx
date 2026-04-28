'use client'

import { useEffect, useState } from 'react'
import { Send, Copy, Check, RefreshCw, Unlink } from 'lucide-react'

type Status = {
  linked: boolean
  group_title: string | null
  linked_at: string | null
  pending_code: string | null
  code_expires_at: string | null
}

type Props = {
  initialLinked: boolean
  initialGroupTitle: string | null
  initialLinkedAt: string | null
}

export default function TelegramSettingsClient({
  initialLinked,
  initialGroupTitle,
  initialLinkedAt,
}: Props) {
  const [status, setStatus] = useState<Status>({
    linked: initialLinked,
    group_title: initialGroupTitle,
    linked_at: initialLinkedAt,
    pending_code: null,
    code_expires_at: null,
  })
  const [generating, setGenerating] = useState(false)
  const [unlinking, setUnlinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  // Refresca status cada 5s mientras hay código pendiente o no está vinculado
  useEffect(() => {
    const shouldPoll = status.pending_code !== null || !status.linked
    if (!shouldPoll) return

    const id = setInterval(async () => {
      try {
        const res = await fetch('/api/telegram/status', { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as Status
        setStatus(prev => ({
          ...prev,
          linked: data.linked,
          group_title: data.group_title,
          linked_at: data.linked_at,
          pending_code: data.pending_code,
          code_expires_at: data.code_expires_at,
        }))
      } catch {
        /* ignore */
      }
    }, 5000)
    return () => clearInterval(id)
  }, [status.pending_code, status.linked])

  // Tick para countdown
  useEffect(() => {
    if (!status.code_expires_at) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [status.code_expires_at])

  async function generateCode() {
    setError(null)
    setGenerating(true)
    setCopied(false)
    try {
      const res = await fetch('/api/telegram/setup-code', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error generando código')
      setStatus(prev => ({
        ...prev,
        pending_code: data.code,
        code_expires_at: data.expires_at,
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setGenerating(false)
    }
  }

  async function unlink() {
    if (!confirm('¿Desvincular el grupo de Telegram? Las notificaciones dejarán de enviarse.')) return
    setError(null)
    setUnlinking(true)
    try {
      const res = await fetch('/api/telegram/unlink', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error desvinculando')
      setStatus({
        linked: false,
        group_title: null,
        linked_at: null,
        pending_code: null,
        code_expires_at: null,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setUnlinking(false)
    }
  }

  async function copyCode() {
    if (!status.pending_code) return
    try {
      await navigator.clipboard.writeText(`/start ${status.pending_code}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  const remainingSec = status.code_expires_at
    ? Math.max(0, Math.floor((new Date(status.code_expires_at).getTime() - now) / 1000))
    : 0
  const codeExpired = status.code_expires_at !== null && remainingSec === 0

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
          <Send size={18} className="text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Telegram</h1>
          <p className="text-xs text-gray-500 mt-0.5">Recibí notificaciones de LiciTrack en un grupo de Telegram</p>
        </div>
      </div>

      {/* Estado actual */}
      <div className="bg-white border border-[#EAEAEA] rounded-xl p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Estado</p>
            {status.linked ? (
              <>
                <p className="mt-2 text-sm text-gray-900">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ring-1 ring-inset bg-[#F0FDF4] text-green-700 ring-green-600/20 mr-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5" />
                    Vinculado
                  </span>
                  {status.group_title ? <span className="font-medium">{status.group_title}</span> : 'Grupo sin título'}
                </p>
                {status.linked_at && (
                  <p className="text-xs text-gray-500 mt-1.5">
                    Desde {new Date(status.linked_at).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' })}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-gray-700">
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ring-1 ring-inset bg-amber-50 text-amber-700 ring-amber-600/20 mr-2">
                  No vinculado
                </span>
                Generá un código y mandalo al bot desde tu grupo.
              </p>
            )}
          </div>

          {status.linked && (
            <button
              onClick={unlink}
              disabled={unlinking}
              className="inline-flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-50"
            >
              <Unlink size={13} />
              {unlinking ? 'Desvinculando...' : 'Desvincular'}
            </button>
          )}
        </div>
      </div>

      {/* Código activo */}
      {status.pending_code && !codeExpired && !status.linked && (
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Código activo</p>
          <div className="mt-3 flex items-center gap-3">
            <code className="text-3xl font-semibold tracking-[0.3em] text-gray-900 bg-gray-50 border border-[#EAEAEA] rounded-lg px-4 py-2">
              {status.pending_code}
            </code>
            <button
              onClick={copyCode}
              className="inline-flex items-center gap-1.5 text-sm text-gray-700 hover:bg-gray-100 px-3 py-2 rounded-md border border-[#EAEAEA] transition-colors"
            >
              {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
              {copied ? 'Copiado' : 'Copiar /start'}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Expira en {Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, '0')}
          </p>
        </div>
      )}

      {/* Instrucciones */}
      {!status.linked && (
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Cómo vincular</p>
          <ol className="mt-3 space-y-2.5 text-sm text-gray-700 list-decimal list-inside">
            <li>Asegurate de que el bot ya esté creado y configurado por el equipo técnico (servidor con <code className="text-xs bg-gray-100 rounded px-1">TELEGRAM_BOT_TOKEN</code>).</li>
            <li>Creá un grupo de Telegram con los jefes que deben recibir alertas.</li>
            <li>Invitá al bot al grupo.</li>
            <li>Generá un código abajo, copialo y pegalo en el grupo (debe tener el formato <code className="text-xs bg-gray-100 rounded px-1">/start CODIGO</code>).</li>
            <li>El bot va a confirmar la vinculación en menos de 30 segundos.</li>
          </ol>

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={generateCode}
              disabled={generating}
              className="inline-flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-3 py-1.5 rounded-md shadow-sm disabled:opacity-50"
            >
              <RefreshCw size={14} className={generating ? 'animate-spin' : ''} />
              {status.pending_code && !codeExpired ? 'Regenerar código' : 'Generar código'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}
