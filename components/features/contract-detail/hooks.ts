import { useMemo } from 'react'
import type { Item, ItemSupplier } from './types'
import { marginPct } from './utils'

export type GroupedItems = [string, { supplier: ItemSupplier; items: Item[] }][]

export function useItemGrouping(filteredItems: Item[]): GroupedItems {
  return useMemo(() => {
    const groups: Record<string, { supplier: ItemSupplier; items: Item[] }> = {}
    for (const item of filteredItems) {
      const key = item.supplier_id || '__unassigned__'
      if (!groups[key]) {
        groups[key] = { supplier: item.suppliers, items: [] }
      }
      groups[key].items.push(item)
    }
    const entries = Object.entries(groups)
    entries.sort(([a, aGroup], [b, bGroup]) => {
      if (a === '__unassigned__') return -1
      if (b === '__unassigned__') return 1
      return (aGroup.supplier?.name || '').localeCompare(bGroup.supplier?.name || '')
    })
    return entries
  }, [filteredItems])
}

export type MarginSummary = {
  totalSale: number
  totalCost: number
  totalMargin: number | null
  lowMarginCount: number
  negativeMarginCount: number
  supplierPct: number
  worstMarginItems: { id: string; short_name: string; margin: number }[]
}

export function useMarginSummary(items: Item[]): MarginSummary {
  return useMemo(() => {
    let totalSale = 0, totalCost = 0, lowMarginCount = 0, negativeMarginCount = 0
    let withSupplier = 0
    const itemMargins: { id: string; short_name: string; margin: number }[] = []
    for (const item of items) {
      if (item.sale_price) totalSale += Number(item.sale_price) * Number(item.quantity)
      if (item.supplier_cost) totalCost += Number(item.supplier_cost) * Number(item.quantity)
      if (item.supplier_id) withSupplier++
      const m = marginPct(item.sale_price, item.supplier_cost)
      if (m != null) {
        itemMargins.push({ id: item.id, short_name: item.short_name, margin: m })
        if (m < 0) negativeMarginCount++
        else if (m < 15) lowMarginCount++
      }
    }
    const totalMargin = totalSale > 0 ? ((totalSale - totalCost) / totalSale) * 100 : null
    const supplierPct = items.length > 0 ? Math.round((withSupplier / items.length) * 100) : 0
    const worstMarginItems = [...itemMargins].sort((a, b) => a.margin - b.margin).slice(0, 5)
    return { totalSale, totalCost, totalMargin, lowMarginCount, negativeMarginCount, supplierPct, worstMarginItems }
  }, [items])
}

export function useRecentSuppliers(items: Item[]) {
  return useMemo(() => {
    const seen = new Map<string, string>()
    for (const item of items) {
      if (item.supplier_id && item.suppliers?.name) {
        seen.set(item.supplier_id, item.suppliers.name)
      }
    }
    return Array.from(seen.entries()).slice(0, 5).map(([id, name]) => ({ id, name }))
  }, [items])
}
