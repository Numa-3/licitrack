'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import DeleteButton from '@/components/ui/DeleteButton'
import { formatDate } from '@/lib/utils/format'

// ── Types ──────────────────────────────────────────────────────
type ShipmentItem = {
  item_id: string
  items: {
    id: string
    short_name: string
    quantity: number
    unit: string | null
    status: string
  }
}

type Shipment = {
  id: string
  contract_id: string
  method: 'avion' | 'barco' | 'terrestre'
  origin_city: string
  dispatch_date: string
  estimated_arrival: string
  actual_arrival: string | null
  notes: string
  created_by: string
  created_at: string
  contracts: { name: string } | null
  shipment_items: ShipmentItem[]
}

type Contract = { id: string; name: string }

type Props = {
  shipments: Shipment[]
  contracts: Contract[]
  currentUserId: string
  userRole: string
}

// ── Constants ──────────────────────────────────────────────────
const METHOD_ICONS: Record<string, string> = {
  avion: '✈️', barco: '🚢', terrestre: '🚛',
}
const METHOD_LABELS: Record<string, string> = {
  avion: 'Avión', barco: 'Barco', terrestre: 'Terrestre',
}

function getShipmentStatus(s: Shipment): { label: string; color: string } {
  if (s.actual_arrival) return { label: 'Recibido', color: 'bg-green-50 text-green-700' }
  const today = new Date().toISOString().split('T')[0]
  if (s.estimated_arrival < today) return { label: 'Retrasado', color: 'bg-red-50 text-red-600 font-semibold' }
  return { label: 'En camino', color: 'bg-blue-50 text-blue-700' }
}

// ── Component ──────────────────────────────────────────────────
export default function ShipmentsClient({ shipments: initialShipments, contracts, currentUserId, userRole }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [shipments, setShipments] = useState(initialShipments || [])
  const [filterContract, setFilterContract] = useState('')
  const [receiveModal, setReceiveModal] = useState<Shipment | null>(null)
  const [arrivalDate, setArrivalDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (!filterContract) return shipments
    return shipments.filter(s => s.contract_id === filterContract)
  }, [shipments, filterContract])

  // Sort: delayed first, then in transit, then received
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const sa = getShipmentStatus(a)
      const sb = getShipmentStatus(b)
      const order: Record<string, number> = { 'Retrasado': 0, 'En camino': 1, 'Recibido': 2 }
      const diff = (order[sa.label] ?? 1) - (order[sb.label] ?? 1)
      if (diff !== 0) return diff
      return b.dispatch_date.localeCompare(a.dispatch_date)
    })
  }, [filtered])

  async function handleMarkReceived() {
    if (!receiveModal || !arrivalDate) return
    setLoading(true)
    setError(null)

    const { error: err } = await supabase
      .from('shipments')
      .update({ actual_arrival: arrivalDate })
      .eq('id', receiveModal.id)

    if (err) { setError(err.message); setLoading(false); return }

    // Update items to "received"
    const itemIds = receiveModal.shipment_items.map(si => si.item_id)
    if (itemIds.length > 0) {
      await supabase.from('items').update({ status: 'received' }).in('id', itemIds)
    }

    // Log activity
    for (const itemId of itemIds) {
      await supabase.from('activity_log').insert({
        user_id: currentUserId,
        action: 'status_changed',
        entity_type: 'item',
        entity_id: itemId,
        details: { new_value: 'Recibido', shipment_id: receiveModal.id, actual_arrival: arrivalDate },
      })
    }

    // Update local state
    setShipments(prev => prev.map(s => s.id === receiveModal.id ? { ...s, actual_arrival: arrivalDate } : s))
    setReceiveModal(null)
    setArrivalDate('')
    setLoading(false)
    router.refresh()
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Envíos</h1>
          <p className="text-gray-500 text-sm mt-1">Seguimiento de envíos a Leticia</p>
        </div>
        <div>
          <select value={filterContract} onChange={e => setFilterContract(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
            <option value="">Todos los contratos</option>
            {contracts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-lg">{error}</div>
      )}

      {sorted.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-12 text-center">
          <p className="text-gray-400 text-lg">No hay envíos registrados</p>
          <p className="text-gray-400 text-sm mt-1">Los envíos se crean desde la vista de contrato seleccionando ítems comprados.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map(shipment => {
            const status = getShipmentStatus(shipment)
            const itemCount = shipment.shipment_items?.length || 0
            return (
              <div key={shipment.id} className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xl">{METHOD_ICONS[shipment.method]}</span>
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {shipment.origin_city || '—'} → Leticia
                        </h3>
                        <p className="text-xs text-gray-400">
                          {shipment.contracts?.name || '—'} · {METHOD_LABELS[shipment.method]}
                        </p>
                      </div>
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${status.color}`}>
                        {status.label}
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-4 mt-3 text-sm">
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wider">Despacho</p>
                        <p className="text-gray-700 font-medium">{formatDate(shipment.dispatch_date)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wider">Llegada estimada</p>
                        <p className="text-gray-700 font-medium">{formatDate(shipment.estimated_arrival)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wider">Llegada real</p>
                        <p className="text-gray-700 font-medium">{shipment.actual_arrival ? formatDate(shipment.actual_arrival) : '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wider">Ítems</p>
                        <p className="text-gray-700 font-medium">{itemCount}</p>
                      </div>
                    </div>

                    {/* Items list */}
                    {itemCount > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {shipment.shipment_items.map(si => (
                          <span key={si.item_id} className="inline-block text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                            {si.items?.short_name || si.item_id.slice(0, 8)}
                          </span>
                        ))}
                      </div>
                    )}

                    {shipment.notes && (
                      <p className="mt-2 text-xs text-gray-400">{shipment.notes}</p>
                    )}
                  </div>

                  <div className="ml-4 flex items-center gap-2">
                    {!shipment.actual_arrival && (
                      <button onClick={() => { setReceiveModal(shipment); setArrivalDate(new Date().toISOString().split('T')[0]) }}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors whitespace-nowrap">
                        Marcar recibido
                      </button>
                    )}
                    {userRole === 'jefe' && (
                      <DeleteButton
                        apiPath={`/api/admin/shipments/${shipment.id}`}
                        entityLabel="este envío"
                      />
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Receive modal */}
      {receiveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setReceiveModal(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Marcar envío como recibido</h2>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-500">
                {receiveModal.origin_city} → Leticia · {receiveModal.shipment_items?.length || 0} ítem{(receiveModal.shipment_items?.length || 0) > 1 ? 's' : ''}
              </p>
              <p className="text-sm text-gray-500">
                Los ítems de este envío pasarán a estado &quot;Recibido&quot;.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha real de llegada</label>
                <input type="date" value={arrivalDate} onChange={e => setArrivalDate(e.target.value)} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setReceiveModal(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancelar</button>
                <button onClick={handleMarkReceived} disabled={!arrivalDate || loading}
                  className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
                  {loading ? 'Guardando...' : 'Confirmar recepción'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
