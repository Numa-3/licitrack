import { NextRequest } from 'next/server'

/**
 * Robust AI-powered item extraction from raw Excel rows.
 * Used as fallback when regex column detection fails.
 * The LLM receives the raw rows and figures out the structure itself.
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
      return Response.json({ items: [] })
    }

    const model = process.env.LLM_MODEL || 'qwen/qwen-plus'

    const categoryNames = Array.isArray(categories) && categories.length > 0
      ? categories.map(c => c.name).join(', ')
      : 'Ferretería, Tecnología, Papelería, Aseo, Investigación, Evento, Transporte, Alojamiento, Mantenimiento, Fumigación, General'

    // Limit rows to avoid token overload: first 3 rows as headers sample + up to 80 data rows
    const sampleRows = rows.slice(0, 83)
    const rowsText = sampleRows
      .map((row, i) => `Fila ${i}: ${JSON.stringify(row)}`)
      .join('\n')

    const systemPrompt = `Eres un experto en fichas técnicas de licitaciones públicas colombianas (SENA, ICBF, Gobernación, Alcaldías, Ministerios).
Tu tarea es extraer ítems estructurados de datos crudos de Excel.

Reglas estrictas:
- Responde ÚNICAMENTE con JSON válido, sin markdown, sin explicaciones, sin texto adicional
- El JSON debe ser un array de objetos
- Ignora filas de totales, subtotales, encabezados repetidos, filas vacías o de resumen
- Si una celda de número tiene formato colombiano (puntos como miles, coma como decimal), conviértela a número
- Si no hay precio, usa 0. Si no hay cantidad, usa 1. Si no hay unidad, usa ""
- El campo short_name: máximo 6 palabras, descriptivo y concreto (ej: "Cemento gris 50kg bolsa")`

    const userPrompt = `Contrato tipo: ${contractType}
Categorías disponibles: ${categoryNames}

Datos crudos del Excel (las primeras filas pueden ser encabezados o metadatos del documento):
${rowsText}

Extrae los ítems y responde SOLO con este JSON:
[
  {
    "item_number": 1,
    "description": "descripción completa original",
    "short_name": "nombre corto máx 6 palabras",
    "unit": "UND",
    "quantity": 1,
    "sale_price": 0,
    "category": "nombre de categoría",
    "type": "purchase|logistics|service"
  }
]

Tipos: purchase=compra de producto, logistics=coordinación/transporte/evento, service=prestación de servicio`

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
        max_tokens: rows.length * 80 + 500,
      }),
    })

    if (!res.ok) {
      console.error('OpenRouter error:', res.status, await res.text())
      return Response.json({ items: [] })
    }

    const data = await res.json()
    const content = (data.choices?.[0]?.message?.content ?? '') as string

    // Extract JSON array — handle markdown code blocks
    const cleaned = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()

    const jsonMatch = cleaned.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      console.error('Could not extract JSON from LLM response:', content)
      return Response.json({ items: [] })
    }

    const items = JSON.parse(jsonMatch[0])
    return Response.json({ items })
  } catch (err) {
    console.error('extract-items error:', err)
    return Response.json({ items: [] })
  }
}
