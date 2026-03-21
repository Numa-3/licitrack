import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { descriptions, categories } = await request.json()

    if (!Array.isArray(descriptions) || descriptions.length === 0) {
      return Response.json({ error: 'No descriptions provided' }, { status: 400 })
    }

    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      return Response.json({ items: [] })
    }

    const model = process.env.LLM_MODEL || 'qwen/qwen-turbo'

    const categoryNames = Array.isArray(categories)
      ? categories.map((c: { name: string }) => c.name).join(', ')
      : 'Ferretería, Tecnología, Papelería, Aseo, Investigación, Evento, Transporte, Alojamiento, Mantenimiento, Fumigación, General'

    const itemsList = descriptions
      .map((d: string, i: number) => `${i + 1}. ${d}`)
      .join('\n')

    const prompt = `Clasifica estos ítems de una ficha técnica de licitación pública en Colombia.
Para cada ítem genera un nombre corto (máximo 6 palabras, para mostrar en listas) basado en la descripción.

Categorías disponibles: ${categoryNames}
Tipos posibles: purchase (compra de producto), logistics (coordinación/evento), service (prestación de servicio)

Ítems:
${itemsList}

Responde SOLO en JSON. Formato:
[{"item": 1, "short_name": "Cemento gris 50kg", "category": "Ferretería", "type": "purchase"}, ...]

Si un ítem no encaja en ninguna categoría existente, sugiere una nueva con "new_category": true.`

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
      }),
    })

    if (!res.ok) {
      console.error('OpenRouter error:', res.status, await res.text())
      return Response.json({ items: [] })
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content ?? ''

    // Extract JSON from response (may be wrapped in markdown code block)
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      console.error('Could not parse LLM response:', content)
      return Response.json({ items: [] })
    }

    const items = JSON.parse(jsonMatch[0])
    return Response.json({ items })
  } catch (err) {
    console.error('classify-items error:', err)
    return Response.json({ items: [] })
  }
}
