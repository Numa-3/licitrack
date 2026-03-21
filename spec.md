# LiciTrack — spec.md

> Este documento es la especificación técnica y referencia central del proyecto. Se debe pegar al inicio de cada chat nuevo donde se trabaje en LiciTrack.

---

## 1. ¿Qué es LiciTrack?

Sistema web de tracking de obligaciones para contratos de licitación pública. Brandon es dueño/representante de varias empresas, cada una licita de forma independiente. Los contratos no son solo compras — pueden incluir logística de eventos, prestación de servicios, y adquisiciones. LiciTrack permite gestionar el ciclo completo de cada tipo de obligación por empresa, con supervisión centralizada, integración directa con WhatsApp, y orden contable a través de facturación electrónica. Destino principal: Leticia, Amazonas (Colombia).

## 2. Problema que resuelve

Los contratos de licitación involucran distintos tipos de obligaciones, cada una con sus propios retos:

**Compras (adquisiciones)**:
- Decenas de ítems de categorías distintas (ferretería, tecnología, investigación, papelería, aseo, etc.)
- Cada categoría puede requerir proveedores diferentes
- Verificación legal de proveedores nuevos (RUT, Cámara de Comercio, exención IVA Amazonas)
- Pagos por BBVA Cash Net (inscripción de cuentas)
- Envíos a Leticia por avión (rápido, caro) o barco (lento, barato)
- Seguimiento de cada envío hasta recepción

**Logística (eventos, coordinaciones)**:
- Muchas tareas interdependientes que no son "compras" sino coordinaciones
- Ejemplos: montar tarima, confirmar ponente, ubicar huéspedes, coordinar transporte
- El progreso es más abstracto — no hay un "envío" que trackear sino tareas que completar
- Riesgo de que se olviden detalles cuando hay muchas cosas simultáneas

**Servicios (mantenimiento, ejecución)**:
- Contratos donde hay que ejecutar un servicio sobre N unidades
- Ejemplos: mantenimiento de aires acondicionados, revisión de equipos, fumigación de áreas
- Se necesita trackear qué unidades ya se atendieron y cuáles faltan

El problema principal: **la fricción de registrar y rastrear todo esto manualmente**. Si la herramienta es tan tediosa como Excel, no se usa. La clave es minimizar los inputs manuales y agrupar las acciones inteligentemente.

**Solución al tracking abstracto**: lo que parece abstracto ("coordinar evento") se descompone en tareas concretas con estado simple (pendiente → en gestión → listo). El progreso se mide como proporción de tareas completadas. No se necesita un sistema distinto por tipo — se usa el mismo tracker con flujos de estado diferentes según el tipo de obligación.

**Solución a la carga masiva de datos**: los contratos de licitación vienen con una ficha técnica u oferta económica en Excel. En lugar de transcribir ítems manualmente, el usuario sube el Excel y el sistema extrae los datos automáticamente. Una IA clasifica cada ítem por categoría y tipo (compra/logística/servicio) para que el usuario solo revise y confirme.

## 3. Usuarios y roles

| Rol | Quién | Permisos |
|-----|-------|----------|
| Jefe | Brandon | Ve y edita TODO de todos. Crea contratos, asigna compras a operadoras o a sí mismo. Supervisión total: ve qué hizo cada quien y cuándo. Toma decisiones estratégicas (qué proveedor usar, priorizar envíos, etc.) |
| Operadora | Las dos integrantes del equipo | CRUD completo pero con alcance: gestionan las compras que tienen asignadas o que ellas crearon. Registran ítems, asignan proveedores, marcan envíos, cambian estados. No pueden eliminar contratos ni modificar compras asignadas a otro usuario. |

### Estructura del equipo
- **Brandon (jefe)**: supervisa todo, delega compras, también hace compras él mismo. Necesita ver un panorama completo del estado de todos los contratos y quién está encargado de qué.
- **Operadora A y B**: cada una recibe compras asignadas por Brandon. Trabajan de forma autónoma en lo suyo pero Brandon puede ver y supervisar en tiempo real.

### Cómo funciona la asignación
- Brandon crea un contrato y sube el Excel de la ficha técnica.
- El sistema crea los ítems automáticamente desde el Excel.
- Brandon asigna ítems o contratos completos a una operadora (o a sí mismo).
- Cada operadora entra a LiciTrack y ve primero sus compras asignadas.
- Brandon tiene una vista de supervisión donde ve todas las compras agrupadas por persona, con actividad reciente.

**No hay registro público.** Los usuarios acceden por invitación de Brandon.

## 4. Stack tecnológico

| Capa | Tecnología | Propósito | Costo |
|------|-----------|-----------|-------|
| Frontend | **Next.js** (React) | Interfaz web, páginas, componentes | Gratis |
| Backend/API | **Supabase** (API automática + Edge Functions) | Lógica de negocio, autenticación | Gratis (hasta 50K users) |
| Base de datos | **Supabase** (PostgreSQL) | Almacenamiento persistente | Incluido en Supabase |
| Autenticación | **Supabase Auth** | Login, roles, permisos | Incluido en Supabase |
| Archivos | **Supabase Storage** | Almacenamiento de PDFs, XMLs, documentos (facturas, RUT, Cámara de Comercio) | Incluido en Supabase (1GB gratis) |
| IA | **LLM API vía OpenRouter** | Clasificación automática de ítems (categoría, tipo, nombre corto). Modelo configurable por variable de entorno. | ~$0.01-0.03 USD por contrato |
| Hosting | **Vercel** | Despliegue y URL pública | Gratis (plan hobby) |
| Control de versiones | **GitHub** | Historial de cambios del código | Gratis |

### ¿Por qué este stack?

- **Simplicidad**: 3 servicios principales (Supabase + Vercel + GitHub), todos gratis para empezar.
- **Supabase elimina la necesidad de un backend separado**: las tablas generan API automáticamente, tiene auth integrado, y se puede ver la data como si fuera Excel desde su panel.
- **Next.js**: el framework web más popular del mundo. Hace frontend y puede ejecutar lógica de servidor si se necesita.
- **Vercel**: creadores de Next.js, integración nativa perfecta. Push al código → se despliega solo.
- **LLM API vía OpenRouter**: se usa para clasificar ítems y generar nombres cortos al subir el Excel. OpenRouter es un intermediario que da acceso a múltiples modelos (Qwen, Gemini, Claude, GPT) con un solo API key. El modelo se configura como variable de entorno — si mañana sale uno mejor o más barato, se cambia una línea sin tocar código. Costo despreciable (~$0.01-0.03 por contrato de 100 ítems). Se llama desde una Edge Function en Supabase.
- **Alineado con el stack de mi contacto desarrollador** que usa Supabase + Vercel + React, lo que facilita pedir ayuda.

## 5. Arquitectura

```
┌─────────────────────────────────────────────┐
│  NAVEGADOR (Chrome)                         │
│  Next.js (React) — lo que el usuario ve     │
│                                             │
│  - Páginas: /contratos, /envios, /equipo    │
│  - Componentes reutilizables                │
│  - Estado local con React hooks             │
│  - Parseo de Excel en el cliente (SheetJS)  │
└─────────────┬───────────────────────────────┘
              │ peticiones HTTPS
              ▼
┌─────────────────────────────────────────────┐
│  SUPABASE                                   │
│                                             │
│  ┌─────────────┐  ┌──────────────────────┐  │
│  │ Auth         │  │ API REST automática  │  │
│  │ (login,      │  │ (CRUD de tablas)     │  │
│  │  permisos)   │  │                      │  │
│  └─────────────┘  └──────────┬───────────┘  │
│                              │               │
│  ┌──────────────────────┐    │               │
│  │ Edge Functions        │   │               │
│  │ - Clasificar ítems   │───┼──► OpenRouter  │
│  │   (llama LLM API)    │   │   (LLM API)   │
│  └──────────────────────┘    │               │
│                              │               │
│  ┌───────────────────────────▼─────────────┐ │
│  │ PostgreSQL                              │ │
│  │ (empresas, contratos, items, categorías,│ │
│  │  proveedores, envíos, facturas,         │ │
│  │  docs proveedores, usuarios, actividad) │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  ┌─────────────────────────────────────────┐ │
│  │ Storage                                 │ │
│  │ (PDFs facturas, XMLs DIAN, RUT,         │ │
│  │  Cámara de Comercio, docs proveedores)  │ │
│  └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  VERCEL — hosting                           │
│  Sirve la app Next.js al mundo              │
│  URL: licitrack.vercel.app (provisional)    │
└─────────────────────────────────────────────┘
```

## 6. Modelo de datos (tablas principales)

### organizations (mis empresas)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid (PK) | Identificador único |
| name | text | Nombre legal de la empresa |
| nit | text | NIT de la empresa |
| invoice_email | text | Correo exclusivo para facturación electrónica |
| rut_url | text (nullable) | Ruta al archivo RUT en Supabase Storage |
| chamber_cert_url | text (nullable) | Ruta al certificado de Cámara de Comercio en Storage |
| notes | text | Notas (representante legal, dirección, etc.) |
| created_at | timestamp | Fecha de creación |

> **Decisión de diseño: organizations** — Brandon es dueño/representante de varias empresas. Cada una licita de forma independiente, tiene su propio NIT, correo de facturación electrónica, RUT y Cámara de Comercio. Todo contrato pertenece a una de estas empresas. Esto también permite a futuro llevar contabilidad separada por empresa.

### contracts (contratos)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid (PK) | Identificador único |
| organization_id | uuid (FK) | A cuál de mis empresas pertenece este contrato |
| name | text | Nombre del contrato |
| entity | text | Entidad contratante (ej: Alcaldía de Leticia) |
| type | enum | **purchase** (compras), **logistics** (logística/eventos), **service** (servicios/mantenimiento), **mixed** (combina varios tipos) |
| status | text | Estado del contrato: **draft** (creado sin ítems activos), **active** (en ejecución), **completed** (todos los ítems terminados), **cancelled** (cancelado). Default: 'draft'. |
| created_by | uuid (FK) | Quién lo creó |
| assigned_to | uuid (FK, nullable) | Responsable principal (null = sin asignar). Brandon puede asignar un contrato completo a una operadora. |
| created_at | timestamp | Fecha de creación |
| updated_at | timestamp | Última modificación. Se actualiza automáticamente con trigger. |
| deleted_at | timestamp (nullable) | Soft delete. Si no es null, el contrato está archivado. Las queries normales filtran `WHERE deleted_at IS NULL`. |

> **Decisión de diseño: contract.type** — Determina qué flujo de estados y qué campos son relevantes para los ítems dentro del contrato. Un contrato "mixed" permite ítems de diferentes tipos (ej: un contrato que tiene compras de ferretería + logística de un evento). Cuando el contrato es "mixed", la IA clasifica automáticamente el tipo de cada ítem al subir el Excel.

> **Decisión de diseño: contract.status** — Permite filtrar contratos activos vs completados vs archivados. La acción "Completar contrato" valida que todos los ítems estén en estado final. Solo el jefe puede cancelar contratos.

### categories (categorías de ítems)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid (PK) | Identificador único |
| name | text (unique) | Nombre de la categoría: Ferretería, Tecnología, Evento, etc. |
| type | text | Tipo de contrato donde esta categoría es relevante: 'purchase', 'logistics', 'service', 'general'. Permite filtrar el dropdown de categorías según el tipo de contrato/ítem. |
| created_at | timestamp | Fecha de creación |

> **Decisión de diseño: categories como tabla.** Originalmente `category` era texto libre en items, lo que causaba inconsistencias ("Ferretería" vs "ferreteria"). Con una tabla propia y FK, el usuario selecciona de un dropdown y se puede filtrar/agrupar confiablemente. La categoría se asigna automáticamente por IA al subir el Excel — el usuario solo revisa y corrige. Todos pueden leer categorías; solo el jefe puede crear nuevas.

**Categorías iniciales:**
Ferretería, Tecnología, Papelería, Aseo, Investigación (purchase), Evento, Transporte, Alojamiento (logistics), Mantenimiento, Fumigación (service), General (general).

### items (tareas/ítems del contrato)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid (PK) | Identificador único |
| contract_id | uuid (FK) | A qué contrato pertenece |
| item_number | integer (nullable) | Número del ítem en la ficha técnica / oferta económica oficial. Se importa automáticamente del Excel. Nullable para ítems creados manualmente. |
| short_name | text | Nombre corto para mostrar en listas y tarjetas. Generado automáticamente por la IA a partir de la descripción (ej: "Cemento gris 50kg"). Editable por el usuario. Para ítems manuales, lo escribe el usuario. |
| description | text | Descripción completa del ítem. Se importa de la columna "Descripción" del Excel (texto legal/oficial). Se muestra en el panel lateral al hacer clic en un ítem. Para ítems manuales, es opcional. |
| type | enum | **purchase**, **logistics**, **service**. Determina qué estados aplican (ver tabla abajo). Si el contrato no es "mixed", hereda el type del contrato. En contratos "mixed", la IA sugiere el tipo al importar el Excel. |
| category_id | uuid (FK, nullable) | Categoría del ítem. Se asigna automáticamente por IA al subir el Excel. Editable por el usuario. Nullable (la categoría es útil pero no obligatoria). |
| quantity | numeric | Cantidad requerida. Viene del Excel (columna "Cantidad"). Default: 1. |
| unit | text (nullable) | Unidad de medida. Viene del Excel (columna "Unidad"): 'kg', 'unidad', 'metro', 'litro', 'caja', 'global', etc. |
| sale_price | numeric (nullable) | Precio unitario que la entidad contratante paga por este ítem (viene del Excel). Es el ingreso. En COP. |
| supplier_cost | numeric (nullable) | Precio unitario que se le paga al proveedor por este ítem. Se llena cuando se asigna proveedor y se negocia precio. Es el costo. En COP. |
| supplier_id | uuid (FK, nullable) | Proveedor/prestador asignado. Aplica para compras y servicios. Nullable para logística. |
| assigned_to | uuid (FK, nullable) | Quién está encargado de esta tarea. Si es null, hereda el assigned_to del contrato. |
| status | text | Estado logístico actual. Los valores válidos dependen del type (ver tabla abajo). Default: 'pending'. |
| payment_status | text | Estado financiero: **unpaid** (sin factura), **invoiced** (tiene factura, no se ha pagado), **paid** (pago realizado). Independiente del estado logístico. Default: 'unpaid'. |
| due_date | date (nullable) | Fecha límite. Útil para logística (el evento es tal día) y servicios (plazo de ejecución). |
| contact_phone | text (nullable) | Número de WhatsApp del contacto relevante para este ítem (formato internacional: 573001234567). Para compras se usa el del proveedor (supplier.whatsapp). Para logística/servicios es la persona con quien se coordina. |
| notes | text | Notas libres |
| created_by | uuid (FK) | Quién lo creó |
| created_at | timestamp | Fecha de creación |
| updated_at | timestamp | Última modificación. Se actualiza automáticamente con trigger. |
| deleted_at | timestamp (nullable) | Soft delete. Si no es null, el ítem está archivado. |

> **Decisión de diseño: dos precios por ítem.** `sale_price` = lo que la entidad contratante paga (ingreso, viene del Excel). `supplier_cost` = lo que se paga al proveedor (costo, se llena después). La diferencia es el margen bruto: `(sale_price - supplier_cost) × quantity`. Esto permite ver la rentabilidad por ítem, por proveedor y por contrato completo. Mientras `supplier_cost` esté vacío, el margen aparece como "pendiente".

> **Decisión de diseño: payment_status separado de status.** El flujo logístico (pending → received) y el financiero (unpaid → paid) son paralelos e independientes. Un ítem puede estar "recibido" pero no pagado, o "facturado" pero sin despachar. Brandon necesita ambas vistas para saber qué pagar por BBVA Cash Net.

> **Decisión de diseño: item_number.** Es el número oficial de la ficha técnica / oferta económica. Se importa automáticamente del Excel. Permite referenciar ítems con el mismo número que usa la entidad contratante, lo cual es importante para actas de entrega y correspondencia oficial.

> **Decisión de diseño: short_name + description.** Las descripciones del Excel son textos legales largos (ej: "Suministro de cemento Portland tipo I de uso general presentación bulto por 50 kilogramos"). En listas y tarjetas se necesita un nombre corto ("Cemento gris 50kg"). La IA genera el `short_name` automáticamente en la misma llamada que clasifica categoría y tipo (costo adicional: $0). El texto original del Excel se guarda en `description` y se muestra en el panel lateral al hacer clic en el ítem. Ambos son editables por el usuario.

### Flujos de estado por tipo

| Tipo | Estados (logísticos) | Ejemplo |
|------|---------|---------|
| **purchase** | `pending` → `sourced` → `purchased` → `shipped` → `received` | Comprar cemento: sin proveedor → proveedor asignado → pagado → despachado → llegó a Leticia |
| **logistics** | `pending` → `in_progress` → `done` | Montar tarima: pendiente → en gestión (ya se habló con el proveedor de tarimas) → listo (tarima montada) |
| **service** | `pending` → `in_progress` → `done` | Mantenimiento aire #3: pendiente → técnico trabajando → completado |

| Estados financieros (todos los tipos) | Significado |
|------|---------|
| `unpaid` | No hay factura asociada |
| `invoiced` | Tiene factura pero no se ha pagado |
| `paid` | Pago realizado vía BBVA Cash Net |

> **Decisión de diseño: status como text, no enum estricto.** Esto permite que a futuro se puedan agregar estados intermedios sin migrar la base de datos. La validación de estados válidos por tipo se hace en el frontend/backend, no en la base de datos.

### Cálculos derivados de items (no se almacenan, se calculan en queries)

| Cálculo | Fórmula | Uso |
|---------|---------|-----|
| Ingreso total del ítem | `sale_price × quantity` | Lo que la entidad paga por ese ítem |
| Costo total del ítem | `supplier_cost × quantity` | Lo que cuesta comprarlo al proveedor |
| Margen bruto del ítem | `(sale_price - supplier_cost) × quantity` | Ganancia bruta por ítem |
| % de margen | `(sale_price - supplier_cost) / sale_price × 100` | Porcentaje de rentabilidad |
| Ingreso total del contrato | `SUM(sale_price × quantity)` por contrato | Valor total del contrato |
| Costo total del contrato | `SUM(supplier_cost × quantity)` por contrato | Gasto total (solo ítems con proveedor asignado) |
| Margen del contrato | Ingreso total - Costo total | Rentabilidad global del contrato |

### categories (categorías de ítems)

*(Definida arriba después de contracts)*

### suppliers (proveedores / prestadores de servicio)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid (PK) | Identificador único |
| name | text | Nombre de la empresa/tienda/persona |
| type | text | 'vendor' (vende productos), 'service_provider' (presta servicios), 'both' |
| whatsapp | text (nullable) | Número de WhatsApp en formato internacional (573001234567). Se usa para generar links wa.me con mensaje prellenado. |
| email | text (nullable) | Email de contacto |
| city | text | Ciudad de origen |
| has_rut | boolean | ¿Tiene RUT verificado? (campo de conveniencia — la fuente de verdad son los documentos en `supplier_documents`) |
| has_chamber_cert | boolean | ¿Tiene certificado de Cámara de Comercio? (campo de conveniencia) |
| iva_exempt | boolean | ¿Aplica exención IVA Amazonas? |
| bbva_registered | boolean | ¿Cuenta inscrita en BBVA Cash Net? |
| trusted | boolean | ¿Ya hemos hecho negocios antes? |
| notes | text | Notas libres |
| created_at | timestamp | Fecha de creación |
| deleted_at | timestamp (nullable) | Soft delete. |

### supplier_documents (documentos de proveedores)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid (PK) | Identificador único |
| supplier_id | uuid (FK) | A qué proveedor pertenece. ON DELETE CASCADE. |
| type | text | Tipo de documento: 'rut', 'chamber_cert', 'bank_cert', 'other' |
| file_url | text | Ruta al archivo en Supabase Storage |
| verified | boolean | ¿Brandon lo revisó y aprobó? Default: false. |
| verified_by | uuid (FK, nullable) | Quién lo verificó |
| expires_at | date (nullable) | Fecha de vencimiento (Cámara de Comercio vence cada año) |
| notes | text (nullable) | Observaciones |
| uploaded_by | uuid (FK) | Quién subió el documento |
| created_at | timestamp | Fecha de carga |

> **Decisión de diseño: supplier_documents.** Los campos `has_rut` y `has_chamber_cert` en suppliers son booleanos de conveniencia pero no guardan los archivos ni permiten verificar vigencia. Esta tabla complementa esos campos con trazabilidad completa: el archivo real, quién lo subió, quién lo verificó, y cuándo vence. Permite alertar cuando un documento está por vencer.

> **Storage**: bucket `supplier-documents` con estructura `{supplier_id}/{type}/{filename}`.

### shipments (envíos — solo aplica a ítems tipo purchase)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid (PK) | Identificador único |
| contract_id | uuid (FK) | A qué contrato pertenece |
| method | enum | avion, barco, terrestre |
| origin_city | text | Ciudad desde donde se despacha |
| dispatch_date | date | Fecha de despacho |
| estimated_arrival | date | Fecha estimada de llegada a Leticia |
| actual_arrival | date (nullable) | Fecha real de llegada (null = en camino) |
| notes | text | Guía, transportadora, observaciones |
| created_by | uuid (FK) | Quién registró el envío |
| created_at | timestamp | Fecha de creación |

### shipment_items (relación envío ↔ ítems)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| shipment_id | uuid (FK) | El envío |
| item_id | uuid (FK) | El ítem incluido en ese envío |

> **Decisión de diseño**: los envíos agrupan múltiples ítems de compra (del mismo proveedor generalmente). Los ítems de tipo logistics y service no usan envíos — su progreso se mide por cambio de estado directo.

### invoices (facturas electrónicas)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid (PK) | Identificador único |
| organization_id | uuid (FK) | A cuál de mis empresas le facturaron (hereda del contrato, pero explícito para consultas contables) |
| contract_id | uuid (FK) | A qué contrato pertenece |
| supplier_id | uuid (FK) | Quién emitió la factura |
| invoice_number | text | Número de factura (como aparece en el documento) |
| issue_date | date | Fecha de emisión |
| subtotal | numeric | Valor antes de impuestos |
| tax | numeric (nullable) | Valor del IVA (puede ser 0 si hay exención Amazonas) |
| total | numeric | Valor total de la factura |
| pdf_url | text | Ruta al PDF (representación gráfica) en Supabase Storage |
| xml_url | text (nullable) | Ruta al XML (formato DIAN) en Supabase Storage |
| notes | text | Observaciones |
| uploaded_by | uuid (FK) | Quién subió la factura |
| created_at | timestamp | Fecha de carga |

### invoice_items (relación factura ↔ ítems)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| invoice_id | uuid (FK) | La factura |
| item_id | uuid (FK) | El ítem que cubre esta factura |

> **Decisión de diseño: invoices** — Una factura puede cubrir múltiples ítems (un proveedor que te vende 10 cosas en una sola factura). Y un ítem podría tener múltiples facturas (un anticipo + un pago final). Por eso la relación es N:N a través de `invoice_items`. Los archivos reales (PDF y XML) se guardan en **Supabase Storage**, no en la base de datos — la tabla solo guarda la ruta al archivo.

> **Fase 1**: carga manual. El usuario sube PDF y opcionalmente XML, llena número de factura, proveedor y monto, y asocia a los ítems correspondientes. Al subir una factura para un ítem, el `payment_status` de ese ítem cambia automáticamente a 'invoiced'. **Fase futura**: lectura automática del XML para extraer proveedor (NIT), valor, impuestos y asociar a ítems sin input manual.

### profiles (usuarios)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid (PK, = auth.users.id) | Identificador del usuario |
| name | text | Nombre para mostrar |
| role | enum | jefe, operadora |
| created_at | timestamp | Fecha de creación |

### activity_log (registro de actividad)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid (PK) | Identificador único |
| user_id | uuid (FK) | Quién hizo la acción |
| action | text | Qué hizo: 'item_status_changed', 'supplier_assigned', 'shipment_created', 'items_imported', 'contract_completed', etc. |
| entity_type | text | Sobre qué tipo de entidad: 'item', 'contract', 'shipment' |
| entity_id | uuid | ID de la entidad afectada |
| details | jsonb | Datos extra (ej: {"from": "pending", "to": "purchased", "item_name": "Cemento gris"}) |
| created_at | timestamp | Cuándo pasó |

> **Decisión de diseño: activity_log** — Esta tabla es la que le da a Brandon la supervisión en tiempo real. Sin ella, tendría que abrir cada contrato y revisar ítem por ítem. Con ella, puede ver un feed tipo: "María asignó proveedor 'Ferretería El Triunfo' a 5 ítems — hace 2 horas" sin abrir nada.

### Triggers de base de datos

```sql
-- Trigger para actualizar updated_at automáticamente en items y contracts
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER items_updated_at
  BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER contracts_updated_at
  BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
```

> **Decisión de diseño: updated_at con trigger.** Es diferente a `activity_log`: ese es para auditoría humana ("María cambió X"), `updated_at` es para queries de la aplicación ("mostrar los 10 ítems modificados más recientemente", "detectar ítems estancados que llevan 5 días sin cambiar"). Son complementarios.

> **Decisión de diseño: soft delete con deleted_at.** En contratos, items y suppliers. Eliminar un registro deja huérfanos en activity_log y pierde historial. Un campo `deleted_at` permite "archivar" sin destruir. Las queries normales filtran `WHERE deleted_at IS NULL`. Solo el jefe puede archivar y restaurar. En el frontend, "Eliminar" se muestra como "Archivar".

## 7. Flujo de carga de contrato por Excel

> Esta es la feature central del MVP. Es la forma principal en que entran los datos al sistema.

### Contexto
Al ganar una licitación, Brandon recibe una **ficha técnica** u **oferta económica** en formato Excel con la siguiente estructura:

| # Ítem | Descripción | Unidad de medida | Cantidad | Valor unitario |
|--------|------------|-------------------|----------|----------------|
| 1 | Cemento gris x 50kg | Bulto | 120 | $45,000 |
| 2 | Computador portátil 15" | Unidad | 5 | $3,200,000 |
| 3 | Montaje de tarima para evento | Global | 1 | $2,500,000 |
| 4 | Servicio fumigación zona A | Global | 1 | $850,000 |

El "Valor unitario" es lo que **la entidad contratante le paga a Brandon** por cada unidad. Es el ingreso, no el costo.

### Flujo paso a paso

**Paso 1 — Crear contrato y subir Excel (usuario)**
El usuario crea el contrato (nombre, entidad contratante, empresa, tipo) y arrastra el archivo Excel de la ficha técnica.

**Paso 2 — Parsear el Excel (frontend)**
El sistema lee el Excel con **SheetJS** en el navegador. Detecta las columnas automáticamente por nombre (busca variantes comunes: "Item", "#", "Descripción", "Descripcion", "Unidad", "Cantidad", "Valor", "Precio", etc.). Muestra un preview en tabla para que el usuario confirme que las columnas se mapearon bien. Si no se detectaron correctamente, el usuario mapea las columnas manualmente con dropdowns.

**Paso 3 — Clasificar y nombrar con IA (Edge Function → OpenRouter → LLM)**
Se envían las descripciones de todos los ítems a una Edge Function en Supabase que llama a la API de LLM vía OpenRouter. La IA devuelve para cada ítem: el **nombre corto** (`short_name`) para listas, la **categoría** sugerida (de la lista de categorías existentes) y el **tipo** sugerido (purchase, logistics, service).

El prompt:
```
Clasifica estos ítems de una ficha técnica de licitación pública en Colombia.
Para cada ítem genera un nombre corto (máximo 6 palabras, para mostrar en listas) basado en la descripción.

Categorías disponibles: [lista de categories.name existentes]
Tipos posibles: purchase (compra de producto), logistics (coordinación/evento), service (prestación de servicio)

Ítems:
1. Suministro de cemento Portland tipo I de uso general presentación bulto por 50 kilogramos
2. Computador portátil pantalla 15 pulgadas procesador Intel Core i5 RAM 8GB
3. Montaje de tarima para evento cultural con sonido e iluminación
4. Servicio de fumigación y control de plagas zona administrativa

Responde SOLO en JSON. Formato:
[{"item": 1, "short_name": "Cemento gris 50kg", "category": "Ferretería", "type": "purchase"}, ...]

Si un ítem no encaja en ninguna categoría existente, sugiere una nueva con "new_category": true.
```

Costo estimado: ~$0.01-0.03 USD por contrato de 100 ítems (~2K tokens input + output).

**Paso 4 — Revisar y confirmar (usuario)**
Se muestra una tabla editable con todos los ítems: nombre corto sugerido, descripción original, categoría y tipo sugeridos por la IA. El usuario puede:
- Editar nombres cortos si la IA no acertó
- Corregir categorías con dropdown
- Cambiar tipos (purchase/logistics/service)
- Asignar responsable (assigned_to) a todo el lote o individualmente
- Crear categorías nuevas si la IA sugirió alguna que no existe
- Editar cantidades si hay errores en el Excel

Un botón **"Confirmar e importar"** crea todos los ítems de una vez.

**Paso 5 — Crear ítems (sistema)**
Inserta todos los ítems con: item_number, short_name (de la IA), description (texto original del Excel), unit, quantity, sale_price, category_id, type, status='pending', payment_status='unpaid'. El contrato pasa de status='draft' a status='active'. Se registra en activity_log: `action='items_imported', details={count: N}`.

### Flujo alternativo: agregar ítems manualmente
Para contratos pequeños o ítems adicionales que no estaban en el Excel original, se mantiene la opción de agregar ítems manualmente (uno por uno o pegando lista de nombres). En ese caso, categoría y tipo se seleccionan a mano. El `item_number` se puede dejar vacío o asignar manualmente.

## 8. Principios de diseño de la app

### UX / Interfaz
- **Mínima fricción**: cada acción debe requerir el menor número de clicks e inputs posible.
- **Carga por Excel como flujo principal**: subir la ficha técnica y que el sistema haga el resto. Es la puerta de entrada de datos más importante.
- **Agregar ítems manualmente como alternativa**: pegar una lista de nombres (uno por línea) para contratos pequeños o ítems adicionales.
- **Agrupar por proveedor**: la vista principal agrupa ítems por proveedor. Un click para asignar proveedor a múltiples ítems.
- **Envío por grupo**: registrar un envío seleccionando ítems con checkboxes. Solo aplica a ítems de tipo purchase.
- **Cambio de estado en lote**: seleccionar varios ítems → cambiar estado de todos a la vez.
- **Proveedores recientes**: mostrar proveedores ya usados como opciones rápidas (chips clickeables).
- **Alertas de retraso**: para compras, si un envío pasa la fecha estimada. Para logística/servicios, si pasa la due_date sin estar en "done".
- **Asignación rápida**: al importar ítems del Excel, poder asignar todo el lote a una persona con un click.
- **Vista por persona**: Brandon ve las tareas agrupadas por quién las tiene asignadas. Cada operadora ve primero las suyas.
- **Feed de actividad (solo jefe)**: un timeline tipo "María cambió 'Cemento' a Comprado — hace 2h". Permite supervisar sin abrir cada contrato.
- **Indicador de responsable**: cada ítem y contrato muestra claramente quién está encargado (avatar o iniciales).
- **Interfaz adaptativa por tipo de contrato**: al crear un contrato se selecciona el tipo (compras, logística, servicios, mixto). La UI muestra los estados y campos relevantes para ese tipo. Un contrato de logística no muestra columnas de envío ni proveedor; un contrato de compras no muestra due_date prominente.
- **Vista de margen**: para cada ítem con ambos precios asignados, mostrar el margen bruto y porcentaje. A nivel de contrato, mostrar un resumen: ingreso total, costo total (parcial si no todos tienen proveedor), margen. Destacar ítems con margen bajo o negativo.
- **Doble badge de estado**: cada ítem muestra dos badges — estado logístico (pending/shipped/received...) y estado de pago (unpaid/invoiced/paid). Permite ver de un vistazo qué falta por gestionar.
- **Responsive (desktop-first)**: se diseña para escritorio primero. En celular las operadoras pueden consultar listas, ver estados y usar el botón de WhatsApp (lo más útil en campo). Lo que NO se optimiza para celular: subir Excel, tabla de revisión post-IA, crear contratos — eso se hace en computador. Tablas grandes usan scroll horizontal en móvil.
- **Onboarding sin tutorial**: el sistema es simple y se aprende usándolo. Dashboard vacío muestra un call-to-action según el rol: "Crear tu primer contrato" (jefe) o "Esperando asignaciones" (operadora). Brandon puede crear un contrato de prueba para practicar antes de meter datos reales.
- **Contratos editables (adendos)**: los ítems de un contrato activo se pueden editar (cantidad, precio, descripción), agregar (manual o subir segundo Excel — los nuevos se suman, no reemplazan) y archivar (soft delete). No hay concepto de "adendo" como entidad separada — se edita directamente. Todos los cambios quedan en activity_log.

### Visual
- Diseño limpio, sin exceso de colores.
- Barra de progreso por contrato que muestre proporción de estados (funciona igual para los 3 tipos — solo cambian los colores/estados).
- Badges de color por estado logístico: para compras (gris→morado→amarillo→azul→verde), para logística y servicios (gris→amarillo→verde).
- Badges de color por estado de pago: (rojo→naranja→verde) = (sin factura→facturado→pagado).
- Ícono de tipo de contrato visible en la lista de contratos para distinguir rápidamente.

### Manejo de errores y edge cases
- **Si falla la IA (OpenRouter caído o respuesta inválida)**: los ítems se importan sin categoría, sin tipo y sin short_name. El usuario ve la tabla con descripciones crudas del Excel y completa a mano. Aviso: "No se pudo clasificar automáticamente. Podés asignar categorías manualmente o reintentar." Botón "Reintentar clasificación" disponible.
- **Excel con formato raro**: si hay múltiples hojas, se muestra selector de hoja. Si las columnas no se detectan automáticamente, el usuario las mapea con dropdowns. Filas vacías o basura se muestran en el preview y el usuario las desmarca. Validación: cantidad debe ser número > 0, valor debe ser número. Filas inválidas se marcan en rojo.
- **Internet inestable**: banner rojo de "Sin conexión" cuando se pierde internet (detectado con `navigator.onLine`). Reintentos automáticos (2 intentos con delay) si una acción falla por red. Si sigue fallando: "No se pudo guardar. ¿Reintentar?" El parseo del Excel funciona sin internet (se hace en el navegador) — solo la IA y el guardado necesitan conexión.

### Integración WhatsApp (wa.me)

Cada ítem tiene un botón "Contactar por WhatsApp" que abre el chat con el contacto relevante sin salir del flujo de trabajo. No usa API — es un link `wa.me` con mensaje prellenado generado automáticamente según el contexto.

**Cómo funciona:**
- El botón genera un link `https://wa.me/{numero}?text={mensaje_codificado}`
- Si ya existe conversación con ese número en WhatsApp, abre esa misma conversación
- El mensaje aparece escrito pero NO se envía automáticamente — el usuario revisa y envía
- Funciona en celular y escritorio

**De dónde sale el número:**
- Compras → `supplier.whatsapp` (el proveedor)
- Logística → `item.contact_phone` (la persona con quien se coordina)
- Servicios → `item.contact_phone` o `supplier.whatsapp` (el técnico o prestador)

**Mensaje prellenado por tipo:**
- Compras: "Hola, le escribo respecto al contrato {contrato}. Necesito seguimiento del ítem: {ítem}. Estado actual: {estado}. ¿Ya fue despachado?"
- Logística: "Hola, le escribo respecto al contrato {contrato}. Necesito confirmar: {ítem}. Estado actual: {estado}. ¿Cómo vamos?"
- Servicios: "Hola, le escribo respecto al contrato {contrato}. Seguimiento de: {ítem}. Estado actual: {estado}. ¿Ya se completó?"

**Escalabilidad:**
- Nivel 1 (MVP): links wa.me con mensaje prellenado. Gratis, cero complejidad.
- Nivel 2 (futuro): WhatsApp Business API vía Twilio o similar para notificaciones automáticas (ej: alertar al proveedor cuando un envío se retrasa). Costo: ~$15-50 USD/mes. No requiere cambios en la base de datos — solo agregar una Edge Function en Supabase.

## 9. Principios de extensibilidad

> El objetivo no es escalar a nivel industrial ni vender LiciTrack como SaaS. El objetivo es que la base sea lo suficientemente sólida para agregar nuevas funcionalidades e integraciones sin tener que reescribir lo que ya funciona.

### Reglas que seguimos para no bloquearnos a futuro

1. **Entidades separadas, no datos embebidos.** Los proveedores son una tabla propia, no un campo de texto dentro de ítems. Las categorías son una tabla propia con FK. Si un dato puede referenciarse desde múltiples lugares, merece su propia tabla.

2. **Supabase como fuente única de verdad.** Todo pasa por Supabase: datos, autenticación, permisos. Esto significa que si mañana se agrega una app móvil, un bot de WhatsApp, o una integración con Excel, todos se conectan al mismo Supabase. No hay datos duplicados ni fuera de sincronía.

3. **Row Level Security (RLS) desde el día uno.** Los permisos se definen en la base de datos, no en el frontend. Esto significa que cualquier cliente nuevo (app móvil, API externa, portal de proveedores) hereda las mismas reglas de acceso sin reescribirlas.

4. **Componentes desacoplados.** Cada componente de la UI hace una sola cosa. Si mañana se quiere cambiar el diseño de la lista de ítems, se reemplaza ese componente sin tocar el resto. Si se quiere agregar una vista nueva (dashboard de costos), se crea una página nueva que consulta las mismas tablas.

5. **No optimizar prematuramente.** No vamos a implementar caching, workers en background, ni arquitectura de microservicios. Eso es para cuando haya miles de usuarios. Si algún día se necesita, se agrega encima — no requiere reescribir.

6. **Tipos estrictos con TypeScript.** Cada tabla de Supabase genera tipos automáticamente. Si se agrega un campo nuevo a una tabla, TypeScript avisa en todo el código dónde hay que actualizarlo. Esto previene errores silenciosos cuando el proyecto crece.

7. **Soft delete, no hard delete.** Los registros importantes (contratos, ítems, proveedores) nunca se eliminan de la base de datos. Se marcan con `deleted_at` y se filtran en las queries normales. Esto preserva el historial y la integridad del activity_log.

### Integraciones futuras que la arquitectura ya soporta

| Integración | Qué se necesitaría | Qué NO hay que cambiar |
|---|---|---|
| App móvil (Expo) | Nuevo proyecto frontend, conectado a Supabase | Nada de backend ni base de datos |
| WhatsApp automático (Nivel 2) | Edge Function en Supabase + Twilio/Meta API | Nada del frontend ni tablas (números ya están guardados) |
| Portal de proveedores | Nueva página con auth separada, mismo Supabase | Tablas existentes, solo agregar RLS |
| Dashboard contable por empresa | Nueva página, queries a invoices + organizations | Nada |
| Lectura automática de XML DIAN | Edge Function que parsea XML y llena campos de invoice automáticamente | Tablas ya preparadas, solo automatiza el input |
| Exportar a Excel | Una función que lee tablas y genera .xlsx | Nada |
| Módulo de importaciones (China) | Nuevas tablas + nuevas páginas | Tablas y páginas existentes no se tocan |
| Dashboard de márgenes | Nueva página con queries a items (sale_price vs supplier_cost) | Nada, los datos ya están |

## 10. Fases de desarrollo

### Fase 1 — MVP (lo que construimos primero)
- [ ] Proyecto Next.js creado y desplegado en Vercel
- [ ] Supabase configurado con tablas (incluyendo categories, supplier_documents), Storage, triggers y RLS
- [ ] Auth: login para jefe y operadoras, invitación por link
- [ ] Sistema de roles (jefe ve y edita todo, operadora edita lo asignado)
- [ ] CRUD de mis empresas (nombre, NIT, correo facturación, documentos)
- [ ] CRUD de contratos asociados a una empresa (compras, logística, servicios, mixto) con status (draft/active/completed/cancelled)
- [ ] **Carga de contrato por Excel**: subir ficha técnica, parsear con SheetJS, preview de columnas mapeadas
- [ ] **Clasificación automática por IA**: Edge Function que llama LLM API vía OpenRouter para asignar nombre corto, categoría y tipo a cada ítem
- [ ] Pantalla de revisión post-Excel: tabla editable con categorías/tipos sugeridos, asignación de responsable en lote, botón "Confirmar e importar"
- [ ] Agregar ítems manualmente como alternativa (uno por uno o lista de nombres)
- [ ] Asignar proveedores (individual y batch) con ingreso de `supplier_cost`
- [ ] Cambiar estado logístico de ítems (individual y batch)
- [ ] Cambiar estado de pago de ítems (unpaid → invoiced → paid)
- [ ] Registrar envíos (agrupando ítems, solo para compras)
- [ ] Carga manual de facturas electrónicas (PDF + XML) asociadas a ítems y proveedor. Auto-actualiza payment_status a 'invoiced'.
- [ ] Gestión de documentos de proveedores (upload, verificación, alerta de vencimiento)
- [ ] Botón WhatsApp con link wa.me y mensaje prellenado por contexto
- [ ] Vista de envíos con alertas de retraso
- [ ] Vista de supervisión para jefe (tareas agrupadas por persona)
- [ ] Feed de actividad reciente (quién hizo qué y cuándo)
- [ ] Vista de margen por contrato (ingreso vs costo, parcial si no todos tienen proveedor)
- [ ] Soft delete (archivar/restaurar) para contratos, ítems y proveedores

### Fase 2 — Mejoras
- [ ] Dashboard contable: facturas por empresa, gastos por contrato, IVA pagado vs exento
- [ ] Dashboard de métricas por empresa: contratos activos, gasto total, facturas pendientes, top proveedores
- [ ] Lectura automática de XML DIAN (extraer NIT, valor, impuestos sin input manual)
- [ ] WhatsApp Nivel 2: notificaciones automáticas vía API (alertas de retraso, confirmaciones)
- [ ] Exportar a Excel (por contrato, por empresa, por proveedor)
- [ ] Notificaciones in-app (nueva tabla `notifications` — alerta cuando te asignan algo, deadline cerca, etc.)
- [ ] Campo `priority` en items (low, normal, high, urgent) con indicador visual
- [ ] Tabla `item_status_history` para timeline de estados y métricas de tiempos

### Fase 3 — Avanzado (futuro)
- [ ] App móvil (React Native / Expo)
- [ ] Integración con BBVA Cash Net (si tiene API)
- [ ] Múltiples organizaciones (si otros licitadores quieren usar LiciTrack)

## 11. Convenciones de código

### General
- Idioma del código: **inglés** (variables, funciones, componentes).
- Idioma de la interfaz: **español** (labels, botones, textos visibles al usuario).
- Idioma de los comentarios: **español**.
- Formato: Prettier con config por defecto.

### Estructura del proyecto
```
licitrack/
├── app/                    # Páginas (Next.js App Router)
│   ├── page.tsx            # Landing / redirect a dashboard
│   ├── login/
│   ├── dashboard/
│   │   ├── page.tsx        # Vista principal: contratos + resumen por persona
│   │   └── [contractId]/
│   │       └── page.tsx    # Detalle de contrato + ítems + margen
│   ├── contracts/
│   │   └── new/
│   │       └── page.tsx    # Crear contrato + subir Excel + revisar IA
│   ├── shipments/
│   │   └── page.tsx        # Vista global de envíos
│   ├── activity/
│   │   └── page.tsx        # Feed de actividad reciente (solo jefe)
│   ├── organizations/
│   │   └── page.tsx        # Mis empresas (NIT, docs, correo facturación)
│   ├── suppliers/
│   │   └── page.tsx        # Proveedores (documentos, verificación)
│   ├── invoices/
│   │   └── page.tsx        # Facturas electrónicas (filtrable por empresa/contrato)
│   └── layout.tsx          # Layout principal con nav
├── components/             # Componentes reutilizables
│   ├── ui/                 # Botones, inputs, modals, badges
│   └── features/           # ContractCard, ItemList, ExcelUploader, ExcelReview,
│                           # ShipmentForm, ActivityFeed, MarginSummary, etc.
├── lib/                    # Lógica compartida
│   ├── supabase/           # Cliente de Supabase, queries, types
│   ├── excel/              # Parseo de Excel con SheetJS, mapeo de columnas
│   └── utils/              # Helpers, formateo de fechas, moneda COP
├── public/                 # Assets estáticos
├── spec.md                 # Este documento (especificación técnica)
└── README.md
```

### Naming
- Componentes: PascalCase → `ContractCard.tsx`
- Funciones/variables: camelCase → `getContracts()`
- Archivos de página: `page.tsx` (convención Next.js App Router)
- Tablas en Supabase: snake_case → `shipment_items`
- Tipos TypeScript: PascalCase → `type Contract = {...}`

### Supabase
- Siempre usar Row Level Security (RLS) en todas las tablas.
- Jefe (role = 'jefe'): lectura y escritura total sobre todas las filas de todas las tablas.
- Operadora (role = 'operadora'): lectura de todo (para contexto), escritura solo en ítems/envíos donde `assigned_to` = su user_id o `created_by` = su user_id. No puede eliminar contratos ni reasignar ítems a otros usuarios. Puede subir facturas para ítems que tiene asignados.
- categories: lectura para todos, escritura solo para jefe.
- supplier_documents: misma lógica que suppliers.
- activity_log: insert para todos (cada acción se registra automáticamente), lectura solo para jefe.
- Todas las queries de lectura incluyen `WHERE deleted_at IS NULL` excepto la vista "Archivados" del jefe.
- Nunca exponer la service_role key en el frontend.
- Usar el cliente de Supabase con la anon key + RLS para controlar acceso.

### Supabase Storage
- Bucket `documents`: para RUT, Cámara de Comercio y otros documentos de las empresas.
- Bucket `invoices`: para facturas electrónicas (PDF + XML).
- Bucket `supplier-documents`: para documentos de proveedores (RUT, Cámara, certificados bancarios).
- Estructura de carpetas:
  - Empresas: `documents/{organization_id}/{filename}`
  - Facturas: `invoices/{organization_id}/{contract_id}/{invoice_id}/{filename}`
  - Proveedores: `supplier-documents/{supplier_id}/{type}/{filename}`
- RLS en Storage: mismo modelo que tablas. Jefe ve todo, operadora ve documentos de contratos que tiene asignados.
- Límite de archivo recomendado: 10MB por archivo (facturas electrónicas raramente superan 2MB).

### Edge Functions
- `classify-items`: recibe array de descripciones + lista de categorías existentes. Llama a la API de LLM vía **OpenRouter** (URL: `https://openrouter.ai/api/v1/chat/completions`). El modelo se configura como variable de entorno `LLM_MODEL` (default: `qwen/qwen-turbo`). Devuelve array de {short_name, category, type} sugeridos. No requiere auth de usuario (se llama desde el frontend autenticado vía Supabase).

> **Decisión de diseño: OpenRouter como intermediario.** En vez de conectarse directo a un proveedor de LLM (Alibaba, Google, Anthropic), se usa OpenRouter — una API unificada compatible con el formato OpenAI que da acceso a +300 modelos con un solo API key. Si mañana el modelo sube de precio o sale uno mejor, se cambia la variable de entorno `LLM_MODEL` sin tocar código. La tarea es simple (texto → JSON) así que no necesita un modelo potente.

---

## 12. Contexto adicional

- **Ubicación**: Leticia, Amazonas, Colombia. Los envíos siempre tienen como destino final Leticia.
- **Beneficio tributario**: Amazonas tiene exención de IVA (19%) en ciertos productos. Esto es un factor de negociación con proveedores nuevos. Las facturas electrónicas reflejan si se cobró o no IVA — dato importante para control contable.
- **Banco**: BBVA Cash Net es el sistema de pago. Cada proveedor nuevo requiere inscripción de su cuenta bancaria en el sistema.
- **Múltiples empresas**: Brandon es dueño/representante de varias empresas que licitan de forma independiente. Cada una tiene su propio NIT, RUT, Cámara de Comercio y correo exclusivo de facturación electrónica. Los contratos, facturas y documentos se organizan por empresa.
- **Ficha técnica / Oferta económica**: es un Excel que la entidad contratante entrega con los ítems del contrato, cantidades, unidades y valores unitarios. Es la fuente de verdad inicial para crear los ítems en el sistema. El valor unitario del Excel es lo que la entidad **paga a Brandon** (ingreso), no lo que Brandon le paga al proveedor (costo).
- **Facturación electrónica**: Los proveedores envían facturas en formato XML (DIAN) + PDF (representación gráfica). En fase 1 se cargan manualmente. A futuro el XML se puede parsear automáticamente para extraer datos (NIT proveedor, valor, IVA, número de factura).
- **Equipo**: Brandon (jefe, supervisa todo y también hace compras) + 2 operadoras nuevas que se encargan de compras asignadas. Brandon pasó de ser "el de compras" a ser el jefe que delega y supervisa. Las operadoras necesitan autonomía pero con visibilidad total de Brandon.
- **El dueño del proyecto (Brandon) está aprendiendo a programar desde cero**. Las explicaciones y la documentación deben ser claras y pedagógicas. No asumir conocimiento previo.
- **Contacto desarrollador**: Brandon tiene un parcero programador que usa un stack similar (Supabase + Vercel + React + Expo). Puede consultarle dudas técnicas.

---

## 13. Changelog del documento

| Fecha | Cambios |
|-------|---------|
| 18 mar 2026 | Versión inicial del agents.md |
| 19 mar 2026 | **Actualización mayor.** Análisis de gaps: se agregaron 7 cambios P0/P1 al modelo. Nuevos campos en contracts (status, updated_at, deleted_at). Nuevos campos en items (item_number, sale_price, supplier_cost reemplaza a cost, quantity, unit, category_id, payment_status, updated_at, deleted_at). Nuevas tablas: categories, supplier_documents. Soft delete en contracts, items, suppliers. Triggers de updated_at. Nuevo flujo central: carga de contrato por Excel con clasificación automática por IA (Claude API). Sección 7 completamente nueva. Stack actualizado con Claude API. Arquitectura actualizada con Edge Functions. Fases reorganizadas. Estructura de proyecto actualizada con nuevas rutas y módulos. |
| 19 mar 2026 | **Renombrado a spec.md.** IA: Claude API reemplazado por OpenRouter (intermediario multi-modelo, modelo configurable por variable de entorno `LLM_MODEL`). Items: campo `name` separado en `short_name` (generado por IA, para listas) + `description` (texto completo del Excel, fuente legal). El prompt de la IA ahora devuelve también `short_name`. El detalle del ítem se muestra en panel lateral al hacer clic. |
| 19 mar 2026 | **6 puntos de auditoría resueltos.** UX: responsive desktop-first (celular solo consulta), onboarding sin tutorial con EmptyState por rol, contratos editables post-creación (adendos sin entidad formal). Errores: fallback si falla IA (importar sin clasificar + reintentar), manejo de Excel con formato raro (selector de hoja, mapeo manual, validación de filas), banner de sin conexión + reintentos automáticos para internet inestable. |

---

*Última actualización: 19 de marzo de 2026*
