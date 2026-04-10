<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

---

## npm packages — verificar ANTES de instalar

Antes de proponer o instalar cualquier paquete npm, verificar explícitamente:
1. ¿Funciona en Next.js App Router con SSR? Muchos paquetes asumen un entorno Node.js puro y fallan en el bundler de Next.js (ej: workers, canvas, fs-native).
2. ¿Requiere un Web Worker o `canvas`? Si sí, no puede correr server-side — debe cargarse en el cliente vía CDN dinámico o `import()` con `ssr: false`.
3. Si hay incertidumbre, decirlo explícitamente antes de implementar y proponer un plan B.

---

## API Routes — patrones obligatorios

- Usar `Response.json()` — **NO** `NextResponse.json()`
- En rutas dinámicas, `params` es una `Promise` y **debe awaitearse**: `const { id } = await params`
- No usar `request.json()` en handlers GET o DELETE
- El patrón de auth es: `const auth = await requireJefe(); if ('error' in auth) return auth.error`
- El middleware **NO corre** en API routes — verificar auth manualmente

---

## Supabase — reglas críticas

- **Server Components**: usar `createServerClient` (de `lib/supabase/server.ts`), con `await cookies()`
- **Client Components**: usar `createClient` (de `lib/supabase/client.ts`)
- **Nunca** exponer `OPENROUTER_API_KEY` en código cliente — es server-only
- **Soft deletes**: toda query SELECT debe filtrar `.is('deleted_at', null)` en tablas que lo usan (contracts, items, suppliers, contracting_entities)
- **No** insertar `updated_at` manualmente — hay un trigger que lo maneja
- **No** insertar en `profiles` directamente — se crea vía trigger en auth.users
- **RLS activo**: operadoras solo pueden UPDATE items propios; activity_log es solo lectura para jefes
- Los valores de enums deben coincidir exactamente con los CHECK constraints del schema

---

## Variables de entorno

- `NEXT_PUBLIC_*` → cliente (browser) — solo para Supabase URL y anon key
- `OPENROUTER_API_KEY`, `LLM_MODEL` → servidor únicamente
- Usar `process.env.LLM_MODEL || 'qwen/qwen-turbo'` como fallback

---

## TypeScript

- Strict mode habilitado — no usar `any` sin justificación explícita
- `moduleResolution: "bundler"` — los imports deben incluir extensión o ser resolvibles por el bundler
- Path alias: `@/*` apunta a la raíz del proyecto

---

## Arquitectura — no inventar patrones nuevos

- No usar `'use server'` / Server Actions — la arquitectura usa API routes para mutaciones
- No crear un archivo de tipos compartidos si no existe — usar tipos inline por componente
- Leer el código existente antes de proponer cualquier patrón nuevo
---

## Diseño UI — workflow obligatorio

- **Siempre leer `DESIGN.md`** antes de tocar cualquier componente de UI o crear uno nuevo
- El sistema de diseño es Linear-inspired: sidebar `#111216`, workspace `#FAFAFA`, tipografía Inter/Geist, pills con `ring-1 ring-inset`, sombras sutiles
- **AIDesigner MCP** está conectado (`aidesigner` en `.mcp.json`). Usarlo para generar mockups de páginas nuevas o rediseños — leer `DESIGN.md` como `repo_context`
- Después de cada generación: capturar con `@aidesigner/agent-skills capture`, luego implementar en React/Tailwind con datos reales
- **Iconos**: Lucide React (ya instalado) — no instalar otras librerías de íconos
- **No inventar estilos** fuera del sistema definido en `DESIGN.md`
- El orden de referencia para cualquier tarea frontend: `DESIGN.md` → código existente → implementar

<!-- END:nextjs-agent-rules -->
