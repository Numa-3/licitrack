'use client'

import { formatCurrency } from '@/lib/utils/format'
import { marginColor } from './utils'
import type { MarginSummary as MarginSummaryData } from './hooks'

type Props = {
  summary: MarginSummaryData
  itemsCount: number
}

export default function MarginSummary({ summary, itemsCount }: Props) {
  if (itemsCount === 0 || (summary.totalSale === 0 && summary.totalCost === 0)) {
    return null
  }

  return (
    <div className="space-y-4 mb-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Ingreso total</p>
          <p className="text-lg font-semibold text-gray-900">{formatCurrency(summary.totalSale)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Costo total</p>
          <p className="text-lg font-semibold text-gray-900">{formatCurrency(summary.totalCost)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Margen</p>
          <p className={`text-lg font-semibold ${marginColor(summary.totalMargin)}`}>
            {summary.totalMargin != null ? `${summary.totalMargin.toFixed(1)}%` : '—'}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Con proveedor</p>
          <p className="text-lg font-semibold text-gray-900">{summary.supplierPct}%</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Alertas</p>
          <div className="flex gap-2">
            {summary.negativeMarginCount > 0 && (
              <span className="text-sm text-red-600 font-medium">{summary.negativeMarginCount} negativo{summary.negativeMarginCount > 1 ? 's' : ''}</span>
            )}
            {summary.lowMarginCount > 0 && (
              <span className="text-sm text-orange-500 font-medium">{summary.lowMarginCount} bajo{summary.lowMarginCount > 1 ? 's' : ''}</span>
            )}
            {summary.negativeMarginCount === 0 && summary.lowMarginCount === 0 && (
              <span className="text-sm text-green-600">Todo bien</span>
            )}
          </div>
        </div>
      </div>
      {summary.worstMarginItems.length > 0 && summary.worstMarginItems[0].margin < 15 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Ítems con peor margen</p>
          <div className="flex flex-wrap gap-2">
            {summary.worstMarginItems.map(wi => (
              <span key={wi.id} className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border ${
                wi.margin < 0 ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}>
                {wi.short_name}
                <span className="font-semibold">{wi.margin.toFixed(1)}%</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
