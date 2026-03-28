Crea una API route para: $ARGUMENTS

Lee `app/api/admin/entities/[entityId]/route.ts` como referencia del patrón correcto antes de escribir.

## Template base

La ruta debe seguir exactamente este patrón:

```typescript
import { requireJefe } from '@/lib/admin'
import { NextRequest } from 'next/server'

// Para rutas con parámetros dinámicos:
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireJefe()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { id } = await params  // SIEMPRE await params

  const { data, error } = await supabase
    .from('tabla')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)  // solo si la tabla tiene soft delete
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!data) return Response.json({ error: 'Not found' }, { status: 404 })

  return Response.json(data)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireJefe()
  if ('error' in auth) return auth.error
  const { supabase, userId } = auth

  const { id } = await params

  // Loguear antes de eliminar
  await supabase.from('activity_log').insert([{
    user_id: userId,
    action: 'delete',
    entity_type: 'nombre_entidad',
    entity_id: id,
    details: 'Eliminado desde panel admin'
  }])

  const { error } = await supabase
    .from('tabla')
    .update({ deleted_at: new Date().toISOString() })  // soft delete
    .eq('id', id)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ success: true })
}
```

## Reglas que NUNCA se pueden violar

- Usar `Response.json()` — NUNCA `NextResponse.json()`
- SIEMPRE `await params` antes de desestructurar
- SIEMPRE verificar auth con `requireJefe()` en todas las rutas admin
- Los handlers GET y DELETE NUNCA llaman `request.json()`
- Solo POST y PUT/PATCH pueden leer el body con `request.json()`
- No middleware — la auth se verifica manualmente en cada route handler
- No `'use server'`

## Qué incluir según el tipo de operación

- **DELETE con cascade**: eliminar en orden correcto (hijos antes que padre), limpiar storage si hay archivos
- **DELETE con storage**: usar `extractStoragePath()` de `@/lib/admin` para obtener el path del archivo
- **POST con LLM**: usar `process.env.LLM_MODEL || 'qwen/qwen-turbo'`, nunca exponer la key al cliente
