'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchWithRetry } from '@/lib/supabase/retry'

// ── Types ──────────────────────────────────────────────────────
type Organization = { id: string; name: string }
type Profile = { id: string; name: string; role: string }
type Category = { id: string; name: string; type: string }

type ContractingEntity = { id: string; name: string }

type Props = {
  organizations: Organization[]
  profiles: Profile[]
  categories: Category[]
  entities: ContractingEntity[]
  currentUserId: string
}

type ParsedRow = {
  rowIndex: number
  item_number: number | null
  description: string
  unit: string
  quantity: number
  sale_price: number
}

type ReviewRow = ParsedRow & {
  selected: boolean
  short_name: string
  category_id: string
  type: 'purchase' | 'logistics' | 'service'
}

// ── Constants ──────────────────────────────────────────────────
const CONTRACT_TYPES = [
  { value: 'supply', label: 'Suministro', description: 'Adquisicion de bienes' },
  { value: 'construction', label: 'Obra', description: 'Construccion e infraestructura' },
  { value: 'sale', label: 'Compraventa', description: 'Compra y venta de bienes' },
  { value: 'service', label: 'Servicios', description: 'Prestacion de servicios' },
  { value: 'logistics', label: 'Logistica', description: 'Eventos, transporte y alojamiento' },
  { value: 'mixed', label: 'Mixto', description: 'Combinacion de tipos' },
]

// ── Parse HTML table from Excel clipboard ─────────────────────
function parseHTMLTable(html: string): string[][] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const rows = Array.from(doc.querySelectorAll('tr'))
  if (rows.length === 0) return []

  return rows
    .map(tr => Array.from(tr.querySelectorAll('td, th')).map(td => td.textContent?.trim() ?? ''))
    .filter(r => r.some(cell => cell !== ''))
}

// ── Parse TSV fallback ─────────────────────────────────────────
function parseTSV(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '')
  if (lines.length === 0) return []

  return lines
    .map(l => l.split('\t').map(cell => cell.trim()))
    .filter(r => r.some(cell => cell !== ''))
}

// ── Detect column roles from header keywords ───────────────────
const COL_PATTERNS: Record<string, RegExp> = {
  item_number: /^(#|no\.?|item|ítem|num|n[úu]mero|consec)/i,
  description: /^(desc|especific|detalle|producto|bien|servicio|objeto|element|concepto|nombre)/i,
  unit: /^(uni|medida|und|u\.?\s*m)/i,
  quantity: /^(cant|qty|cantidad)/i,
  sale_price: /^(val|prec|costo|precio|v\.\s*unit|valor\s*unit|vr|vlr|unitario)/i,
}

type ColMap = {
  item_number: number | null
  description: number | null
  unit: number | null
  quantity: number | null
  sale_price: number | null
}

function detectColumns(headerRow: string[]): ColMap | null {
  const map: ColMap = { item_number: null, description: null, unit: null, quantity: null, sale_price: null }

  for (let i = 0; i < headerRow.length; i++) {
    const cell = headerRow[i].trim()
    if (!cell) continue
    for (const [role, re] of Object.entries(COL_PATTERNS)) {
      if (re.test(cell) && map[role as keyof ColMap] === null) {
        map[role as keyof ColMap] = i
        break
      }
    }
  }

  return map.description !== null ? map : null
}

// ── Parse Colombian numbers ────────────────────────────────────
function parseColNumber(val: string): number {
  let s = val.trim().replace(/[$\s]/g, '')
  if (!s) return 0

  // Colombian: dots as thousands, comma as decimal (e.g., "1.250.000,50")
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.')
    return parseFloat(s) || 0
  }
  // Dots only as thousands (e.g., "1.250.000")
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    return parseFloat(s.replace(/\./g, '')) || 0
  }
  // Standard number or comma decimal
  s = s.replace(',', '.')
  return parseFloat(s) || 0
}

function isDataRow(row: string[], cols: ColMap): boolean {
  const desc = cols.description !== null ? row[cols.description]?.trim() : ''
  if (!desc) return false
  // Skip headers (if the description cell matches a known header keyword)
  if (COL_PATTERNS.description.test(desc)) return false
  // Skip totals/subtotals
  if (/^(total|subtotal|sub-total|gran total|iva|impuesto)/i.test(desc)) return false
  return true
}

function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cols = detectColumns(rows[i])
    if (cols) return i
  }
  return -1
}

// ── Steps ──────────────────────────────────────────────────────
type Step = 'form' | 'paste' | 'review'

export default function NewContractForm({ organizations, profiles, categories, entities, currentUserId }: Props) {
  const router = useRouter()
  const supabase = createClient()

  // Step management
  const [step, setStep] = useState<Step>('form')

  // Step 1: Contract form
  const [form, setForm] = useState({
    name: '',
    entity_id: '',
    organization_id: '',
    type: '',
    assigned_to: currentUserId,
    start_date: '',
    end_date: '',
  })
  const [contractId, setContractId] = useState<string | null>(null)

  // Step 2: Paste
  const [pasteText, setPasteText] = useState('')
  const [pastePreview, setPastePreview] = useState<string[][] | null>(null)

  // Step 3: Review
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([])
  const [batchAssignTo, setBatchAssignTo] = useState<string>(currentUserId)
  const [classifying, setClassifying] = useState(false)
  const [classifyError, setClassifyError] = useState<string | null>(null)

  // Pagination
  const [reviewPage, setReviewPage] = useState(0)
  const ROWS_PER_PAGE = 20

  // Shared
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Step 1: Create contract ────────────────────────────────
  async function handleCreateContract(e: React.FormEvent) {
    e.preventDefault()
    if (!form.entity_id) { setError('Selecciona una entidad contratante.'); return }
    if (!form.type) { setError('Selecciona el tipo de contrato.'); return }
    if (!form.organization_id) { setError('Selecciona una empresa.'); return }

    setLoading(true)
    setError(null)

    const entityName = entities.find(e => e.id === form.entity_id)?.name || ''

    const { data, error } = await supabase
      .from('contracts')
      .insert({
        name: form.name,
        entity: entityName,
        entity_id: form.entity_id,
        organization_id: form.organization_id,
        type: form.type,
        status: 'draft',
        created_by: currentUserId,
        assigned_to: form.assigned_to || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      })
      .select('id')
      .single()

    if (error) { setError(error.message); setLoading(false); return }

    setContractId(data.id)
    setLoading(false)
    setStep('paste')
  }

  // ── Step 2: Paste handling ─────────────────────────────────
  function handlePaste(text: string) {
    setPasteText(text)
    if (!text.trim()) { setPastePreview(null); return }

    const rows = parseTSV(text)
    if (rows.length === 0) { setPastePreview(null); return }

    setPastePreview(rows)
  }

  async function handleProcessPaste() {
    if (!pastePreview || pastePreview.length === 0) return
    setError(null)
    setStep('review')
    setClassifying(true)
    setClassifyError(null)
    setReviewRows([])

    try {
      // Step 1: Detect columns from header (deterministic)
      const headerIdx = findHeaderRow(pastePreview)
      let cols: ColMap | null = null
      let dataStartIdx = 0

      if (headerIdx >= 0) {
        cols = detectColumns(pastePreview[headerIdx])
        dataStartIdx = headerIdx + 1
      }

      if (!cols || cols.description === null) {
        // Fallback: send to AI for structure detection
        await aiExtractItems(pastePreview)
        return
      }

      // Step 2: Extract data rows (deterministic)
      const dataRows = pastePreview.slice(dataStartIdx).filter(r => isDataRow(r, cols))

      if (dataRows.length === 0) {
        setClassifyError('No se encontraron items de datos. Verifica que copiaste la tabla correcta.')
        setClassifying(false)
        return
      }

      // Step 3: Parse items deterministically
      const defaultType = form.type === 'mixed' ? 'purchase' : (form.type as ReviewRow['type'])
      const parsedItems: ReviewRow[] = dataRows.map((row, i) => ({
        rowIndex: i,
        item_number: cols.item_number !== null ? parseColNumber(row[cols.item_number]) || null : null,
        description: cols.description !== null ? row[cols.description]?.trim() ?? '' : '',
        unit: cols.unit !== null ? row[cols.unit]?.trim() ?? '' : '',
        quantity: cols.quantity !== null ? parseColNumber(row[cols.quantity]) || 1 : 1,
        sale_price: cols.sale_price !== null ? parseColNumber(row[cols.sale_price]) || 0 : 0,
        selected: true,
        short_name: '',
        category_id: '',
        type: defaultType,
      }))

      setReviewRows(parsedItems)

      // Step 4: AI classifies descriptions only (short_name, category, type)
      const descriptions = parsedItems.map(it => it.description).filter(Boolean)
      if (descriptions.length > 0) {
        const res = await fetchWithRetry('/api/classify-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ descriptions, categories }),
        })
        const data = await res.json()
        if (data.items && Array.isArray(data.items)) {
          setReviewRows(prev => prev.map((row, i) => {
            const ai = data.items[i] as { short_name?: string; category?: string; type?: string } | undefined
            if (!ai) return row
            const matchedCat = categories.find(c => c.name.toLowerCase() === (ai.category ?? '').toLowerCase())
            return {
              ...row,
              short_name: ai.short_name ?? row.short_name,
              category_id: matchedCat?.id ?? row.category_id,
              type: (ai.type as ReviewRow['type']) ?? row.type,
            }
          }))
        }
      }
    } catch {
      setClassifyError('Error al procesar. Intenta de nuevo.')
    } finally {
      setClassifying(false)
    }
  }

  async function aiExtractItems(rawRows: string[][]) {
    try {
      const res = await fetchWithRetry('/api/extract-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: rawRows,
          categories,
          contractType: form.type || 'mixed',
        }),
      })

      const data = await res.json()

      if (!data.items || data.items.length === 0) {
        setClassifyError(`La IA no pudo interpretar los datos.${data.reason ? ' ' + data.reason : ''} Intenta copiar solo la tabla de items.`)
        return
      }

      const defaultType = form.type === 'mixed' ? 'purchase' : (form.type as ReviewRow['type'])

      const result: ReviewRow[] = data.items.map((item: {
        item_number?: number | null
        description?: string
        short_name?: string
        unit?: string
        quantity?: number
        sale_price?: number
        category?: string
        type?: string
      }, i: number) => {
        const matchedCat = categories.find(
          c => c.name.toLowerCase() === (item.category ?? '').toLowerCase()
        )
        return {
          rowIndex: i,
          item_number: item.item_number ?? null,
          description: item.description ?? '',
          unit: item.unit ?? '',
          quantity: item.quantity ?? 1,
          sale_price: item.sale_price ?? 0,
          selected: true,
          short_name: item.short_name ?? '',
          category_id: matchedCat?.id ?? '',
          type: (item.type as ReviewRow['type']) ?? defaultType,
        }
      })

      setReviewRows(result)
    } catch {
      setClassifyError('Error al procesar con IA. Intenta de nuevo.')
    } finally {
      setClassifying(false)
    }
  }

  function handleRetryClassify() {
    if (pastePreview && pastePreview.length > 0) {
      setStep('review')
      setClassifying(true)
      setClassifyError(null)
      setReviewRows([])
      handleProcessPaste()
    }
  }

  // ── Import ─────────────────────────────────────────────────
  async function handleImport() {
    const selected = reviewRows.filter(r => r.selected)
    if (selected.length === 0) { setError('No hay filas seleccionadas para importar.'); return }

    const invalid = selected.filter(r => r.quantity <= 0)
    if (invalid.length > 0) {
      setError(`Hay ${invalid.length} fila(s) con cantidad invalida (debe ser > 0).`)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const items = selected.map((r, i) => ({
        contract_id: contractId,
        item_number: r.item_number ?? i + 1,
        short_name: r.short_name || r.description.slice(0, 60),
        description: r.description,
        type: r.type,
        category_id: r.category_id || null,
        quantity: r.quantity,
        unit: r.unit || null,
        sale_price: r.sale_price || null,
        assigned_to: batchAssignTo || null,
        status: 'pending',
        payment_status: 'unpaid',
        created_by: currentUserId,
      }))

      const { error: insertError } = await supabase.from('items').insert(items)
      if (insertError) throw new Error(insertError.message)

      const { error: updateError } = await supabase
        .from('contracts')
        .update({ status: 'active' })
        .eq('id', contractId!)
      if (updateError) throw new Error(updateError.message)

      await supabase.from('activity_log').insert({
        user_id: currentUserId,
        action: 'items_imported',
        entity_type: 'contract',
        entity_id: contractId,
        details: { count: items.length },
      })

      router.push(`/dashboard/${contractId}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al importar items.')
      setLoading(false)
    }
  }

  // ── Render helpers ─────────────────────────────────────────
  function updateReviewRow(index: number, updates: Partial<ReviewRow>) {
    setReviewRows(prev =>
      prev.map((r, i) => (i === index ? { ...r, ...updates } : r))
    )
  }

  function isRowInvalid(row: ReviewRow): boolean {
    return row.quantity <= 0
  }

  // ── Step indicators ────────────────────────────────────────
  const steps: { key: Step; label: string }[] = [
    { key: 'form', label: 'Contrato' },
    { key: 'paste', label: 'Pegar items' },
    { key: 'review', label: 'Revisar e importar' },
  ]

  const stepIndex = steps.findIndex(s => s.key === step)

  return (
    <div className="p-8 max-w-6xl">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div
              className={`flex items-center gap-2 text-sm ${
                i <= stepIndex ? 'text-gray-900 font-medium' : 'text-gray-400'
              }`}
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  i < stepIndex
                    ? 'bg-gray-900 text-white'
                    : i === stepIndex
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-200 text-gray-500'
                }`}
              >
                {i < stepIndex ? '✓' : i + 1}
              </span>
              {s.label}
            </div>
            {i < steps.length - 1 && <div className="w-8 h-px bg-gray-300" />}
          </div>
        ))}
      </div>

      {/* ── STEP 1: Contract form ───────────────────────────── */}
      {step === 'form' && (
        <div className="max-w-2xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Nuevo Contrato</h1>
            <p className="text-gray-500 text-sm mt-1">Completa los datos basicos del contrato.</p>
          </div>

          <form onSubmit={handleCreateContract} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre del contrato
              </label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="Ej: Suministro materiales de oficina — ANLA 2026"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Entidad contratante
              </label>
              {entities.length === 0 ? (
                <p className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                  No hay entidades registradas.{' '}
                  <a href="/entities" className="underline font-medium">Crea una primero.</a>
                </p>
              ) : (
                <select
                  value={form.entity_id}
                  onChange={e => setForm({ ...form, entity_id: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">Selecciona una entidad...</option>
                  {entities.map(ent => (
                    <option key={ent.id} value={ent.id}>{ent.name}</option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Empresa (contratante)
              </label>
              {organizations.length === 0 ? (
                <p className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                  No hay empresas registradas.{' '}
                  <a href="/organizations" className="underline font-medium">Crea una primero.</a>
                </p>
              ) : (
                <select
                  value={form.organization_id}
                  onChange={e => setForm({ ...form, organization_id: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">Selecciona una empresa...</option>
                  {organizations.map(org => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tipo de contrato
              </label>
              <div className="grid grid-cols-3 gap-3">
                {CONTRACT_TYPES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setForm({ ...form, type: t.value })}
                    className={`p-3 border rounded-lg text-left transition-colors ${
                      form.type === t.value
                        ? 'border-gray-900 bg-gray-50'
                        : 'border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    <p className="text-sm font-medium text-gray-900">{t.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de inicio</label>
                <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de fin</label>
                <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
            </div>

            {profiles.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Asignar a</label>
                <select value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.role})</option>
                  ))}
                </select>
              </div>
            )}

            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => router.back()}
                className="px-5 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={loading || organizations.length === 0}
                className="flex-1 bg-gray-900 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {loading ? 'Creando...' : 'Siguiente: Pegar items'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── STEP 2: Paste items ─────────────────────────────── */}
      {step === 'paste' && (
        <div className="max-w-4xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Pegar items del Excel</h1>
            <p className="text-gray-500 text-sm mt-1">
              Abre tu Excel, selecciona la tabla de items (con encabezados) y pega aqui con Ctrl+V.
            </p>
          </div>

          {/* Paste area */}
          <textarea
            value={pasteText}
            onChange={e => handlePaste(e.target.value)}
            onPaste={e => {
              e.preventDefault()
              const html = e.clipboardData.getData('text/html')
              if (html) {
                const rows = parseHTMLTable(html)
                if (rows.length > 0) {
                  setPastePreview(rows)
                  setPasteText(`[Tabla HTML: ${rows.length} filas × ${rows[0].length} columnas]`)
                  return
                }
              }
              const text = e.clipboardData.getData('text/plain')
              handlePaste(text)
            }}
            placeholder={"Selecciona las celdas en Excel y pega aqui (Ctrl+V)\n\nEjemplo:\nItem\tDescripcion\tUnidad\tCantidad\tValor Unitario\n1\tCemento gris 50kg\tBulto\t200\t25000\n2\tArena lavada\tm3\t50\t85000"}
            rows={8}
            className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900 font-mono resize-none"
          />

          {/* Preview */}
          {pastePreview && pastePreview.length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-gray-600 mb-2">
                {pastePreview.length} filas detectadas — la IA identificara encabezados, datos y columnas automaticamente
              </p>
              <div className="bg-white border border-gray-200 rounded-xl overflow-auto max-h-60">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-gray-100">
                    {pastePreview.slice(0, 6).map((row, ri) => (
                      <tr key={ri} className={ri === 0 ? 'bg-gray-50 font-medium' : ''}>
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-3 py-2 text-gray-600 whitespace-nowrap">
                            {cell || ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {pastePreview.length > 6 && (
                      <tr>
                        <td colSpan={pastePreview[0]?.length || 1} className="px-3 py-2 text-gray-400 text-center">
                          ... y {pastePreview.length - 6} filas mas
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mt-4">{error}</p>}

          <div className="flex gap-3 mt-6">
            <button type="button" onClick={() => router.push(`/dashboard/${contractId}`)}
              className="px-5 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Omitir
            </button>
            <button
              type="button"
              onClick={handleProcessPaste}
              disabled={!pastePreview || pastePreview.length === 0}
              className="flex-1 bg-gray-900 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Procesar {pastePreview ? `(${pastePreview.length} filas)` : ''}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Review and import ───────────────────────── */}
      {step === 'review' && (
        <div>
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Revisar e importar</h1>
              <p className="text-gray-500 text-sm mt-1">
                Revisa los items antes de importarlos. Edita lo que necesites.
              </p>
            </div>

            <div className="flex items-center gap-3">
              {profiles.length > 1 && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 whitespace-nowrap">Asignar todo a:</label>
                  <select value={batchAssignTo} onChange={e => setBatchAssignTo(e.target.value)}
                    className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
                    {profiles.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* AI status */}
          {classifying && (
            <div className="mb-4 text-sm text-blue-700 bg-blue-50 border border-blue-200 px-4 py-3 rounded-lg">
              Procesando con IA...
            </div>
          )}
          {classifyError && (
            <div className="mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 px-4 py-3 rounded-lg flex items-center justify-between">
              <span>{classifyError}</span>
              <button onClick={handleRetryClassify} disabled={classifying}
                className="text-xs font-medium underline hover:no-underline">
                Reintentar
              </button>
            </div>
          )}

          {/* Review table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-auto mb-6">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="px-3 py-2 w-8">
                    <input type="checkbox" checked={reviewRows.every(r => r.selected)}
                      onChange={e => setReviewRows(prev => prev.map(r => ({ ...r, selected: e.target.checked })))}
                      className="rounded" />
                  </th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 w-12">#</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 w-40">Nombre corto</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Descripcion</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 w-36">Categoria</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 w-28">Tipo</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 w-16">Cant.</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 w-20">Unidad</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 w-28">Valor unit.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reviewRows.slice(reviewPage * ROWS_PER_PAGE, (reviewPage + 1) * ROWS_PER_PAGE).map((row, i) => {
                  const realIndex = reviewPage * ROWS_PER_PAGE + i
                  return (
                  <tr key={realIndex}
                    className={`${
                      !row.selected ? 'opacity-40 bg-gray-50'
                        : isRowInvalid(row) ? 'bg-red-50'
                        : 'hover:bg-gray-50'
                    } transition-colors`}>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={row.selected}
                        onChange={e => updateReviewRow(realIndex, { selected: e.target.checked })} className="rounded" />
                    </td>
                    <td className="px-3 py-2 text-gray-400 text-xs">{row.item_number ?? realIndex + 1}</td>
                    <td className="px-3 py-2">
                      <input type="text" value={row.short_name}
                        onChange={e => updateReviewRow(realIndex, { short_name: e.target.value })}
                        placeholder={row.description.slice(0, 30)}
                        className="w-full px-2 py-1 border border-gray-200 rounded text-xs text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-gray-900" />
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 max-w-xs truncate" title={row.description}>
                      {row.description}
                    </td>
                    <td className="px-3 py-2">
                      <select value={row.category_id}
                        onChange={e => updateReviewRow(realIndex, { category_id: e.target.value })}
                        className="w-full px-1 py-1 border border-gray-200 rounded text-xs text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-gray-900">
                        <option value="">Sin categoria</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      {form.type === 'mixed' ? (
                        <select value={row.type}
                          onChange={e => updateReviewRow(realIndex, { type: e.target.value as ReviewRow['type'] })}
                          className="w-full px-1 py-1 border border-gray-200 rounded text-xs text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-gray-900">
                          <option value="purchase">Compra</option>
                          <option value="logistics">Logistica</option>
                          <option value="service">Servicio</option>
                        </select>
                      ) : (
                        <span className="text-xs text-gray-500 capitalize">{form.type}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" value={row.quantity}
                        onChange={e => updateReviewRow(realIndex, { quantity: parseFloat(e.target.value) || 0 })}
                        min={0} step="any"
                        className={`w-full px-2 py-1 border rounded text-xs text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-gray-900 ${
                          row.quantity <= 0 ? 'border-red-400' : 'border-gray-200'
                        }`} />
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">{row.unit || '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-600 text-right font-mono">
                      {row.sale_price ? `$${row.sale_price.toLocaleString('es-CO')}` : '—'}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {reviewRows.length > ROWS_PER_PAGE && (
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-gray-400">
                Mostrando {reviewPage * ROWS_PER_PAGE + 1}–{Math.min((reviewPage + 1) * ROWS_PER_PAGE, reviewRows.length)} de {reviewRows.length} items
              </p>
              <div className="flex gap-2">
                <button type="button" disabled={reviewPage === 0} onClick={() => setReviewPage(p => p - 1)}
                  className="px-3 py-1 text-sm border rounded-lg disabled:opacity-40">Anterior</button>
                <button type="button" disabled={(reviewPage + 1) * ROWS_PER_PAGE >= reviewRows.length}
                  onClick={() => setReviewPage(p => p + 1)}
                  className="px-3 py-1 text-sm border rounded-lg disabled:opacity-40">Siguiente</button>
              </div>
            </div>
          )}

          {/* Summary + Total */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">
              {reviewRows.filter(r => r.selected).length} de {reviewRows.length} items seleccionados
              {reviewRows.some(r => r.selected && isRowInvalid(r)) && (
                <span className="text-red-600 ml-2">
                  — {reviewRows.filter(r => r.selected && isRowInvalid(r)).length} con errores
                </span>
              )}
            </p>
            <p className="text-sm font-semibold text-gray-900">
              Total: ${reviewRows.filter(r => r.selected).reduce((sum, r) => sum + r.quantity * r.sale_price, 0).toLocaleString('es-CO')}
            </p>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-4">{error}</p>}

          <div className="flex gap-3">
            <button type="button" onClick={() => { setStep('paste'); setReviewRows([]) }}
              className="px-5 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Volver
            </button>
            <button type="button" onClick={handleImport} disabled={loading || classifying}
              className="flex-1 bg-gray-900 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {loading ? 'Importando...' : `Confirmar e importar (${reviewRows.filter(r => r.selected).length} items)`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
