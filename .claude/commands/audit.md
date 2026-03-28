Audita el archivo o directorio: $ARGUMENTS

Revisa el código contra las reglas de AGENTS.md y los patrones establecidos en licitrack. Reporta cada problema encontrado con: archivo, línea, problema, y la corrección exacta.

## Checklist de API Routes

Para cada archivo en `app/api/`:

- [ ] Usa `Response.json()` — NO `NextResponse.json()`
- [ ] Rutas dinámicas: `const { id } = await params` (params debe ser awaiteado)
- [ ] Auth presente: `const auth = await requireJefe(); if ('error' in auth) return auth.error`
- [ ] Handlers GET/DELETE no llaman `request.json()`
- [ ] No usa `'use server'`
- [ ] Variables de entorno server-only (`OPENROUTER_API_KEY`, `LLM_MODEL`) no expuestas al cliente

## Checklist de Client Components

Para cada archivo con `'use client'`:

- [ ] Importa `createClient` de `@/lib/supabase/client` (NO el server client)
- [ ] No referencia `process.env.OPENROUTER_API_KEY` ni vars server-only
- [ ] No usa `'use server'` ni Server Actions
- [ ] Tipos definidos inline, no importados de archivo compartido inexistente

## Checklist de Server Components / Pages

Para cada `page.tsx` o archivo sin `'use client'`:

- [ ] Importa `createServerSupabaseClient` de `@/lib/supabase/server`
- [ ] Usa `await cookies()` correctamente via el helper
- [ ] Tablas con soft delete filtran `.is('deleted_at', null)` — aplica a: contracts, items, suppliers, contracting_entities

## Checklist de TypeScript

- [ ] No usa `any` sin comentario justificando por qué
- [ ] Imports resolvibles por el bundler (extensiones o aliases `@/*`)

## Checklist General

- [ ] No inserta `updated_at` manualmente
- [ ] No inserta en tabla `profiles` directamente
- [ ] Valores de enums coinciden con CHECK constraints del schema

## Formato del reporte

Para cada problema encontrado:

```
[CRÍTICO|ADVERTENCIA] archivo:línea
Problema: descripción del problema
Corrección: código exacto que debería estar
```

Al final, un resumen:
- Total de problemas críticos
- Total de advertencias
- Archivos limpios (sin problemas)
