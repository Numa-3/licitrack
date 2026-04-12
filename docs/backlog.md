# LiciTrack — Backlog

Fuente única de verdad para todo lo pendiente: mejoras a lo existente y features nuevas.
Última actualización: 2026-04-11

---

## Mejoras a features existentes

Ajustes y pulido sobre lo que ya está construido.

### Alta prioridad

_(ninguna pendiente)_

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

#### Importación masiva de proveedores desde Excel
- Subir `.xlsx` → mapeo de columnas → clasificación con IA en batch
- Vista previa con detección de duplicados
- Bulk insert con resumen final
- Requiere migración: agregar `contact_name` y `address` a tabla `suppliers`

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
