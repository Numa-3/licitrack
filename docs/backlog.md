# LiciTrack — Backlog

Fuente única de verdad para todo lo pendiente: mejoras a lo existente y features nuevas.
Última actualización: 2026-04-21

---

## Mejoras a features existentes

Ajustes y pulido sobre lo que ya está construido.

### Alta prioridad

| # | Mejora | Módulo |
|---|--------|--------|
| 16 | Rediseñar calendario SECOP: 1 marcador por contrato por día, solo próximo deadline futuro, click abre cronograma completo, filtros por tipo de evento, cambios solo pasados/presentes (nunca futuro) | Calendario SECOP |
| 17 | Worker: detectar sesión expirada ANTES de discovery (hoy pierde 1 ciclo cuando cookies caducan justo antes de scrape — página de 9807 bytes → 0 contracts → re-loguea al ciclo siguiente). Fix: hacer HEAD request liviano pre-scrape o refrescar cookies proactivamente | Worker SECOP |
| 18 | Bootstrap contractual: al marcar `monitoring_enabled=true` en un contrato, capturar primer snapshot en ~1min en vez de esperar ciclo completo (hoy solo precontractual tiene bootstrap). Diseño: [docs/design/bootstrap-contractual.md](design/bootstrap-contractual.md) | Worker SECOP |
| 19 | Rearquitectura scraping en 4 capas para reducir mantenimiento de 4-10h/mes a 0.5-2h/mes. **Capa 1**: datos.gov.co como fuente primaria (70-80% de campos sin scraping). **Capa 2**: Playwright navega + Claude Sonnet 4.6 extrae con schema (reemplaza 277 líneas de selectores cheerio en `parsers/contract-detail.ts`). **Capa 3**: validación Zod + golden set de 5-10 HTMLs reales en `worker/tests/fixtures/`. **Capa 4**: healthcheck + alertas (>30% campos null, worker sin correr >2h, validación falla, costo LLM excede umbral) + tabla `scrape_runs`. Costo: ~$15-30/año. Esfuerzo: 4-6 días. Riesgos: no determinismo LLM (mitigado con Zod), dependencia de proveedor (mitigar con modelo fallback), costo runaway (alerta diaria). Arranque sugerido: validar Capa 1 aislada antes de comprometerse al plan completo | Worker SECOP |

### Media prioridad

| # | Mejora | Módulo |
|---|--------|--------|
| 6 | Botón cargar RUT/Cámara de Comercio al crear proveedor + auto-extraer datos | Proveedores |
| 7 | Mostrar info RUT (autoretenedor, régimen tributario) en detalle proveedor | Proveedores |
| 8 | Filtrar ítems en detalle de contrato por estado / proveedor / categoría | Contratos |
| 9 | Botón copiar descripción de ítem | Contratos |
| 10 | Botón copiar rápido NIT / dirección / nombre de entidad contratante | Entidades |
| 11 | Filtros en paso "Revisar e importar" del wizard de importación | Wizard |
| — | Highlight visual para ítems sin proveedor asignado (banner + fila resaltada) | Contratos |
| — | Edición de perfil de usuario (nombre, foto, contraseña) | Auth |

### Baja prioridad

| # | Mejora | Módulo |
|---|--------|--------|
| 12 | Limpieza UI general (espaciado, colores, consistencia) | Global |
| 13 | Simplificar botones del header | Global |
| 14 | Maximizar espacio de tablas | Global |
| 15 | Nivel de dificultad AI para clasificación de ítems | Wizard |
| — | Dashboard — métricas ejecutivas (contratos activos, gasto total, ítems pendientes) | Dashboard |

---

## Features nuevas

Funcionalidades que no existen todavía.

### Alta prioridad

#### Centro de monitoreo del sistema (`/admin/monitoreo`)
- Dashboard interno que muestra estado en tiempo real de worker, cuentas SECOP, procesos monitoreados y servicios externos
- **Qué mostraría**:
  - Tarjeta 1 — **Worker SECOP**: estado del servicio NSSM (running/stopped), último ciclo, próximo ciclo, errores recientes del log, tiempo promedio por ciclo, créditos CapSolver
  - Tarjeta 2 — **Cuentas SECOP**: semáforo por cuenta, última sync exitosa, sesiones activas/expiradas, botón "sincronizar ahora"
  - Tarjeta 3 — **Procesos monitoreados**: total por tipo (contractual/precontractual), scrapes fallidos, snapshots viejos, cambios recientes
  - Tarjeta 4 — **Servicios externos**: status + latencia de Supabase, OpenRouter, CapSolver, API SECOP II (datos.gov.co)
  - **Timeline de errores**: últimos 50 errores/warnings unificados con filtros y stack trace
- **Por qué**: hoy diagnosticar un fallo toma 1-2h de trabajo manual (entrar al servidor por AnyDesk, leer logs, chequear Vercel env vars, etc.). Con esto sería <5min. Origen real: sesión del 2026-04-19 donde debug del "Sin sesión" tomó horas
- **Alertas (fase 2)**: worker sin heartbeat >10min, cuenta sin sincronizar >24h, CapSolver <100 créditos, webhook opcional a Telegram
- **Consideraciones técnicas**:
  - Empezar custom reutilizando `/api/debug/secop-status` como base; meter Sentry solo si aparecen errores frontend difíciles
  - Worker hoy no expone HTTP — mejor opción: escribir heartbeat a nueva tabla `worker_heartbeat` cada X segundos (no requiere cambios de firewall)
  - Nueva tabla `system_health_log` con eventos + timestamp, retención 30 días
- **Relación**: complementa (no reemplaza) el Centro de Notificaciones In-App. Notificaciones = cambios en contratos/procesos/pólizas. Monitoreo = salud del sistema en sí

#### Métricas operativas de mecanismos internos del worker (add-on al Centro de monitoreo)
- **Add-on específico** al `/admin/monitoreo`: mientras la idea anterior cubre servicios externos (Supabase, OpenRouter, CapSolver, API SECOP), esta cubre los **engranajes internos** del worker que corren en paralelo (bootstrap, polling, node-cron, discovery, diff engine)
- **Qué monitorear**:
  - **Bootstrap queue**: último bootstrap ejecutado (ts + NTC), cola pendiente (`api_pending=true` count), tiempo promedio, últimos 10 con status/razón, alerta si pendientes >30min
  - **Polling loop**: último latido, iteraciones en 24h (~480 con intervalo 3min), alerta crítica si dejó de latir >10min
  - **Monitoreo node-cron (5 ciclos/día)**: próximo ciclo programado (countdown), último ciclo (ts + duración + procesos revisados + cambios detectados), historial últimos 5, alerta si un ciclo programado no se ejecutó
  - **Discovery de cuentas**: última corrida por cuenta, entidades nuevas vs conocidas, cuentas con fallos repetidos
  - **Captcha solver**: tasa éxito/fallo últimas 24h, tiempo promedio de respuesta, créditos disponibles, alerta si tasa fallo >20%
  - **Diff engine**: cambios detectados hoy (total + por tipo), snapshots corruptos/vacíos, snapshots por source_type
- **Vista tipo "health check"** arriba del panel con semáforos grandes por componente: 🟢 Bootstrap operativo (hace 2min), 🟡 Captcha degradado (fallo 15%), etc.
- **Por qué**: hoy si el bootstrap se cae silenciosamente el usuario pega links que nunca aparecen → frustración → investigación manual. Con esto: en el panel se ve de inmediato cuál mecanismo falló → hipótesis rápida → fix en minutos. Patrón profesional: cada "engranaje" reporta su propio heartbeat
- **Consideraciones técnicas**:
  - Tabla `worker_heartbeats` (componente, timestamp, status, metadata_json)
  - Cada mecanismo escribe heartbeat en su inicio y cierre
  - Panel compara timestamps contra umbrales esperados
  - Frontend: card por componente con línea temporal de últimos 10 latidos
  - Retención: 7 días detallados, luego agregados diarios
- **Relación**: NO reemplaza el Centro de monitoreo general — ambas ideas deberían ejecutarse juntas en el build de `/admin/monitoreo`. Esta es la capa "observabilidad interna del worker"
- Origen: sesión del 2026-04-21 definiendo scraper-first fallback para precontractual; al tener bootstrap + polling + node-cron corriendo en paralelo, si alguno falla silenciosamente no nos enteramos

#### Consola de administrador (`/admin`)
- Hard delete global (reset completo con confirmación "CONFIRMAR")
- Hard delete individual desde cada vista de detalle (solo jefe)
- Registro en `activity_log` de cada borrado
- Proteger ruta con rol `jefe`

#### Lista de contratos filtrable (`/contracts`)
- Tabla con: nombre, entidad, tipo, status, fecha fin, días restantes
- Filtros: status, tipo, entidad, rango de fechas
- Búsqueda por texto libre
- Requiere migración: agregar `start_date` y `end_date` a tabla `contracts`

#### Header fijo + sistema de notificaciones estructurado
- Header visible en desktop y mobile en todas las páginas autenticadas
- **No** un dropdown genérico con mil notificaciones desordenadas — el operador las ignora
- Sistema de **alarmas** para lo crítico (contratos por vencer, tareas vencidas) separado de lo informativo
- Diseño muy visual: que se entienda de un vistazo qué es urgente vs. qué es contexto
- Categorización clara (ej: alarmas rojas, avisos amarillos, info gris) para que nada importante se pierda
- Requiere `contracts.end_date` (se agrega en lista de contratos)
- ⚠️ Pendiente: analizar en detalle la estructura, categorías y UX antes de implementar

#### Seguimiento de tareas por contrato
- Reemplaza el Excel de control que el equipo usa hoy para rastrear pendientes por contrato
- Cada contrato tiene una lista de tareas con: descripción, responsable, fecha límite, estado (pendiente/en progreso/hecho)
- Ejemplos reales: "subir póliza a SECOP antes del viernes", "Claudia: traer acta de inicio del ICBF", "revisar diariamente SECOP por aprobación de ampliación"
- Vista consolidada de todas las tareas pendientes del equipo, filtrable por contrato/responsable/fecha
- Notificaciones cuando una tarea está próxima a vencer
- Requiere nueva tabla: `contract_tasks` (contract_id, assigned_to, description, due_date, status, created_by)

#### Integración con API SECOP 2
- Conectar LiciTrack con la API pública de Colombia Compra Eficiente (SECOP 2) para consumir datos de contratación estatal
- **Oportunidades**: buscar y filtrar procesos de contratación abiertos relevantes al perfil del equipo
- **Seguimiento**: cruzar contratos existentes en LiciTrack con sus registros en SECOP 2 (estado, documentos publicados, adendas)
- Por qué: el equipo hoy entra manualmente a SECOP; centralizar la consulta ahorra tiempo y evita que se pierdan oportunidades o actualizaciones
- Consideraciones técnicas: API pública en `https://www.datos.gov.co/resource/...` (SODA API); autenticación con app token; definir qué entidades/estados monitorear; posible webhook o polling periódico para detectar cambios

#### Parser precontractual (procesos/licitaciones abiertas)
- El worker actual solo sabe extraer datos de contratos **ya adjudicados** (las 9 pestañas: info, condiciones, bienes, docs, pagos, modificaciones, etc.)
- Falta parser para la vista **precontractual** (licitación abierta, aún no adjudicada) — estructura HTML distinta, con cronograma de deadlines (cierre de presentación, adendas, observaciones)
- **Lo más crítico**: cronograma con fechas clave que hoy se pueden pasar por alto porque el tracker no los ve
- Permitir al usuario pegar link directo a un proceso no adjudicado para empezar a trackear desde etapas tempranas
- Consideraciones técnicas: detectar tipo de URL (contractDetail vs processNotice) para elegir parser correcto; `secop_processes` ya tiene el campo `source` pero falta lógica para estado "precontractual" vs "contractual"
- Nomenclatura propuesta: pre-adjudicación = "Proceso" / post-adjudicación = "Contrato" (validar con usuario)

#### Integración calendario SECOP ↔ ítems a comprar
- Cruzar deadlines de contratos SECOP con `items.due_date` del módulo de compras para alertas combinadas
- Alertas cruzadas: "Faltan 3 días para deadline del Contrato X — tienes 2 ítems sin proveedor asignado"
- Due dates de ítems visibles en el mismo calendario (con color distinto del deadline del contrato)
- Vista del día: al hacer click en fecha con deadline de contrato, mostrar resumen "contrato X tiene N ítems pendientes de compra"
- Por qué: el calendario SECOP solo sirve si cruza con operaciones reales (compras). Hoy son dos silos separados
- Requiere: feature "Unificar contratos SECOP con módulo de ítems/compras" implementada primero

#### Unificar contratos SECOP con módulo de ítems/compras
- Al asignar contrato + entidad a un ítem de compra, usar los datos ya capturados por el SECOP tracker en vez de crear contratos manualmente
- Hoy existen **dos fuentes separadas**: tabla `contracts` (manual, el equipo escribe nombre y entidad) y tabla `secop_processes` (SECOP tracker extrae objeto, entidad, fechas, valor, estado automáticamente)
- Problema: duplicación de trabajo — se re-escribe a mano lo que el worker ya sabe
- Solución propuesta: permitir que un ítem se vincule directamente a un `secop_process_id`, o unificar ambas tablas con un tipo/source (`manual` vs `secop`)
- Al crear un ítem, selector de contratos que liste los monitoreados en SECOP; autocompleta entidad, objeto, fechas
- Consideraciones técnicas: decidir si migrar `contracts` para soportar link a `secop_processes`, o crear vista unificada; revisar FK de `items.contract_id` e impacto en wizard de importación, facturas y reportes
- Por qué es alta prioridad: el equipo ya está cargando todos los logins y contratos de SECOP — sería el momento ideal para aprovechar esa data en el módulo de compras

#### Importación masiva de proveedores desde Excel
- Subir `.xlsx` → mapeo de columnas → clasificación con IA en batch
- Vista previa con detección de duplicados
- Bulk insert con resumen final
- Requiere migración: agregar `contact_name` y `address` a tabla `suppliers`

#### Centro de Notificaciones In-App (`/notificaciones`)
- Dashboard unificado que centraliza alertas de las dos funciones principales de LiciTrack
- **Layout**: dos cajitas de resumen arriba (una por categoría, cada una con su color) + feed cronológico grande abajo
- **Categoría A — Procesos SECOP** (color propio): deadlines de cronograma ("en 2 días vence plazo para observar"), cambios de estado (adjudicación → adjudicado → finalizado), cualquier modificación detectada
- **Categoría B — Ítems y Proveedores** (color propio): recordatorios de estado estancado ("ítems llevan 2 días en 'enviado'"), cambios de estado de ítems, acceso rápido a WhatsApp del proveedor
- **Interacción**: click en cajita de arriba → filtra el feed a solo esa categoría; cada notificación tiene el color de su categoría
- **Feed**: scroll vertical, orden cronológico (más reciente arriba), todas las notificaciones mezcladas con color para distinguir
- Por qué: las notificaciones de Telegram ya existen pero falta un centro visual dentro de la app que consolide todo de un vistazo
- Requiere: tabla `notifications` (o extender la existente si se crea en Fase 1); integración con worker SECOP y lógica de trackeo de ítems
- Relacionado con: "Header fijo + sistema de notificaciones" y "Fase 1 SECOP" — este dashboard es la implementación concreta del centro de notificaciones

#### Fase 1: Dashboard de Seguimiento + Centro de Notificaciones (`/secop/seguimiento`)
- KPIs arriba: contratos monitoreados, alertas urgentes, cambios hoy, próximo deadline
- Feed de cambios en tiempo real (timeline): "Hace 2h: Contrato 03-2024 cambió a Terminado"
- Contratos en riesgo: los que tienen deadline < 7 días
- Estado del worker: último ciclo, próximo, errores (de `secop_monitor_log`)
- Campana de notificaciones en header con badge de pendientes
- Categorías: roja (crítico: incumplimiento, vencido), amarilla (atención: deadline <48h, nuevo doc), verde (info: pago, actualización)
- Marcar como leída/no leída
- Requiere: datos ya están en DB (`secop_monitor_log`, `secop_process_changes`, `secop_processes`); nueva tabla `notifications`

#### Fase 2: Calendario de Deadlines (`/secop/calendario`)
- Vista mensual/semanal con fechas de vencimiento, liquidación, entrega, renovación
- Color por urgencia: rojo (vencido/hoy), amarillo (<7 días), verde (OK)
- Alertas escalonadas: aviso a 7 días, 3 días, 1 día y día del deadline
- Click en evento → detalle del contrato
- Futuro: sincronización con Google Calendar

#### Fase 3: WhatsApp Integration
- Conectar con Twilio WhatsApp API o Meta Cloud API al grupo de trabajo
- Alertas automáticas: cambio de estado, deadline 48h/24h/vencido, nuevo documento, incumplimiento, nuevo pago
- Formato estructurado: "CONTRATO 03-2024 | Estado cambió a Liquidación | Valor: $52.7M"
- Resumen diario automático al grupo: "Hoy: 3 cambios, 2 deadlines esta semana"

### Media prioridad

#### Rediseño completo de frontend con Claude Design
- Rediseñar UI/UX de LiciTrack pantalla por pantalla usando Claude Design (producto oficial de Anthropic lanzado 2026-04-17, powered by Opus 4.7)
- **Qué hace**: generar mockups con Claude Design leyendo el codebase + `DESIGN.md` como contexto, iterar en conversación/sliders, luego portar a React/Tailwind preservando lógica existente
- **Por qué**: frontend actual es funcional pero "mediocre" — prioridad hasta ahora fue cerrar features, UX quedó en segundo plano. Con flujos críticos ya estables, toca salto visual
- **Orden de rediseño**:
  1. Dashboard (`/dashboard`) — primera pantalla, debe dar visión ejecutiva
  2. Seguimiento SECOP (`/secop/seguimiento`) — tabla principal de uso diario
  3. Panel de detalle del proceso (sidebar derecho)
  4. Calendario (`/secop/calendario`) — actualmente básico, puede ser mucho más visual
  5. Contratos (`/contratos`) — tabla con filtros
  6. Notificaciones (campana) — panel lateral, puede agrupar por día + preview
- **Qué NO cambiar**: navegación (sidebar fija + estructura de rutas funciona bien), sistema de permisos jefe/operadora, API routes y lógica de negocio (puro frontend)
- **Decisión**: NO usar más AIDesigner MCP — se retira del `.mcp.json`. Claude Design es el oficial, misma modelo, integración más limpia, exporta a PDF/URL/PPTX/Canva
- **Consideración crítica**: 80% del esfuerzo está en implementación, no en mockup. Cada pantalla = 2-4h reales (preservar loading states, errores, paginación, permisos, optimistic updates). Proyecto de 2-3 sprints dedicados
- **Prerequisito para arrancar**:
  - Telegram notifications funcionando
  - Centro de monitoreo `/admin/monitoreo` construido
  - Precontractual tracker probado con múltiples casos reales
- **Workflow cuando arranquemos**: actualizar `DESIGN.md` con dirección clara → mockup por pantalla en Claude Design → iterar → exportar URL de referencia → portar a React/Tailwind

#### Fase 4: Radar de Procesos (`/secop/radar`)
- Vista visual de todos los procesos monitoreados
- Agrupados por entidad y estado
- Semáforo verde/amarillo/rojo según actividad reciente y deadlines
- Filtros por entidad, estado, prioridad, fecha

#### Fase 5: Resumen Semanal + Email
- PDF automático con todos los cambios de la semana
- Envío por email al equipo
- Historial de cambios por contrato (timeline completo desde primer snapshot)

#### Fase 6: Scoring de Riesgo + Asignaciones
- Ranking de contratos por nivel de atención (deadline cercano + modificaciones + valor alto = más riesgo)
- Asignación de responsables por contrato ("este contrato lo vigila Claudia")
- Alertas de inactividad: "Contrato X lleva 30 días sin cambios — verificar"
- Comparador de versiones: ver qué cambió entre dos otrosíes lado a lado
- Exportar estado actual de todos los contratos a Excel

#### Etiquetado inteligente de ítems con IA
- Al crear un ítem, la IA asigna etiqueta principal + sub-etiquetas basadas en la descripción
- Visualización colapsable: etiqueta principal visible, sub-etiquetas al hacer clic
- Filtrar ítems por etiqueta
- Requiere nuevas tablas: `tags` y `item_tags`

### Baja prioridad

#### Recomendación de proveedores con IA
- Al asignar proveedor a un ítem, mostrar "Recomendados" arriba de la lista
- Basado en historial de compras, etiquetas de ítems y verificación legal
- Requiere etiquetado de ítems implementado primero

#### Chatbot integrado
- Panel flotante con consultas en lenguaje natural sobre los datos del sistema
- Respeta el rol del usuario (operadora ve solo sus datos)
- Rate limiting para evitar abuso del LLM

---

## Ya implementado (referencia)

| Feature | Versión |
|---------|---------|
| Auto-completar formulario de factura desde PDF/XML | v1.1.0 |
| Formato COP unificado (`formatCurrency`) | v1.1.0 |
| Auto-marcar como pagado al comprar | v1.1.0 |
| Filas clickeables en tabla de entidades | v1.1.0 |
| Paginación en pasos 3 y 4 del wizard | v1.1.0 |
| Módulo de entidades contratantes | v1.0.1 |
| Módulo de proveedores | v1.0.0 |
| Supervisión, alertas y dashboard | v1.0.0 |
