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

    const model = process.env.LLM_MODEL || 'qwen/qwen-plus'

    const categoryNames = Array.isArray(categories)
      ? categories.map((c: { name: string }) => c.name).join(', ')
      : 'Ferretería, Tecnología, Papelería, Aseo, Investigación, Evento, Transporte, Alojamiento, Mantenimiento, Fumigación, General'

    const itemsList = descriptions
      .map((d: string, i: number) => `${i + 1}. ${d}`)
      .join('\n')

    const systemPrompt = `Eres un experto en licitaciones públicas colombianas. Clasificas ítems de fichas técnicas.
Responde ÚNICAMENTE con JSON válido, sin markdown, sin texto adicional.`

    const userPrompt = `Clasifica estos ${descriptions.length} ítems de una ficha técnica de licitación pública en Colombia.
Para cada ítem genera un short_name descriptivo (máximo 6 palabras, concreto y útil para listas).

Categorías disponibles: ${categoryNames}
Tipos: purchase=compra de producto, logistics=coordinación/transporte/evento, service=prestación de servicio

Ítems:
${itemsList}

Responde SOLO con este JSON (un objeto por ítem, en orden):
[{"item": 1, "short_name": "Cemento gris 50kg bolsa", "category": "Ferretería", "type": "purchase"}, ...]

Reglas:
- El array debe tener exactamente ${descriptions.length} elementos
- "item" es el número de orden (1 al ${descriptions.length})
- Si no encaja en ninguna categoría, usa "General"
- No omitas ningún ítem`

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
        max_tokens: Math.max(descriptions.length * 60, 500),
      }),
    })

    if (!res.ok) {
      console.error('OpenRouter error:', res.status, await res.text())
      return Response.json({ items: [] })
    }

    const data = await res.json()
    const content = ((data.choices?.[0]?.message?.content ?? '') as string)
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()

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
