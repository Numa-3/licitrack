# LiciTrack v2 — Blueprint

Documento vivo que captura las lecciones aprendidas en v1 para que v2 arranque sin repetir errores.
Última actualización: 2026-03-26

---

## Stack confirmado (lo que funcionó)

| Tecnología | Versión v1 | Veredicto |
|---|---|---|
| Next.js App Router | 16.2.1 | Funciona bien. NO usar Server Actions — API routes para mutaciones |
| React | 19.2.4 | Sin problemas |
| Supabase (auth + DB + storage) | @supabase/ssr 0.9, supabase-js 2.99 | Excelente. Auth, RLS, storage buckets, todo en un solo servicio |
| Tailwind CSS | 4 (con PostCSS) | Bien. No necesitamos UI library (shadcn, etc.) |
| SheetJS (xlsx) | 0.18.5 | Funciona client-side sin SSR. Parseo Excel offline |
| OpenRouter API | qwen/qwen-turbo | 10x más rápido que modelos anteriores. Costo bajo |
| TypeScript strict | 5.x | Atrapa muchos errores en build. Mantener |

**Lo que NO necesitamos**: shadcn/ui, prisma, drizzle, tRPC, zustand. El stack mínimo fue suficiente.

---

## Patrones confirmados que funcionan

### Auth en API routes
```typescript
const auth = await requireJefe()
if ('error' in auth) return auth.error
const { supabase, userId } = auth
```
El middleware NO corre en API routes — verificar auth manualmente en CADA handler.

### Params en rutas dinámicas
```typescript
// params es una Promise — SIEMPRE await
const { id } = await params
```

### Response
```typescript
// CORRECTO
return Response.json({ data }, { status: 200 })

// INCORRECTO — NO usar NextResponse.json()
```

### Server Component → Client Component
```
page.tsx (server) → fetch data con createServerSupabaseClient → pasar como props
ComponentClient.tsx (client) → useState(initialData) → mutations con createClient
```

### Soft deletes
Tablas: contracts, items, suppliers, contracting_entities
```typescript
// SIEMPRE filtrar en SELECTs
.is('deleted_at', null)

// Para "eliminar"
.update({ deleted_at: new Date().toISOString() })
```

### Retry para resiliencia offline
```typescript
// Supabase calls → withRetry()
// fetch() a API routes → fetchWithRetry()
```

### Tipos inline por componente
No crear archivo de tipos compartidos. Cada componente define sus propios tipos arriba del archivo.

### Activity log
```typescript
await supabase.from('activity_log').insert([{
  user_id: userId,
  action: 'delete' | 'update' | 'create',
  entity_type: 'contract' | 'item' | 'supplier' | ...,
  entity_id: id,
  details: 'Descripción legible'
}])
```

---

## Bugs conocidos y sus soluciones

### 1. Soft delete olvidado en count de items
**Problema**: Al contar items antes de cascade delete, no se filtraba `deleted_at`, contando items ya "eliminados".
**Solución**: Agregar `.is('deleted_at', null)` a TODA query SELECT sin excepción.
**Regla**: Crear un checklist mental: si la tabla tiene `deleted_at`, el filtro va.

### 2. Paquetes npm que rompen SSR
**Problema**: Algunos paquetes asumen entorno Node.js puro y fallan en el bundler de Next.js (workers, canvas, fs-native).
**Solución**: Verificar compatibilidad ANTES de instalar. Si necesita Web Worker o canvas → cargar vía CDN dinámico en cliente.
**Ejemplo real**: pdf.js se carga vía CDN en InvoicesClient, no vía npm.

### 3. `NextResponse.json()` vs `Response.json()`
**Problema**: La versión de Next.js usa `Response.json()` nativo. `NextResponse.json()` puede causar errores silenciosos.
**Solución**: Buscar y reemplazar globalmente al inicio del proyecto.

### 4. `params` sin await
**Problema**: En Next.js App Router, `params` en rutas dinámicas es una Promise. Sin await, se obtiene el objeto Promise, no el valor.
**Solución**: SIEMPRE `const { id } = await params`.

---

## Decisiones de arquitectura

### API routes en vez de Server Actions
**Por qué**: Más explícito, más fácil de debuggear, el equipo entiende REST. Server Actions tienen edge cases con revalidation y error handling que complican el debugging.
**Mantener en v2**: Sí.

### Sin UI library (shadcn, Radix, etc.)
**Por qué**: Para licitrack, Tailwind + componentes custom fue suficiente. Menos dependencias, menos breaking changes.
**Evaluar en v2**: Si se necesitan componentes complejos (datepicker, combobox, data table con sort/filter), considerar shadcn/ui.

### Tipos inline, no compartidos
**Por qué**: Evita acoplar componentes. Cada componente es independiente. Si un tipo cambia en un lado, no rompe otro.
**Riesgo**: Duplicación. En v2, si hay más de 3 componentes usando el mismo tipo, crear un archivo compartido.

### OpenRouter como gateway de LLM
**Por qué**: Una sola API key, cambiar de modelo sin cambiar código. qwen-turbo es rápido y barato para clasificación.
**Mantener en v2**: Sí. Pero agregar fallback si el modelo no responde.

### Supabase RLS para autorización
**Por qué**: La base de datos rechaza queries no autorizadas. Jefe ve todo, operadora ve solo lo asignado.
**Mantener en v2**: Sí. Pero documentar TODAS las policies al inicio.

---

## Qué NO repetir en v2

1. **No empezar sin schema.sql documentado** — En v1, el schema fue evolucionando. En v2, definir las tablas completas antes de escribir código.

2. **No olvidar tests** — v1 tiene 0 tests. En v2, al menos tests de API routes (que auth funcione, que soft delete filtre).

3. **No dejar componentes crecer a 1000+ líneas** — ContractDetail.tsx tiene 1456 líneas. En v2, partir en sub-componentes desde el inicio: ItemTable, ItemSidepanel, StatusBadge, etc.

4. **No posponer la paginación** — Se agregó tarde. En v2, toda lista que pueda tener más de 20 items debe paginar desde el día 1.

5. **No instalar paquetes npm sin verificar SSR** — Siempre preguntar: ¿funciona en Next.js App Router con SSR? ¿Necesita Web Worker? ¿Necesita canvas?

6. **No olvidar el activity_log** — Cada mutación (create, update, delete) debe loguear. Definir esto como parte del patrón de API route, no como algo que se agrega después.

---

## Setup desde cero (orden de operaciones)

### 1. Supabase
```
1. Crear proyecto en Supabase
2. Ejecutar schema.sql completo (tablas + RLS policies + triggers)
3. Crear bucket de storage: "documents" (public: false)
4. Verificar que las policies de storage estén creadas
5. Crear usuario jefe manual en Auth → Users
6. Copiar URL y anon key
```

### 2. OpenRouter
```
1. Crear cuenta en openrouter.ai
2. Generar API key
3. Verificar que qwen/qwen-turbo esté disponible
```

### 3. Next.js
```
1. npx create-next-app@latest (con App Router, TypeScript, Tailwind, ESLint)
2. Instalar: @supabase/ssr @supabase/supabase-js xlsx
3. Configurar .env.local con las 4 variables
4. Crear lib/supabase/server.ts, client.ts, retry.ts
5. Crear middleware.ts (auth guard)
6. Crear lib/admin.ts (requireJefe helper)
```

### 4. Estructura de carpetas
```
app/(app)/          → rutas protegidas
app/(auth)/login/   → login
app/api/admin/      → API routes admin
components/features/ → client components por módulo
components/ui/       → componentes reutilizables
lib/                 → helpers y supabase clients
```

---

## Módulos y su estado en v1

| Módulo | Estado | Líneas* | Notas para v2 |
|---|---|---|---|
| Auth (login + middleware) | Completo | ~100 | Funciona bien. Agregar "recordarme" y recuperar password |
| Dashboard | Completo | ~450 | Métricas, alertas, feed. OK |
| Contratos (CRUD + Excel) | Completo | ~1100 (form) + ~1450 (detail) | **Partir en sub-componentes**. El detalle es demasiado grande |
| Items | Completo (embebido en contrato) | — | Considerar módulo independiente con vista propia |
| Proveedores | Completo | ~320 (list) + ~555 (detail) | OK. Agregar import masivo |
| Entidades contratantes | Completo | ~280 (list) + ~450 (detail) | OK |
| Facturas | Completo | ~560 | PDF + XML + IA. Funciona pero parsing de PDF es impreciso |
| Envíos | Completo | ~270 | OK |
| Organizaciones | Completo | ~340 | OK |
| Activity feed | Completo | ~210 | Solo lectura para jefe. OK |
| Admin reset | Solo dev | ~100 | No llevar a v2 producción |

*Líneas del client component principal

---

## Notas de diseño

### 2026-03-27 — Fase 1: Lista de contratos filtrable

**Migración**: Agregar `start_date` (DATE, nullable) y `end_date` (DATE, nullable) a tabla `contracts`.

**Tipos de contrato actualizados** (CHECK constraint):
| Código | Español |
|---|---|
| `supply` | Suministro |
| `construction` | Obra |
| `sale` | Compraventa |
| `service` | Prestación de servicios |
| `logistics` | Logística |
| `mixed` | Mixto |

**Estados actualizados** (CHECK constraint):
| Código | Significado |
|---|---|
| `draft` | Borrador |
| `active` | Activo |
| `completed` | Terminado — se cumplió el objeto del contrato |
| `settled` | Liquidado — acta de liquidación + certificado de experiencia (cierre formal) |
| `cancelled` | Cancelado — se cayó en cualquier punto |

Flujo normal: `draft → active → completed → settled`

**Página `/contracts`**: Tabla con columnas: nombre, entidad, tipo, estado (badge con color), fecha inicio, fecha fin, días restantes (solo activos, rojo si ≤10 días), asignado a.
Filtros: status, tipo, entidad (dropdown), búsqueda texto libre.
`start_date` y `end_date` opcionales (borradores no tienen fechas).

**Futuro**: Integración con API SECOP 2 para descargar datos de contratos automáticamente.

---

## Backlog

Ver [`docs/backlog.md`](backlog.md) — fuente única de verdad para mejoras y features pendientes.

---

## Claude Code: skills y agents para v2

### Skills creadas (`.claude/commands/`)
| Comando | Función |
|---|---|
| `/new-module [nombre]` | Scaffold completo de módulo CRUD |
| `/new-api-route [desc]` | Template de API route con auth y patrones |
| `/audit [archivo]` | Audita código contra reglas de AGENTS.md |
| `/v2-note [texto]` | Agrega nota a este documento |

### Agentes recomendados para v2
- Usar `isolation: "worktree"` para features grandes (módulos nuevos)
- Correr `/audit` después de cada módulo nuevo
- Usar agentes paralelos para scaffold de múltiples módulos independientes
