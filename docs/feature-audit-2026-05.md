# Auditoría de features secundarios — 2026-05-10

## Resumen ejecutivo

A 2026-05-10, Seguimiento (`/secop/seguimiento`) es por lejos el módulo más usado de LiciTrack. El resto del sidebar está prácticamente sin uso. En sesión interactiva del 2026-05-10 se decidió feature por feature qué hacer con los 12 módulos secundarios. Resultado: 9 features marcadas para eliminar, 1 escondida (Radar), 2 mantenidas para rediseño (Calendario SECOP y Actividad).

**Decisión clave**: NO se borra código ni datos en esta primera fase. Solo se esconden del sidebar. El borrado real se ejecutará en 1-2 meses si la ausencia de las features no genera reclamos del equipo. Cien por ciento reversible.

## Decisiones por feature

| # | Feature | Ruta | Decisión final | Razón |
|---|---|---|---|---|
| 1 | Dashboard | `/dashboard` | 🗑️ Eliminar | Métricas básicas, no se usa |
| 2 | Apuntes | `/tasks` | 🗑️ Eliminar vista | Items se gestionan desde Contratos |
| 3 | Contratos | `/contracts` | 🗑️ Eliminar | Redundante con Seguimiento (SECOP) |
| 4 | Nuevo Contrato | `/contracts/new` | 🗑️ Eliminar | Wizard manual, casi no se invoca |
| 5 | Envíos | `/shipments` | 🗑️ Eliminar | Casi no se usa |
| 6 | Facturas | `/invoices` | 🗑️ Eliminar | Casi no se usa |
| 7 | Mis Empresas | `/organizations` | 🗑️ Eliminar | Datos cargados pero poco consultados |
| 8 | Proveedores | `/suppliers` | 🗑️ Eliminar | Casi no se usa |
| 9 | Entidades | `/entities` | 🗑️ Eliminar | La entidad ya aparece en el contrato SECOP |
| 10 | Radar | `/secop/radar` | 👁️‍🗨️ Esconder (sin eliminar) | No se usa hoy pero podría servir más adelante |
| 11 | Calendario SECOP | `/secop/calendario` | ✏️ Mantener + rediseñar | Funciona pero UX pobre — backlog mejora #16 |
| 12 | Actividad | `/activity` | ✏️ Mantener + rediseñar | Útil para auditoría — falta dirección de UX |

## Estado del sidebar después de Fase 1

Lo que el usuario ve al hacer login:
- **SECOP** → Seguimiento (el core), Calendario (rediseñar pendiente)
- **Sistema** → Actividad, Telegram
- **Admin** → Administración (solo jefe)

## Inventario por feature (referencia para Fase 2)

### 1. Dashboard — `/dashboard`
- **Páginas**: `app/(app)/dashboard/page.tsx`, `app/(app)/dashboard/[contractId]/page.tsx`
- **Componentes**: `DashboardClient.tsx` (~551 LOC)
- **API routes**: `app/api/secop/dashboard-stats/route.ts`
- **Tablas (solo lectura)**: contracts, items, shipments, invoices, supplier_documents
- **Dependencias**: Consumidor agregado de TODO

### 2. Apuntes — `/tasks`
- **Páginas**: `app/(app)/tasks/page.tsx`
- **Componentes**: `TasksClient.tsx` (~543 LOC)
- **API routes**: `app/api/tasks/route.ts`, `app/api/tasks/[id]/route.ts`
- **Tablas**: items (compartida con Contratos)
- **Dependencias**: → Contratos, Proveedores, Facturas

### 3. Contratos — `/contracts`
- **Páginas**: `app/(app)/contracts/page.tsx`, `app/(app)/contracts/[contractId]/page.tsx`
- **Componentes**: `ContractsClient.tsx` (~259 LOC), `ContractDetail.tsx` (~608 LOC), 12 componentes en `contract-detail/` (~1,053 LOC)
- **API routes**: `app/api/admin/contracts/route.ts`, `app/api/admin/contracts/[contractId]/route.ts`
- **Tablas**: contracts, items, contracting_entities, profiles, organizations
- **Dependencias**: ← Apuntes, Envíos, Facturas; → Entidades, Mis Empresas

### 4. Nuevo Contrato — `/contracts/new`
- **Páginas**: `app/(app)/contracts/new/page.tsx`
- **Componentes**: `NewContractForm.tsx` (~871 LOC) — wizard con parser Excel/PDF + IA
- **API routes**: `app/api/extract-items/route.ts`, `app/api/classify-items/route.ts`
- **Tablas**: contracts, items, organizations, categories, contracting_entities
- **Dependencias**: → Crea contratos + items en bulk

### 5. Envíos — `/shipments`
- **Páginas**: `app/(app)/shipments/page.tsx`
- **Componentes**: `ShipmentsClient.tsx` (~266 LOC)
- **API routes**: `app/api/admin/shipments/route.ts`, `app/api/admin/shipments/[shipmentId]/route.ts`
- **Tablas**: shipments, shipment_items
- **Dependencias**: → Contratos, Apuntes

### 6. Facturas — `/invoices`
- **Páginas**: `app/(app)/invoices/page.tsx`
- **Componentes**: `InvoicesClient.tsx` (~558 LOC)
- **API routes**: `app/api/admin/invoices/route.ts`, `app/api/admin/invoices/[invoiceId]/route.ts`, `app/api/parse-invoice/route.ts`
- **Tablas**: invoices, invoice_items, items, contracts, suppliers
- **Dependencias**: → Contratos, Apuntes, Proveedores, Mis Empresas

### 7. Mis Empresas — `/organizations`
- **Páginas**: `app/(app)/organizations/page.tsx`
- **Componentes**: `OrganizationsClient.tsx` (~338 LOC)
- **Tablas**: organizations
- **Dependencias**: ← Contratos, Facturas (FK organization_id)

### 8. Proveedores — `/suppliers`
- **Páginas**: `app/(app)/suppliers/page.tsx`, `app/(app)/suppliers/[supplierId]/page.tsx`
- **Componentes**: `SuppliersClient.tsx` (~323 LOC), `SupplierDetailClient.tsx` (~552 LOC)
- **API routes**: `app/api/admin/suppliers/route.ts`, `app/api/admin/suppliers/[supplierId]/route.ts`
- **Tablas**: suppliers, supplier_documents
- **Dependencias**: ← Apuntes, Facturas (FK supplier_id)

### 9. Entidades — `/entities`
- **Páginas**: `app/(app)/entities/page.tsx`, `app/(app)/entities/[entityId]/page.tsx`
- **Componentes**: `EntitiesClient.tsx` (~278 LOC), `EntityDetailClient.tsx` (~448 LOC)
- **API routes**: `app/api/admin/entities/route.ts`, `app/api/admin/entities/[entityId]/route.ts`
- **Tablas**: contracting_entities, entity_documents
- **Dependencias**: ← Contratos (FK entity_id)

### 10. Radar — `/secop/radar` (escondido, NO se elimina)
- **Páginas**: `app/(app)/secop/radar/page.tsx`
- **Componentes**: `SecopRadarClient.tsx` (~824 LOC)
- **API routes**: `app/api/secop/processes/`, `app/api/secop/watch-rules/`, `app/api/cron/secop-poll/`
- **Tablas**: secop_processes (compartida con Seguimiento), secop_watch_rules
- **Razón de mantenerlo**: discovery activo de oportunidades — podría reactivarse

### 11. Calendario SECOP — `/secop/calendario` (mantenido para rediseño)
- **Páginas**: `app/(app)/secop/calendario/page.tsx`
- **Componentes**: `CalendarClient.tsx` (~294 LOC)
- **API routes**: `app/api/secop/calendar/route.ts`, `app/api/secop/processes/[id]/cronograma/route.ts`
- **Tablas**: secop_processes (compartida)
- **Plan rediseño**: backlog mejora #16

### 12. Actividad — `/activity` (mantenido para rediseño)
- **Páginas**: `app/(app)/activity/page.tsx`
- **Componentes**: `ActivityClient.tsx` (~195 LOC)
- **Tablas**: activity_log, notifications
- **Plan rediseño**: timeline visual cuando llegue el sprint de rediseño

## Plan de Fase 2 — Borrado real (1-2 meses, sesión futura)

### Pre-requisitos
- [ ] Confirmar con el usuario que en 4-8 semanas nadie del equipo preguntó por las features escondidas
- [ ] Verificar que no aparecieron casos de uso nuevos
- [ ] Verificar Supabase point-in-time recovery activo

### Checklist por feature (a ejecutar en orden)

#### Frontend (componentes y páginas)
- [ ] Borrar `app/(app)/dashboard/`
- [ ] Borrar `app/(app)/tasks/`
- [ ] Borrar `app/(app)/contracts/` (incluye `new/`, `[contractId]/`, `contract-detail/`)
- [ ] Borrar `app/(app)/shipments/`
- [ ] Borrar `app/(app)/invoices/`
- [ ] Borrar `app/(app)/organizations/`
- [ ] Borrar `app/(app)/suppliers/`
- [ ] Borrar `app/(app)/entities/`

#### API routes
- [ ] Borrar `app/api/admin/contracts/`
- [ ] Borrar `app/api/admin/shipments/`
- [ ] Borrar `app/api/admin/invoices/`
- [ ] Borrar `app/api/admin/suppliers/`
- [ ] Borrar `app/api/admin/entities/`
- [ ] Borrar `app/api/admin/organizations/` (si existe)
- [ ] Borrar `app/api/tasks/`
- [ ] Borrar `app/api/extract-items/`
- [ ] Borrar `app/api/classify-items/`
- [ ] Borrar `app/api/parse-invoice/`
- [ ] Borrar `app/api/secop/dashboard-stats/`

#### Sidebar
- [ ] Borrar entradas comentadas en `components/ui/Sidebar.tsx`
- [ ] Limpiar imports de iconos no usados (LayoutDashboard, ClipboardList, FileText, FilePlus, Truck, Building2, Users, Landmark, Receipt, Radar)

#### Migration de drop (`supabase/migrations/016_demolition.sql`)

```sql
-- Tablas dependientes primero (FKs)
DROP TABLE IF EXISTS shipment_items CASCADE;
DROP TABLE IF EXISTS invoice_items CASCADE;
DROP TABLE IF EXISTS supplier_documents CASCADE;
DROP TABLE IF EXISTS entity_documents CASCADE;

-- Tablas hoja
DROP TABLE IF EXISTS shipments CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS items CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS contracting_entities CASCADE;
DROP TABLE IF EXISTS contracts CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;

-- categories: verificar antes que no se use en otro lado
-- activity_log: NO drop (Actividad se mantiene)
-- notifications: NO drop (la usa Seguimiento + Telegram)
-- tablas SECOP: NO drop (las usan Seguimiento, Calendario, Radar)
```

#### Verificación final
- [ ] `npx tsc --noEmit` (cero errors)
- [ ] `grep -rn "from('items'\|from('contracts'\|from('invoices'\|from('shipments'\|from('suppliers'\|from('organizations'\|from('contracting_entities')" .` → cero referencias residuales fuera de archivos borrados
- [ ] Levantar app, navegar todas las rutas que quedan, verificar cero 500/red errors

### Consideración crítica para Fase 2
Antes de la migration de drop: lanzar `grep -rn "from('organizations')\|from('suppliers')\|from('contracting_entities')\|from('items')\|from('contracts')" .` y verificar que TODAS las llamadas estén en archivos que también se borran. Si hay referencias en código que se mantiene → resolver antes del drop.

## Criterios para arrepentirnos (señales de "reactivar en lugar de borrar")

Si en las próximas 4-8 semanas pasa alguna de estas, reactivamos la feature correspondiente descomentando el sidebar:

- **Cualquier feature**: el usuario pega la URL directa (ej. `/contracts`) en una sesión de trabajo real (no de prueba) — señal que la sigue usando
- **Contratos / Apuntes / Facturas**: aparece un caso de uso de "necesito tracker no-SECOP" o "facturación interna"
- **Mis Empresas / Proveedores / Entidades**: el equipo pide consultar datos del directorio para algo que no aparece en Seguimiento
- **Envíos**: vuelve a usar el flujo de casillero EEUU para alguna compra
- **Dashboard**: el usuario reclama "necesito ver KPIs agregados"

Si pasa algo de esto, NO ejecutamos Fase 2; en cambio, esa feature pasa a "mantener + rediseñar" en la próxima auditoría.

## Origen

- Idea documentada en `docs/backlog.md` (sección "Auditoría de features secundarios")
- Sesión interactiva 2026-05-10 con planificación previa en plan mode
- Observación del usuario que la disparó: "el más avanzado y útil es el de seguimiento, el resto realmente no lo estoy usando"
