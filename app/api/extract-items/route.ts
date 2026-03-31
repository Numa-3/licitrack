import { NextRequest } from 'next/server'

/**
 * Two-step AI extraction:
 * 1. AI identifies structure (column roles + which rows are data)
 * 2. Code parses numbers deterministically (no AI number conversion)
 */
export async function POST(request: NextRequest) {
  try {
    const { rows, categories, contractType } = await request.json() as {
      rows: unknown[][]
      categories: { name: string }[]
      contractType: string
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return Response.json({ error: 'No rows provided' }, { status: 400 })
    }

    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      return Response.json({ items: [], reason: 'API key no configurada' })
    }

    const model = process.env.LLM_MODEL || 'qwen/qwen-plus'

    const categoryNames = Array.isArray(categories) && categories.length > 0
      ? categories.map(c => c.name).join(', ')
      : 'Ferretería, Tecnología, Papelería, Aseo, Investigación, Evento, Transporte, Alojamiento, Mantenimiento, Fumigación, General'

    // Strip empty columns
    const maxCols = Math.max(...rows.map(r => (r as unknown[]).length))
    const usedCols: number[] = []
    for (let c = 0; c < maxCols; c++) {
      const hasValue = rows.some(r => {
        const v = (r as unknown[])[c]
        return v !== null && v !== undefined && String(v).trim() !== ''
      })
      if (hasValue) usedCols.push(c)
    }

    const compactRows = rows.slice(0, 83)
      .map(r => usedCols.map(c => (r as unknown[])[c] ?? null))
      .filter(r => r.some(v => v !== null && String(v).trim() !== ''))

    const rowsText = compactRows
      .map((row, i) => `${i}: ${JSON.stringify(row)}`)
      .join('\n')

    const systemPrompt = `Eres un experto en fichas técnicas de licitaciones públicas colombianas (SENA, ICBF, Gobernación, Alcaldías, Ministerios).

Tu tarea es analizar datos crudos de un Excel y devolver DOS cosas:
1. Un mapa de columnas: qué índice de columna corresponde a qué campo
2. La lista de filas que son ítems reales (no encabezados, no totales, no subtotales, no resúmenes)

IMPORTANTE: NO conviertas números. Devuelve los valores de texto TAL CUAL aparecen en los datos.
Responde ÚNICAMENTE con JSON válido, sin markdown, sin explicaciones.`

    const userPrompt = `Contrato tipo: ${contractType}
Categorías disponibles: ${categoryNames}

Datos crudos (cada fila es un array, el índice es el número de fila):
${rowsText}

Responde SOLO con este JSON:
{
  "columns": {
    "item_number": 0,
    "description": 1,
    "unit": 2,
    "quantity": 3,
    "sale_price": 4
  },
  "data_rows": [1, 2, 3, 4],
  "items": [
    {
      "row": 1,
      "short_name": "nombre corto max 6 palabras",
      "category": "nombre de categoría",
      "type": "purchase"
    }
  ]
}

Reglas:
- "columns": índice de columna (basado en 0) para cada campo. Usa null si no existe esa columna
- "data_rows": array con los índices de fila que son ítems reales
- "items": un objeto por cada fila de datos con short_name (max 6 palabras, concreto), category (de la lista), y type (purchase|logistics|service)
- Ignora filas de encabezados, totales, subtotales, filas vacías o de resumen
- Tipos: purchase=compra de producto, logistics=coordinación/transporte/evento, service=prestación de servicio`

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: compactRows.length * 50 + 500,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('OpenRouter error:', res.status, errText)
      return Response.json({ items: [], reason: `Error del modelo AI (${res.status})` })
    }

    const data = await res.json()
    const content = (data.choices?.[0]?.message?.content ?? '') as string

    const cleaned = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()

    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('Could not extract JSON from LLM response:', content)
      return Response.json({ items: [], reason: 'La AI no devolvio JSON valido' })
    }

    const aiResult = JSON.parse(jsonMatch[0]) as {
      columns: {
        item_number?: number | null
        description?: number | null
        unit?: number | null
        quantity?: number | null
        sale_price?: number | null
      }
      data_rows: number[]
      items: { row: number; short_name: string; category: string; type: string }[]
    }

    const cols = aiResult.columns
    if (cols.description === null || cols.description === undefined) {
      return Response.json({ items: [], reason: 'La AI no encontro columna de descripcion' })
    }

    // Step 2: Parse numbers deterministically from raw data
    const items = aiResult.data_rows.map((rowIdx, i) => {
      const row = compactRows[rowIdx]
      if (!row) return null

      const aiItem = aiResult.items.find(it => it.row === rowIdx) || aiResult.items[i]

      const rawDesc = cols.description != null ? String(row[cols.description] ?? '').trim() : ''
      if (!rawDesc) return null

      return {
        item_number: cols.item_number != null ? parseColNumber(row[cols.item_number]) || null : null,
        description: rawDesc,
        short_name: aiItem?.short_name ?? '',
        unit: cols.unit != null ? String(row[cols.unit] ?? '').trim() : '',
        quantity: cols.quantity != null ? parseColNumber(row[cols.quantity]) || 1 : 1,
        sale_price: cols.sale_price != null ? parseColNumber(row[cols.sale_price]) || 0 : 0,
        category: aiItem?.category ?? '',
        type: aiItem?.type ?? 'purchase',
      }
    }).filter(Boolean)

    return Response.json({ items })
  } catch (err) {
    console.error('extract-items error:', err)
    return Response.json({ items: [], reason: `Error interno: ${err instanceof Error ? err.message : 'desconocido'}` })
  }
}

/**
 * Parse Colombian-format numbers deterministically.
 * "1.250.000" → 1250000
 * "1.250.000,50" → 1250000.5
 * "25000" → 25000
 * "$1.250.000" → 1250000
 */
function parseColNumber(val: unknown): number {
  if (val === null || val === undefined) return 0
  if (typeof val === 'number') return val

  let s = String(val).trim()

  // Remove currency symbols, spaces
  s = s.replace(/[$\s]/g, '')

  if (!s) return 0

  // Detect Colombian format: dots as thousands, comma as decimal
  // Pattern: digits with dots and optional comma (e.g., "1.250.000,50")
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    // Colombian: remove dots (thousands), replace comma with dot (decimal)
    s = s.replace(/\./g, '').replace(',', '.')
    return parseFloat(s) || 0
  }

  // Pattern: digits with dots only (e.g., "1.250.000" — no comma)
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '')
    return parseFloat(s) || 0
  }

  // Pattern: single dot could be decimal (e.g., "25000.50")
  // or standard integer with no separators
  s = s.replace(',', '.')
  return parseFloat(s) || 0
}
