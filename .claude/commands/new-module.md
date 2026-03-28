Crea un módulo CRUD completo para licitrack con el nombre: $ARGUMENTS

Sigue EXACTAMENTE los patrones establecidos en el proyecto. Antes de escribir cualquier código, lee los archivos de referencia:
- `components/features/EntitiesClient.tsx` — patrón list + modal (el más simple, úsalo como base)
- `app/(app)/entities/page.tsx` — patrón server component con fetch
- `app/api/admin/entities/[entityId]/route.ts` — patrón API route con auth

## Lo que debes crear

### 1. Server Component — `app/(app)/[nombre]/page.tsx`
- Importar `createServerSupabaseClient` de `@/lib/supabase/server`
- Fetch de datos con `.is('deleted_at', null)` si la tabla usa soft delete
- Obtener `userRole` y `currentUserId` del perfil del usuario autenticado
- Renderizar el Client Component pasando los datos como props
- Redirigir a `/login` si no hay sesión

### 2. Client Component — `components/features/[Nombre]Client.tsx`
- `'use client'` al inicio
- Importar `createClient` de `@/lib/supabase/client`
- `useState` para: lista de items, formulario nuevo, formulario de edición, loading, error, modal de confirmación
- Patrón de creación: `supabase.from('tabla').insert([...]).select().single()`
- Patrón de edición: `supabase.from('tabla').update({...}).eq('id', id).select().single()`
- Patrón de soft delete: `supabase.from('tabla').update({ deleted_at: new Date().toISOString() }).eq('id', id)`
- Tipos definidos inline (no archivo compartido)
- Tailwind para estilos

### 3. API Route colección — `app/api/admin/[nombre]/route.ts`
- Solo si se necesita lógica server-side compleja (LLM, storage, cascades)
- Si es CRUD simple, el cliente puede llamar Supabase directamente
- Si se crea: usar `requireJefe()` de `@/lib/admin`, `Response.json()` (NUNCA `NextResponse.json()`)

### 4. API Route item — `app/api/admin/[nombre]/[id]/route.ts`
- Solo DELETE si hace cascade o limpia storage
- Patrón: `const { id } = await params` (SIEMPRE await)
- Auth: `const auth = await requireJefe(); if ('error' in auth) return auth.error`
- Loguear en `activity_log` antes de eliminar

### 5. Entrada en el Sidebar — `components/ui/Sidebar.tsx`
- Agregar el link al nuevo módulo en la lista de navegación
- Seguir el mismo patrón de los links existentes

## Reglas que NO se pueden violar
- No usar `'use server'` ni Server Actions
- No usar `NextResponse.json()` — solo `Response.json()`
- No insertar `updated_at` manualmente (hay trigger)
- No insertar en `profiles` directamente
- No exponer `OPENROUTER_API_KEY` en cliente
- TypeScript strict — no `any`
- Si la tabla tiene `deleted_at`, SIEMPRE filtrar `.is('deleted_at', null)` en SELECTs
