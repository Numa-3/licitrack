'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import * as XLSX from 'xlsx'
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

type ColumnMapping = {
  item_number: number | null
  description: number | null
  unit: number | null
  quantity: number | null
  sale_price: number | null
}

// ── Constants ──────────────────────────────────────────────────
const CONTRACT_TYPES = [
  { value: 'supply', label: 'Suministro', icon: '🛒', description: 'Adquisición de bienes' },
  { value: 'construction', label: 'Obra', icon: '🏗️', description: 'Construcción e infraestructura' },
  { value: 'sale', label: 'Compraventa', icon: '💰', description: 'Compra y venta de bienes' },
  { value: 'service', label: 'Servicios', icon: '🔧', description: 'Prestación de servicios' },
  { value: 'logistics', label: 'Logística', icon: '🚚', description: 'Eventos, transporte y alojamiento' },
  { value: 'mixed', label: 'Mixto', icon: '📦', description: 'Combinación de tipos' },
]

// Column detection patterns — ordered from most specific to least specific
const COL_PATTERNS: Record<keyof ColumnMapping, RegExp[]> = {
  item_number: [
    /^[#nº°]?\s*[ìíiî]tem\s*[#nº°]?$/i, // "Item", "# Item", "Item #"
    /^[#nº°]$/i,                           // "#"
    /^n[uúü]m(ero)?\.?$/i,                 // "Num", "Número"
    /^(item|ítem|ìtem)$/i,                 // exacto
    /^no\.?\s*$/i,                          // "No", "No."
    /^ord(en)?\.?$/i,                       // "Orden", "Ord"
    /^pos(ici[oó]n)?\.?$/i,                 // "Posición", "Pos"
    /^it(em)?\.?$/i,                        // "It", "Item"
  ],
  description: [
    /descrip/i,       // "Descripción", "Description"
    /detalle/i,       // "Detalle"
    /especificaci/i,  // "Especificación"
    /concepto/i,      // "Concepto"
    /bien(es)?/i,     // "Bien", "Bienes"
    /servicio/i,      // "Servicio"
    /objeto/i,        // "Objeto"
    /producto/i,      // "Producto"
    /denominaci/i,    // "Denominación"
    /nombre/i,        // "Nombre"
    /articulo/i,      // "Artículo"
    /elemento/i,      // "Elemento"
    /material/i,      // "Material"
    /referencia/i,    // "Referencia"
  ],
  unit: [
    /unidad.*medida/i,  // "Unidad de Medida" — más específico primero
    /medida.*unidad/i,
    /unidad/i,
    /medida/i,
    /^u\.?\s*m\.?$/i,   // "UM", "U.M."
    /^und\.?$/i,        // "Und"
    /^unid\.?$/i,       // "Unid"
    /^u\.?$/i,          // "U"
  ],
  quantity: [
    /cantidad/i,    // "Cantidad"
    /cant\.?/i,     // "Cant", "Cant."
    /^qty\.?$/i,    // "Qty"
    /^q$/i,         // "Q"
    /volumen/i,     // "Volumen"
    /^ctd\.?$/i,    // "Ctd"
  ],
  sale_price: [
    /valor.*unit/i,   // "Valor Unitario" — más específico primero
    /precio.*unit/i,  // "Precio Unitario"
    /unit.*valor/i,
    /unit.*precio/i,
    /vr\.?\s*unit/i,  // "Vr Unit", "Vr. Unit"
    /v\.?\s*unit/i,   // "V. Unit"
    /p\.?\s*unit/i,   // "P. Unit"
    /unitario/i,      // cualquier cosa con "unitario"
    /valor/i,         // "Valor" — menos específico al final
    /precio/i,        // "Precio"
    /costo/i,         // "Costo"
    /tarifa/i,        // "Tarifa"
  ],
}

function detectColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    item_number: null,
    description: null,
    unit: null,
    quantity: null,
    sale_price: null,
  }

  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] ?? '').trim()
    if (!h) continue
    for (const [key, patterns] of Object.entries(COL_PATTERNS)) {
      if (mapping[key as keyof ColumnMapping] !== null) continue
      if (patterns.some((p) => p.test(h))) {
        mapping[key as keyof ColumnMapping] = i
        break
      }
    }
  }
  return mapping
}

function parseNumeric(val: unknown): number {
  if (typeof val === 'number') return val
  if (typeof val === 'string') {
    // Remove currency symbols, dots as thousands separator, replace comma with dot
    const cleaned = val.replace(/[$\s.]/g, '').replace(',', '.')
    const n = parseFloat(cleaned)
    return isNaN(n) ? 0 : n
  }
  return 0
}

// ── Steps ──────────────────────────────────────────────────────
type Step = 'form' | 'upload' | 'mapping' | 'review'

export default function NewContractForm({ organizations, profiles, categories, entities, currentUserId }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  // Step 2: Excel upload
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState<string>('')
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [rawHeaders, setRawHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<unknown[][]>([])
  const [dragOver, setDragOver] = useState(false)

  // Step 3: Column mapping
  const [mapping, setMapping] = useState<ColumnMapping>({
    item_number: null,
    description: null,
    unit: null,
    quantity: null,
    sale_price: null,
  })

  // Step 4: Review
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([])
  const [batchAssignTo, setBatchAssignTo] = useState<string>(currentUserId)
  const [classifying, setClassifying] = useState(false)
  const [classifyError, setClassifyError] = useState<string | null>(null)

  // Pagination
  const [previewPage, setPreviewPage] = useState(0)
  const [reviewPage, setReviewPage] = useState(0)
  const ROWS_PER_PAGE = 20

  // Shared
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Step 1: Create contract ────────────────────────────────
  async function handleCreateContract(e: React.FormEvent) {
    e.preventDefault()
    if (!form.entity_id) { setError('Seleccioná una entidad contratante.'); return }
    if (!form.type) { setError('Seleccioná el tipo de contrato.'); return }
    if (!form.organization_id) { setError('Seleccioná una empresa.'); return }

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
    setStep('upload')
  }

  // ── Step 2: Excel parsing ──────────────────────────────────
  function processFile(file: File) {
    setError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        setWorkbook(wb)
        setSheetNames(wb.SheetNames)

        if (wb.SheetNames.length === 1) {
          loadSheet(wb, wb.SheetNames[0])
        } else {
          setSelectedSheet('')
        }
      } catch {
        setError('No se pudo leer el archivo. Asegurate de que sea un Excel válido (.xlsx o .xls).')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function loadSheet(wb: XLSX.WorkBook, sheetName: string) {
    setSelectedSheet(sheetName)
    const sheet = wb.Sheets[sheetName]
    const json = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })

    if (json.length < 2) {
      setError('La hoja está vacía o solo tiene encabezados.')
      return
    }

    // Auto-detect header row: find first row with at least 1 non-empty cell that matches any pattern
    const allPatterns = Object.values(COL_PATTERNS).flat()
    let headerRowIndex = 0
    for (let r = 0; r < Math.min(json.length, 10); r++) {
      const row = (json[r] as unknown[]).map((h) => String(h ?? '').trim())
      const matches = row.filter((h) => allPatterns.some((p) => p.test(h)))
      if (matches.length >= 1) { headerRowIndex = r; break }
    }

    const headers = (json[headerRowIndex] as unknown[]).map((h) => String(h ?? ''))
    const rows = json.slice(headerRowIndex + 1).filter((row) =>
      (row as unknown[]).some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '')
    ) as unknown[][]

    setRawHeaders(headers)
    setRawRows(rows)

    const detected = detectColumns(headers)
    const detectedCount = Object.values(detected).filter(v => v !== null).length

    // If regex detects fewer than 2 columns (description at minimum), use AI extraction directly
    if (detectedCount < 2) {
      aiExtractItems(json.filter((row) =>
        (row as unknown[]).some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '')
      ) as unknown[][])
      return
    }

    setMapping(detected)
    setStep('mapping')
  }

  async function aiExtractItems(rawAllRows: unknown[][]) {
    setStep('review')
    setClassifying(true)
    setClassifyError(null)
    setReviewRows([])

    try {
      const res = await fetchWithRetry('/api/extract-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: rawAllRows.slice(0, 83),
          categories,
          contractType: form.type || 'mixed',
        }),
      })

      const data = await res.json()

      if (!data.items || data.items.length === 0) {
        setClassifyError('La IA no pudo interpretar el Excel. Ajusta las columnas manualmente.')
        setStep('mapping')
        setMapping({ item_number: null, description: null, unit: null, quantity: null, sale_price: null })
        return
      }

      const defaultType = form.type === 'mixed' ? 'purchase' : (form.type as ReviewRow['type'])

      const rows: ReviewRow[] = data.items.map((item: {
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

      setReviewRows(rows)
    } catch {
      setClassifyError('Error al procesar con IA. Ajusta las columnas manualmente.')
      setStep('mapping')
      setMapping({ item_number: null, description: null, unit: null, quantity: null, sale_price: null })
    } finally {
      setClassifying(false)
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }, [])

  // ── Step 3: Mapping → Parse → Review ───────────────────────
  async function handleConfirmMapping() {
    if (mapping.description === null) {
      setError('La columna de descripción es obligatoria.')
      return
    }

    setError(null)
    const defaultType = form.type === 'mixed' ? 'purchase' : (form.type as ReviewRow['type'])

    const parsed: ParsedRow[] = rawRows.map((row, i) => ({
      rowIndex: i,
      item_number: mapping.item_number !== null ? parseNumeric(row[mapping.item_number]) || null : null,
      description: String(row[mapping.description!] ?? '').trim(),
      unit: mapping.unit !== null ? String(row[mapping.unit] ?? '').trim() : '',
      quantity: mapping.quantity !== null ? parseNumeric(row[mapping.quantity]) : 1,
      sale_price: mapping.sale_price !== null ? parseNumeric(row[mapping.sale_price]) : 0,
    })).filter((r) => r.description.length > 0)

    // Build review rows with empty AI fields
    const rows: ReviewRow[] = parsed.map((p) => ({
      ...p,
      selected: true,
      short_name: '',
      category_id: '',
      type: defaultType,
    }))

    setReviewRows(rows)
    setStep('review')

    // Trigger AI classification in background
    classifyItems(parsed, rows)
  }

  async function classifyItems(parsed: ParsedRow[], currentRows: ReviewRow[]) {
    setClassifying(true)
    setClassifyError(null)

    try {
      const res = await fetchWithRetry('/api/classify-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descriptions: parsed.map((p) => p.description),
          categories: categories,
        }),
      })

      const data = await res.json()

      if (data.items && data.items.length > 0) {
        setReviewRows((prev) =>
          prev.map((row, i) => {
            const ai = data.items.find(
              (item: { item: number }) => item.item === i + 1
            )
            if (!ai) return row

            const matchedCat = categories.find(
              (c) => c.name.toLowerCase() === (ai.category ?? '').toLowerCase()
            )

            return {
              ...row,
              short_name: ai.short_name || row.short_name,
              category_id: matchedCat?.id || row.category_id,
              type: ai.type || row.type,
            }
          })
        )
      } else {
        setClassifyError(
          'No se pudo clasificar automáticamente. Podés completar a mano o reintentar.'
        )
      }
    } catch {
      setClassifyError(
        'No se pudo clasificar automáticamente. Podés completar a mano o reintentar.'
      )
    } finally {
      setClassifying(false)
    }
  }

  function handleRetryClassify() {
    const parsed = reviewRows.map((r) => ({
      rowIndex: r.rowIndex,
      item_number: r.item_number,
      description: r.description,
      unit: r.unit,
      quantity: r.quantity,
      sale_price: r.sale_price,
    }))
    classifyItems(parsed, reviewRows)
  }

  // ── Step 5: Import ─────────────────────────────────────────
  async function handleImport() {
    const selected = reviewRows.filter((r) => r.selected)
    if (selected.length === 0) {
      setError('No hay filas seleccionadas para importar.')
      return
    }

    // Validate
    const invalid = selected.filter((r) => r.quantity <= 0)
    if (invalid.length > 0) {
      setError(`Hay ${invalid.length} fila(s) con cantidad inválida (debe ser > 0).`)
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

      // Update contract status to active
      const { error: updateError } = await supabase
        .from('contracts')
        .update({ status: 'active' })
        .eq('id', contractId!)
      if (updateError) throw new Error(updateError.message)

      // Log activity
      await supabase.from('activity_log').insert({
        user_id: currentUserId,
        action: 'items_imported',
        entity_type: 'contract',
        entity_id: contractId,
        details: { count: items.length },
      })

      router.push(`/dashboard/${contractId}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al importar ítems.')
      setLoading(false)
    }
  }

  // ── Render helpers ─────────────────────────────────────────
  function updateReviewRow(index: number, updates: Partial<ReviewRow>) {
    setReviewRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...updates } : r))
    )
  }

  function isRowInvalid(row: ReviewRow): boolean {
    return row.quantity <= 0
  }

  // ── Step indicators ────────────────────────────────────────
  const steps: { key: Step; label: string }[] = [
    { key: 'form', label: 'Contrato' },
    { key: 'upload', label: 'Subir Excel' },
    { key: 'mapping', label: 'Columnas' },
    { key: 'review', label: 'Revisar e importar' },
  ]

  const stepIndex = steps.findIndex((s) => s.key === step)

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
            <p className="text-gray-500 text-sm mt-1">Completá los datos básicos del contrato.</p>
          </div>

          <form onSubmit={handleCreateContract} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre del contrato
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
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
                  <a href="/entities" className="underline font-medium">
                    Creá una primero.
                  </a>
                </p>
              ) : (
                <select
                  value={form.entity_id}
                  onChange={(e) => setForm({ ...form, entity_id: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">Seleccioná una entidad...</option>
                  {entities.map((ent) => (
                    <option key={ent.id} value={ent.id}>
                      {ent.name}
                    </option>
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
                  <a href="/organizations" className="underline font-medium">
                    Creá una primero.
                  </a>
                </p>
              ) : (
                <select
                  value={form.organization_id}
                  onChange={(e) => setForm({ ...form, organization_id: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">Seleccioná una empresa...</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tipo de contrato
              </label>
              <div className="grid grid-cols-3 gap-3">
                {CONTRACT_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setForm({ ...form, type: t.value })}
                    className={`flex items-start gap-3 p-3 border rounded-lg text-left transition-colors ${
                      form.type === t.value
                        ? 'border-gray-900 bg-gray-50'
                        : 'border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    <span className="text-xl mt-0.5">{t.icon}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{t.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha de inicio
                </label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha de fin
                </label>
                <input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
            </div>

            {profiles.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Asignar a
                </label>
                <select
                  value={form.assigned_to}
                  onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.role})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => router.back()}
                className="px-5 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading || organizations.length === 0}
                className="flex-1 bg-gray-900 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Creando...' : 'Siguiente: Subir Excel'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── STEP 2: Excel upload ────────────────────────────── */}
      {step === 'upload' && (
        <div className="max-w-2xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Subir ficha técnica</h1>
            <p className="text-gray-500 text-sm mt-1">
              Arrastrá el archivo Excel con los ítems del contrato.
            </p>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
              dragOver
                ? 'border-gray-900 bg-gray-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <div className="text-4xl mb-3">📄</div>
            <p className="text-sm font-medium text-gray-700">
              Arrastrá tu archivo Excel acá
            </p>
            <p className="text-xs text-gray-400 mt-1">o hacé clic para seleccionar</p>
            <p className="text-xs text-gray-400 mt-1">.xlsx, .xls</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Sheet selector (multiple sheets) */}
          {sheetNames.length > 1 && (
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                El archivo tiene varias hojas. Seleccioná una:
              </label>
              <div className="flex flex-wrap gap-2">
                {sheetNames.map((name) => (
                  <button
                    key={name}
                    onClick={() => workbook && loadSheet(workbook, name)}
                    className={`px-4 py-2 border rounded-lg text-sm transition-colors ${
                      selectedSheet === name
                        ? 'border-gray-900 bg-gray-50 font-medium'
                        : 'border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mt-4">{error}</p>
          )}

          <div className="mt-6">
            <button
              type="button"
              onClick={() => router.push(`/dashboard/${contractId}`)}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Omitir y agregar ítems después →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Column mapping ──────────────────────────── */}
      {step === 'mapping' && (
        <div>
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Mapear columnas</h1>
            <p className="text-gray-500 text-sm mt-1">
              Verificá que las columnas se detectaron correctamente. Si no, ajustalas manualmente.
            </p>
          </div>

          {/* Column mapping dropdowns */}
          <div className="grid grid-cols-5 gap-4 mb-6">
            {(
              [
                { key: 'item_number', label: '# Ítem', required: false },
                { key: 'description', label: 'Descripción', required: true },
                { key: 'unit', label: 'Unidad', required: false },
                { key: 'quantity', label: 'Cantidad', required: false },
                { key: 'sale_price', label: 'Valor unitario', required: false },
              ] as const
            ).map(({ key, label, required }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {label} {required && <span className="text-red-500">*</span>}
                </label>
                <select
                  value={mapping[key] ?? ''}
                  onChange={(e) =>
                    setMapping({
                      ...mapping,
                      [key]: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  className={`w-full px-2 py-1.5 border rounded-lg text-xs text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 ${
                    required && mapping[key] === null
                      ? 'border-red-300'
                      : 'border-gray-300'
                  }`}
                >
                  <option value="">— No mapear —</option>
                  {rawHeaders.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Columna ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* Preview table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-auto max-h-96 mb-6">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  {rawHeaders.map((h, i) => (
                    <th
                      key={i}
                      className={`text-left px-3 py-2 font-medium whitespace-nowrap ${
                        Object.values(mapping).includes(i)
                          ? 'text-gray-900 bg-blue-50'
                          : 'text-gray-400'
                      }`}
                    >
                      {h || `Col ${i + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rawRows.slice(previewPage * ROWS_PER_PAGE, (previewPage + 1) * ROWS_PER_PAGE).map((row, ri) => (
                  <tr key={ri}>
                    {rawHeaders.map((_, ci) => (
                      <td
                        key={ci}
                        className={`px-3 py-2 whitespace-nowrap ${
                          Object.values(mapping).includes(ci) ? 'text-gray-900' : 'text-gray-400'
                        }`}
                      >
                        {String((row as unknown[])[ci] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rawRows.length > ROWS_PER_PAGE && (
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-gray-400">
                Mostrando {previewPage * ROWS_PER_PAGE + 1}–{Math.min((previewPage + 1) * ROWS_PER_PAGE, rawRows.length)} de {rawRows.length} filas
              </p>
              <div className="flex gap-2">
                <button type="button" disabled={previewPage === 0} onClick={() => setPreviewPage(p => p - 1)} className="px-3 py-1 text-sm border rounded-lg disabled:opacity-40">← Anterior</button>
                <button type="button" disabled={(previewPage + 1) * ROWS_PER_PAGE >= rawRows.length} onClick={() => setPreviewPage(p => p + 1)} className="px-3 py-1 text-sm border rounded-lg disabled:opacity-40">Siguiente →</button>
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-4">{error}</p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep('upload')}
              className="px-5 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Volver
            </button>
            <button
              type="button"
              onClick={handleConfirmMapping}
              className="flex-1 bg-gray-900 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
            >
              Confirmar columnas y clasificar ({rawRows.length} filas)
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Review and import ───────────────────────── */}
      {step === 'review' && (
        <div>
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Revisar e importar</h1>
              <p className="text-gray-500 text-sm mt-1">
                Revisá los ítems antes de importarlos. Editá lo que necesites.
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* Batch assign */}
              {profiles.length > 1 && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 whitespace-nowrap">Asignar todo a:</label>
                  <select
                    value={batchAssignTo}
                    onChange={(e) => setBatchAssignTo(e.target.value)}
                    className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* AI status */}
          {classifying && (
            <div className="mb-4 text-sm text-blue-700 bg-blue-50 border border-blue-200 px-4 py-3 rounded-lg flex items-center gap-2">
              <span className="animate-spin">⏳</span>
              Clasificando ítems con IA...
            </div>
          )}
          {classifyError && (
            <div className="mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 px-4 py-3 rounded-lg flex items-center justify-between">
              <span>{classifyError}</span>
              <button
                onClick={handleRetryClassify}
                disabled={classifying}
                className="text-xs font-medium underline hover:no-underline"
              >
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
                    <input
                      type="checkbox"
                      checked={reviewRows.every((r) => r.selected)}
                      onChange={(e) =>
                        setReviewRows((prev) =>
                          prev.map((r) => ({ ...r, selected: e.target.checked }))
                        )
                      }
                      className="rounded"
                    />
                  </th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 w-12">#</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 w-40">Nombre corto</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Descripción</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 w-36">Categoría</th>
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
                  <tr
                    key={realIndex}
                    className={`${
                      !row.selected
                        ? 'opacity-40 bg-gray-50'
                        : isRowInvalid(row)
                          ? 'bg-red-50'
                          : 'hover:bg-gray-50'
                    } transition-colors`}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={(e) => updateReviewRow(realIndex, { selected: e.target.checked })}
                        className="rounded"
                      />
                    </td>
                    <td className="px-3 py-2 text-gray-400 text-xs">
                      {row.item_number ?? realIndex + 1}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={row.short_name}
                        onChange={(e) => updateReviewRow(realIndex, { short_name: e.target.value })}
                        placeholder={row.description.slice(0, 30)}
                        className="w-full px-2 py-1 border border-gray-200 rounded text-xs text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-gray-900"
                      />
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 max-w-xs truncate" title={row.description}>
                      {row.description}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={row.category_id}
                        onChange={(e) => updateReviewRow(realIndex, { category_id: e.target.value })}
                        className="w-full px-1 py-1 border border-gray-200 rounded text-xs text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-gray-900"
                      >
                        <option value="">Sin categoría</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      {form.type === 'mixed' ? (
                        <select
                          value={row.type}
                          onChange={(e) =>
                            updateReviewRow(realIndex, { type: e.target.value as ReviewRow['type'] })
                          }
                          className="w-full px-1 py-1 border border-gray-200 rounded text-xs text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-gray-900"
                        >
                          <option value="purchase">Compra</option>
                          <option value="logistics">Logística</option>
                          <option value="service">Servicio</option>
                        </select>
                      ) : (
                        <span className="text-xs text-gray-500 capitalize">{form.type}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={row.quantity}
                        onChange={(e) =>
                          updateReviewRow(realIndex, { quantity: parseFloat(e.target.value) || 0 })
                        }
                        min={0}
                        step="any"
                        className={`w-full px-2 py-1 border rounded text-xs text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-gray-900 ${
                          row.quantity <= 0 ? 'border-red-400' : 'border-gray-200'
                        }`}
                      />
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">{row.unit || '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-600 text-right font-mono">
                      {row.sale_price
                        ? `$${row.sale_price.toLocaleString('es-CO')}`
                        : '—'}
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
                Mostrando {reviewPage * ROWS_PER_PAGE + 1}–{Math.min((reviewPage + 1) * ROWS_PER_PAGE, reviewRows.length)} de {reviewRows.length} ítems
              </p>
              <div className="flex gap-2">
                <button type="button" disabled={reviewPage === 0} onClick={() => setReviewPage(p => p - 1)} className="px-3 py-1 text-sm border rounded-lg disabled:opacity-40">← Anterior</button>
                <button type="button" disabled={(reviewPage + 1) * ROWS_PER_PAGE >= reviewRows.length} onClick={() => setReviewPage(p => p + 1)} className="px-3 py-1 text-sm border rounded-lg disabled:opacity-40">Siguiente →</button>
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">
              {reviewRows.filter((r) => r.selected).length} de {reviewRows.length} ítems seleccionados
              {reviewRows.some((r) => r.selected && isRowInvalid(r)) && (
                <span className="text-red-600 ml-2">
                  — {reviewRows.filter((r) => r.selected && isRowInvalid(r)).length} con errores
                </span>
              )}
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-4">{error}</p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep('mapping')}
              className="px-5 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Volver
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={loading || classifying}
              className="flex-1 bg-gray-900 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading
                ? 'Importando...'
                : `Confirmar e importar (${reviewRows.filter((r) => r.selected).length} ítems)`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
