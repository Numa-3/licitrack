# LiciTrack MVP, módulos núcleo para SECOP II

## Objetivo

Construir el núcleo operativo de LiciTrack enfocado en 3 módulos:

1. **Radar de oportunidades**
2. **Monitor de procesos activos**
3. **Agenda operativa automática**

El sistema debe ayudar a una operación real de contratación pública en Colombia que sigue múltiples procesos simultáneos en SECOP II y necesita reducir pérdidas por falta de vigilancia, cambios no detectados y mala gestión de cronogramas.

---

## Alcance de esta fase

Esta fase **no incluye**:

- clasificador automático por empresa
- scoring de oportunidad
- histórico interno de aprendizaje
- análisis avanzado de competidores
- perfilador de entidades
- post adjudicación completo
- chat inteligente como feature principal

Sí puede dejar listas las bases para integrarlos después.

---

## Principio técnico central

**No confiar solo en un dataset abierto para monitoreo fino.**

La estrategia correcta es **híbrida**:

- usar datasets públicos de SECOP II como **sensor de descubrimiento y cambio**
- usar revisión dirigida de la **página pública del proceso** para detectar cambios finos
- guardar snapshots propios
- calcular diferencias entre versiones
- convertir cambios relevantes en alertas y tareas

---

# APIs y fuentes a usar

## 1. Datos abiertos SECOP II, fuente principal

Base API Socrata:

```text
https://www.datos.gov.co/resource
```

### Dataset principal para esta fase

#### Procesos de contratación SECOP II
```text
https://www.datos.gov.co/resource/p6dx-8zbt.json
```

Uso:
- radar de oportunidades
- detección inicial de nuevos procesos
- detección inicial de procesos actualizados
- filtros por entidad, fecha, palabra clave, estado, modalidad, cuantía, etc.

### Datasets secundarios que conviene dejar preparados

#### Contratos electrónicos SECOP II
```text
https://www.datos.gov.co/resource/jbjy-vk9h.json
```

Uso futuro:
- ampliar trazabilidad contractual
- post adjudicación
- cruces por entidad y contratista

#### Proponentes por proceso
```text
https://www.datos.gov.co/resource/wi7w-2nvm.json
```

Uso futuro:
- análisis competitivo

#### Ofertas por proceso
```text
https://www.datos.gov.co/resource/gjp9-cutm.json
```

Uso futuro:
- análisis competitivo más fino

---

## 2. Página pública de SECOP II

Base pública:

```text
https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index
```

Uso:
- inspección puntual de procesos monitoreados
- detección de cambios de cronograma
- detección de mensajes
- detección de documentos nuevos
- detección de adendas
- detección de observaciones y respuestas visibles
- obtener contexto que no siempre queda bien representado en datasets abiertos

### Nota importante
La estructura exacta de la página pública puede cambiar. Por eso, la capa de scraping debe ser:

- modular
- con selectores configurables
- con tolerancia a fallos
- con logging fuerte
- con snapshot HTML opcional para depuración

---

## 3. Socrata App Token

Debe usarse un **App Token** para mejorar estabilidad y evitar límites por IP.

Headers sugeridos:

```http
X-App-Token: TU_APP_TOKEN
Accept: application/json
```

Documentación base Socrata:
- filtros con SoQL
- `limit`
- `offset`
- `order`
- `where`
- `select`

---

# Límites y consideraciones reales

## Socrata

### Paginación
No asumir que una consulta trae todo. Usar siempre:

- `$limit`
- `$offset`

Ejemplo:

```text
https://www.datos.gov.co/resource/p6dx-8zbt.json?$limit=1000&$offset=0
```

### Orden recomendado
Para radar y cambios:

```text
$order=fecha_de_publicacion_del_proceso DESC
```

o

```text
$order=fecha_de_ultima_publicaci_n DESC
```

Los nombres reales de columnas deben verificarse con el dataset y mapearse internamente.

### Límite práctico
- sin token, riesgo de throttling por IP
- con token, mejor comportamiento
- implementar retries con backoff exponencial
- cachear respuestas cuando sea útil
- no hacer polling agresivo sin necesidad

---

## Sobre consistencia del dato
Los datasets abiertos son muy útiles, pero **no son suficientes por sí solos** para vigilar al detalle:

- cambios de cronograma
- mensajes
- documentos
- observaciones
- respuestas

Por eso, usar dataset como **detector** y página pública como **verificador fino**.

---

# Arquitectura recomendada

## Stack sugerido

### Backend
- Node.js
- TypeScript
- Express o Fastify
- PostgreSQL
- Prisma u ORM equivalente
- BullMQ o sistema de jobs equivalente
- Redis para cola y cache

### Scraping e inspección
- Playwright preferido
- fallback con HTTP + parse HTML cuando sea suficiente

### Frontend
- Next.js
- panel con tablas, timeline y calendario

### Alertas
Fase inicial:
- Telegram
- email
- notificación interna

Fase posterior:
- WhatsApp Business API

---

# Módulo A, Radar de oportunidades

## Objetivo
Detectar automáticamente nuevos procesos de SECOP II que puedan interesar al usuario.

## Flujo funcional

1. Ejecutar consultas periódicas contra dataset `p6dx-8zbt`
2. Filtrar por reglas configurables
3. Detectar procesos nuevos no vistos antes
4. Guardarlos en base local
5. Notificar
6. Permitir marcarlos como:
   - revisar
   - seguir
   - descartar

## Frecuencia recomendada
- horario laboral: cada 3 horas
- fuera de horario: cada 6 horas

## Filtros configurables
- palabra clave en objeto
- entidad
- NIT entidad
- departamento
- municipio
- modalidad
- cuantía mínima
- cuantía máxima
- estado del proceso
- fecha de publicación
- exclusiones por palabra clave
- exclusiones por entidad

## Reglas sugeridas de matching
Construir un sistema de filtros combinables con grupos tipo:

- incluye cualquier palabra
- incluye todas las palabras
- excluye palabras
- solo entidades específicas
- solo departamentos específicos
- rango de cuantía
- modalidad permitida

## Datos mínimos a guardar por proceso detectado
- secop_process_id
- referencia_proceso
- entidad
- nit_entidad
- objeto
- modalidad
- fase
- estado
- valor_estimado
- fecha_publicacion
- fecha_ultima_publicacion
- url_publica
- hash_resumen_dataset
- first_seen_at
- last_seen_at

## Alertas del radar
Formato sugerido:

```text
Nuevo proceso detectado
Entidad: X
Referencia: Y
Objeto: Z
Modalidad: ...
Valor estimado: ...
Fecha publicación: ...
Enlace: ...
```

## UI sugerida
Bandejas:
- nuevos hoy
- nuevos ayer
- en revisión
- seguidos
- descartados

---

# Módulo C, Monitor de procesos activos

## Objetivo
Monitorear procesos específicos y detectar cualquier cambio relevante después de que el usuario decide seguirlos.

## Tipos de cambio a detectar
Alta prioridad:
- cambio de cronograma
- nueva adenda
- nueva observación
- nueva respuesta de entidad
- cambio de fecha de cierre
- nuevo requerimiento relevante

Media prioridad:
- nuevo documento
- nuevo mensaje
- cambio de estado
- cambio de fase

Baja prioridad:
- cambios menores de metadatos

## Flujo híbrido recomendado

### Paso 1. Sensor dataset
Consultar `p6dx-8zbt` por procesos ya seguidos y revisar si cambió:
- fecha última publicación
- fase
- estado
- otros metadatos principales

### Paso 2. Verificación fina
Si hubo cambio, o si el proceso es crítico, inspeccionar página pública del proceso y extraer:

- cronograma visible
- lista de documentos
- lista de mensajes
- observaciones
- respuestas
- estado visible
- metadatos públicos relevantes

### Paso 3. Snapshot
Guardar snapshot estructurado del estado actual.

### Paso 4. Diff
Comparar snapshot nuevo vs snapshot anterior.

### Paso 5. Alertar
Emitir alerta con diferencias resumidas.

## Frecuencias recomendadas

### Procesos críticos
- cada 1 hora

### Procesos normales
- cada 3 horas

### Revisión profunda con scraping
- solo si dataset sugiere cambio
- o una vez diaria si el proceso está cerca a cierre

## Estructura sugerida del snapshot
```json
{
  "process_id": "string",
  "captured_at": "ISO date",
  "status": "string",
  "phase": "string",
  "schedule": [
    {
      "event_name": "string",
      "start_at": "ISO date or raw text",
      "end_at": "ISO date or raw text"
    }
  ],
  "documents": [
    {
      "name": "string",
      "published_at": "string",
      "url": "string"
    }
  ],
  "messages": [
    {
      "title": "string",
      "published_at": "string"
    }
  ],
  "observations": [
    {
      "author": "string",
      "published_at": "string",
      "summary": "string"
    }
  ]
}
```

## Reglas de diff
Detectar:
- evento de cronograma agregado
- evento de cronograma modificado
- documento agregado
- mensaje agregado
- observación agregada
- cambio de estado
- cambio de fase

## Ejemplo de alerta buena
```text
Proceso XYZ tuvo cambios

1. Se agregó un documento nuevo: Anexo técnico ajustado
2. La fecha de cierre cambió:
   antes: 2026-04-10 17:00
   ahora: 2026-04-12 17:00
3. Se publicó una nueva observación
```

## UI sugerida
Dentro del proceso:
- resumen actual
- timeline de cambios
- documentos
- cronograma
- mensajes
- observaciones
- historial de alertas

---

# Módulo D, Agenda operativa automática

## Objetivo
Convertir el cronograma y eventos del proceso en tareas operativas internas.

## Filosofía
SECOP muestra eventos del proceso. LiciTrack debe convertirlos en trabajo accionable.

## Ejemplos de tareas automáticas
- revisar pliego
- revisar anexos
- preparar observaciones
- cargar observaciones
- preparar propuesta
- validar documentos habilitantes
- revisar subsanación
- responder requerimiento
- subir póliza
- revisar adjudicación
- preparar firma
- revisar acta de inicio

## Fuentes para generar tareas
- cronograma público del proceso
- cambios detectados por monitor
- reglas internas predefinidas
- tareas creadas manualmente por usuario

## Modelo de tarea sugerido
- id
- process_id
- title
- description
- due_at
- priority
- status
- assigned_to
- source
- related_event_type
- created_automatically
- notes

## Estados de tarea
- pendiente
- en curso
- completada
- vencida
- cancelada

## Prioridades
- alta
- media
- baja

## Reglas automáticas
Ejemplo:

Si aparece evento tipo “presentación de ofertas”, crear:
- tarea previa 3 días antes: revisar oferta final
- tarea previa 1 día antes: validación final de anexos
- tarea previa 4 horas antes: confirmación de cargue

Si cambia el cronograma:
- recalcular vencimientos derivados
- marcar tareas afectadas
- generar alerta

Si aparece observación o respuesta:
- crear tarea de revisión inmediata

## UI sugerida
Dos vistas:

### Calendario
- mensual
- semanal
- diaria

### Tablero
Columnas:
- pendiente
- en curso
- vencida
- completada

Filtros:
- por proceso
- por prioridad
- por fecha
- por responsable

---

# Modelo de datos sugerido

## Tabla `processes`
- id
- secop_process_id
- reference
- entity_name
- entity_nit
- object_text
- modality
- phase
- status
- estimated_value
- published_at
- last_published_at
- public_url
- is_followed
- radar_state
- created_at
- updated_at

## Tabla `process_snapshots`
- id
- process_id
- captured_at
- snapshot_json
- source_type
- hash

## Tabla `process_changes`
- id
- process_id
- detected_at
- change_type
- priority
- before_json
- after_json
- summary

## Tabla `tasks`
- id
- process_id
- title
- description
- due_at
- priority
- status
- assigned_to
- source
- related_event_type
- created_at
- updated_at

## Tabla `alerts`
- id
- process_id
- alert_type
- priority
- channel
- payload_json
- sent_at
- delivery_status

## Tabla `watch_rules`
- id
- name
- enabled
- rule_json
- created_at
- updated_at

---

# Servicios backend sugeridos

## 1. DatasetPollingService
Responsable de:
- consultar datasets de SECOP II
- paginar
- normalizar
- guardar resultados

## 2. OpportunityRadarService
Responsable de:
- aplicar reglas del radar
- detectar nuevos procesos
- enviarlos a persistencia
- disparar alertas

## 3. ProcessWatchService
Responsable de:
- iterar procesos seguidos
- consultar señales de cambio
- decidir si hacer inspección fina

## 4. PublicProcessInspector
Responsable de:
- abrir proceso público
- extraer cronograma
- extraer documentos
- extraer mensajes
- extraer observaciones
- construir snapshot estructurado

## 5. ProcessDiffService
Responsable de:
- comparar snapshots
- clasificar cambios
- resumir diferencias

## 6. TaskGeneratorService
Responsable de:
- convertir cambios y cronograma en tareas
- recalcular tareas afectadas
- generar agenda automática

## 7. AlertDispatcher
Responsable de:
- enviar Telegram
- enviar email
- enviar notificación interna
- dejar lista futura integración con WhatsApp

---

# Consultas base de ejemplo

## 1. Procesos recientes
```text
/resource/p6dx-8zbt.json?$limit=1000&$offset=0&$order=fecha_de_publicacion_del_proceso DESC
```

## 2. Procesos recientes por palabra clave
```text
/resource/p6dx-8zbt.json?$q=mantenimiento
```

## 3. Procesos por entidad
```text
/resource/p6dx-8zbt.json?$where=nit_entidad='900123456'
```

## 4. Procesos por rango de fecha
```text
/resource/p6dx-8zbt.json?$where=fecha_de_publicacion_del_proceso between '2026-04-01T00:00:00' and '2026-04-30T23:59:59'
```

## Nota
Los nombres exactos de columnas deben mapearse tras inspeccionar metadatos del dataset. No hardcodear sin una capa de traducción.

---

# Requisitos no funcionales

## Logging
Registrar:
- request a dataset
- número de filas
- tiempo de respuesta
- cambios detectados
- errores de scraping
- alertas emitidas

## Observabilidad
- dashboard de jobs
- estado de polling
- tasa de errores
- cantidad de cambios detectados por día

## Reintentos
- backoff exponencial
- cola separada para scraping fallido
- umbral de reintentos por proceso

## Idempotencia
Evitar:
- alertas duplicadas
- tareas duplicadas
- snapshots duplicados

---

# Orden recomendado de implementación

## Fase 1
1. conexión estable a dataset `p6dx-8zbt`
2. normalizador de procesos
3. persistencia en PostgreSQL
4. radar de oportunidades
5. UI mínima de procesos nuevos

## Fase 2
6. marcar procesos como seguidos
7. servicio de monitoreo
8. inspector de página pública
9. snapshots
10. diff de cambios
11. alertas

## Fase 3
12. generador de tareas
13. calendario
14. tablero de tareas
15. recálculo por cambio de cronograma

---

# Qué no hacer

- no confiar solo en scraping desde el inicio
- no depender solo del dataset para monitoreo fino
- no arrancar con WhatsApp como único canal
- no meter el chat antes de tener backend sólido
- no hardcodear columnas sin capa de mapeo
- no asumir que todos los cambios importantes se reflejan igual en los datos abiertos

---

# Resultado esperado de esta fase

Al terminar esta fase, LiciTrack debe poder:

1. detectar procesos nuevos que coincidan con filtros configurados
2. permitir seguir procesos específicos
3. detectar cambios relevantes en procesos activos
4. alertar al usuario por canales configurados
5. convertir cronogramas y eventos en tareas operativas visibles en calendario y tablero

Ese es el núcleo operativo real del producto.
