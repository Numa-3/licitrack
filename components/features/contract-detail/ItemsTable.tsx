'use client'

import { STATUS_COLORS, STATUS_LABELS, PAYMENT_COLORS, PAYMENT_LABELS } from './constants'
import { marginPct, marginColor } from './utils'
import type { Item } from './types'
import type { GroupedItems } from './hooks'

type Props = {
  grouped: GroupedItems
  totalCount: number
  filteredCount: number
  selected: Set<string>
  isActive: boolean
  searchQuery: string
  showSearch: boolean
  onSearchChange: (value: string) => void
  onToggleSelect: (id: string) => void
  onToggleSelectAll: () => void
  onAddItem: () => void
  onItemClick: (item: Item) => void
}

export default function ItemsTable({
  grouped, totalCount, filteredCount, selected, isActive, searchQuery, showSearch,
  onSearchChange, onToggleSelect, onToggleSelectAll, onAddItem, onItemClick,
}: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl">
      <div className="px-5 py-4 border-b border-gray-200 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-gray-900">
              Ítems <span className="ml-1 text-sm font-normal text-gray-400">({filteredCount}{searchQuery ? ` de ${totalCount}` : ''})</span>
            </h2>
            {isActive && (
              <button onClick={onAddItem}
                className="px-3 py-1 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-700 transition-colors">
                + Agregar ítem
              </button>
            )}
          </div>
          {totalCount > 0 && (
            <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
              <input type="checkbox" checked={selected.size === totalCount && totalCount > 0}
                onChange={onToggleSelectAll} className="rounded border-gray-300" />
              Seleccionar todos
            </label>
          )}
        </div>
        {showSearch && (
          <input
            type="text"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Buscar item por nombre, descripcion o numero..."
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 placeholder:text-gray-400"
          />
        )}
      </div>

      {totalCount === 0 ? (
        <div className="px-5 py-10 text-center text-gray-400">
          <p className="text-lg mb-1">Este contrato no tiene ítems.</p>
          <p className="text-sm">Subí un Excel o agregá ítems manualmente.</p>
        </div>
      ) : (
        <div>
          {grouped.map(([key, group]) => (
            <div key={key}>
              <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">
                  {key === '__unassigned__' ? '📋 Sin proveedor asignado' : `🏪 ${group.supplier?.name}`}
                </span>
                <span className="text-xs text-gray-400">({group.items.length})</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[600px]">
                  <tbody className="divide-y divide-gray-100">
                    {group.items.map(item => {
                      const m = marginPct(item.sale_price, item.supplier_cost)
                      return (
                        <tr key={item.id}
                          className={`hover:bg-gray-50 transition-colors cursor-pointer ${selected.has(item.id) ? 'bg-blue-50/50' : ''}`}
                          onClick={() => onItemClick(item)}>
                          <td className="pl-5 py-3 w-10" onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={selected.has(item.id)}
                              onChange={() => onToggleSelect(item.id)} className="rounded border-gray-300" />
                          </td>
                          <td className="py-3 w-12 text-gray-400 text-xs">
                            {item.item_number ?? '—'}
                          </td>
                          <td className="py-3 pr-4">
                            <div className="font-medium text-gray-900">{item.short_name}</div>
                            <div className="text-xs text-gray-400">{item.quantity} {item.unit || 'und'}</div>
                          </td>
                          <td className="py-3 pr-4">
                            <div className="flex gap-1.5">
                              <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[item.status] || STATUS_COLORS.pending}`}>
                                {STATUS_LABELS[item.status] || item.status}
                              </span>
                              <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${PAYMENT_COLORS[item.payment_status]}`}>
                                {PAYMENT_LABELS[item.payment_status]}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-gray-500 text-xs">
                            {item.profiles?.name ?? '—'}
                          </td>
                          <td className="py-3 pr-5 text-right">
                            {m != null && (
                              <span className={`text-xs ${marginColor(m)}`}>
                                {m.toFixed(0)}%
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
