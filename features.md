# LiciTrack — Features nuevas

> Funcionalidades que todavía no existen. Describí qué necesitás, para quién, y por qué.

---

## Formato

```
### [Nombre de la feature]
- **Qué:** descripción breve de la funcionalidad
- **Para quién:** qué tipo de usuario la necesita
- **Por qué:** qué problema resuelve o qué valor agrega
- **Pantallas/flujo:** descripción o boceto del flujo
- **Prioridad:** alta / media / baja
```

---

<!-- Agregá features abajo de esta línea -->

---

### Consola de administrador

- **Qué:** Sección exclusiva para el rol admin con herramientas de gestión y limpieza de datos.
- **Para quién:** Solo el administrador del sistema (no visible para otros usuarios).
- **Por qué:** Permite testear la app desde cero sin tener que borrar registros uno por uno manualmente.
- **Prioridad:** alta

#### Funcionalidades incluidas

**1. Borrado global (reset completo)**
- Botón "Limpiar todo" que hace hard delete en cascada de todo el contenido: contratos, ítems, proveedores, envíos, facturas, documentos y sus archivos en Supabase Storage.
- Requiere confirmación con un modal: el admin debe escribir "CONFIRMAR" antes de ejecutar.
- No elimina usuarios registrados ni configuración de la app — solo datos de contenido.

**2. Borrado individual por entidad**
- En cada vista de detalle (contrato, proveedor, etc.) aparece un botón "Eliminar" visible únicamente para el admin.
- Hard delete del registro y todo lo relacionado en cascada, incluyendo archivos en Supabase Storage (PDFs, XMLs, fotos).
  - Contrato → borra ítems, envíos, facturas y sus archivos.
  - Proveedor → borra documentos y sus archivos.
  - Envío / factura → borra solo ese registro y su archivo.
- Requiere confirmación antes de ejecutar.

#### Tipo de borrado
- **Hard delete** en todos los casos — no hay papelera ni soft delete. La acción es irreversible.

#### Pantallas / flujo

```
/admin
  └── Panel de administración
        ├── Sección "Datos" → botón "Limpiar todo el contenido"
        │     └── Modal de confirmación → escribir "CONFIRMAR" → hard delete de todo
        └── (El botón de borrado individual vive en cada página de detalle, solo visible si rol = jefe)
```

#### Consideraciones técnicas
- Proteger la ruta `/admin` con middleware de rol (`jefe` únicamente).
- Los endpoints de API verifican el rol server-side antes de ejecutar cualquier borrado.
- El orden de borrado respeta las FK: primero archivos de Storage, luego registros hijos, luego el registro padre.
- Registrar en `activity_log` cada acción de borrado (quién, cuándo, qué entidad, qué ID).

---

### Lista de contratos (`/contracts`)

- **Qué:** Página dedicada para ver, buscar y filtrar todos los contratos. Hoy el único lugar donde aparecen los contratos es el dashboard, sin capacidad de filtrar ni buscar.
- **Para quién:** Todos los usuarios autenticados.
- **Por qué:** A medida que crecen los contratos, el dashboard no escala para gestionar o encontrar contratos específicos.
- **Prioridad:** alta

#### Funcionalidades incluidas

**1. Lista completa de contratos**
- Tabla o tarjetas con: nombre, entidad contratante, tipo, status, fecha de inicio, fecha de fin, días restantes.
- Ordenable por columna.

**2. Filtros**
- Por status: borrador / activo / completado / cancelado.
- Por tipo: compra / logística / servicio / mixto.
- Por entidad contratante (cuando se implemente la feature de entidades).
- Por rango de fechas de fin de ejecución.

**3. Búsqueda**
- Por nombre del contrato o entidad (texto libre).

#### Pantallas / flujo

```
/contracts
  ├── Barra de búsqueda + filtros desplegables
  ├── Lista de contratos (tabla o tarjetas)
  │     └── Cada fila: nombre · entidad · tipo · status · fecha fin · días restantes
  └── Click en contrato → /dashboard/[contractId] (vista de detalle existente)
```

#### Consideraciones técnicas
- Agregar `start_date DATE` y `end_date DATE` a la tabla `contracts` (migración de schema).
- `days_remaining` se calcula en el cliente: `end_date - today`.
- Filtros vía query params en la URL para que sean compartibles/guardables.
- RLS existente aplica — cada usuario solo ve contratos de su organización.

---

### Header fijo + Campana de notificaciones

- **Qué:** Header siempre visible en la parte superior de todas las pantallas, con campana de notificaciones que avisa contratos próximos a vencer.
- **Para quién:** Todos los usuarios autenticados.
- **Por qué:** Actualmente no hay sistema de alertas. El header mobile solo existe en pantallas pequeñas y no tiene funcionalidad extra.
- **Prioridad:** alta

#### Funcionalidades incluidas

**1. Header fijo**
- Visible en desktop y mobile en todas las páginas autenticadas.
- En mobile: reemplaza el header actual (mantiene el botón de hamburguesa para abrir sidebar).
- En desktop: barra horizontal encima del contenido principal (sidebar queda a la izquierda como hoy).
- Contenido: título/logo a la izquierda + campana a la derecha.

**2. Campana con badge**
- Badge con el número de alertas activas.
- Se calcula en tiempo real al cargar: contratos con `end_date` entre hoy y hoy + 10 días y `status = 'active'`.
- Sin tabla extra — no se persisten, se recalculan por query.

**3. Panel de notificaciones**
- Click en la campana abre un panel/dropdown con la lista de alertas.
- Cada alerta muestra: nombre del contrato · días restantes · link directo al detalle.
- Ordenadas por urgencia (menos días primero).
- Si no hay alertas: mensaje "Todo al día".

#### Pantallas / flujo

```
Todas las páginas (layout autenticado):
  └── Header fijo
        ├── [Logo / LiciTrack]
        └── [🔔 3]  ← campana con badge
              └── Panel desplegable
                    ├── "Contrato SENA Leticia vence en 2 días" → link
                    ├── "Contrato ICBF Amazonia vence en 7 días" → link
                    └── ...
```

#### Consideraciones técnicas
- Requiere `contracts.end_date` (se agrega en la feature de lista de contratos).
- El layout autenticado (`app/(app)/layout.tsx`) se actualiza para incluir el header fijo.
- Query de alertas: `SELECT id, name, end_date FROM contracts WHERE status = 'active' AND end_date BETWEEN now() AND now() + INTERVAL '10 days'`.
- El header recibe las alertas como prop desde el Server Component del layout (una sola query, sin round-trips extra).

---

### Entidades contratantes

- **Qué:** Módulo para crear y gestionar las entidades que contratan (SENA, Gobernación, ICBF, alcaldías, etc.), con su información legal y documentos.
- **Para quién:** El admin crea las entidades; todos los usuarios las ven al asignar contratos.
- **Por qué:** Los contratos necesitan clasificarse por entidad contratante para filtrar, reportar y tener la documentación de cada entidad centralizada.
- **Prioridad:** alta

#### Funcionalidades incluidas

**1. CRUD de entidades (solo admin)**
- Crear entidad con: nombre, NIT, dirección, ciudad, contacto, teléfono, email.
- Subir documentos legales: RUT y Cámara de Comercio (archivos PDF).
- Editar y eliminar entidades (solo jefe).

**2. Asignación a contratos**
- Al crear o editar un contrato, seleccionar la entidad contratante de la lista.
- El campo `entity` actual (texto libre) se reemplaza por una FK a la tabla de entidades.
- Filtrar contratos por entidad en el dashboard.

**3. Vista de detalle de entidad**
- Ver toda la información de la entidad y sus documentos.
- Ver la lista de contratos asociados a esa entidad.

#### Pantallas / flujo

```
/entidades
  ├── Lista de entidades con búsqueda
  └── Botón "Nueva entidad" (solo jefe)

/entidades/[id]
  ├── Info de la entidad (nombre, NIT, contacto)
  ├── Documentos (RUT, Cámara de Comercio)
  └── Contratos asociados

/contracts/new y /dashboard/[contractId]
  └── Selector de entidad contratante (dropdown)
```

#### Consideraciones técnicas
- Nueva tabla `entities` con campos: id, name, nit, address, city, contact_name, contact_phone, contact_email, rut_url, chamber_cert_url, created_at.
- Migrar el campo `contracts.entity` (TEXT) a `contracts.entity_id` (UUID FK → entities).
- Bucket de Storage: `entity-documents` para RUT y Cámara de Comercio.
- RLS: lectura para todos los autenticados, escritura solo para jefe.

---

### Importación masiva de proveedores desde Excel

- **Qué:** Subir el Excel histórico de proveedores y que el sistema extraiga los datos automáticamente, use IA para clasificarlos, y los importe en bulk a la app.
- **Para quién:** Solo el admin (jefe).
- **Por qué:** El Excel existente tiene proveedores con los que ya se ha trabajado. Cargarlos uno por uno sería inviable.
- **Prioridad:** alta

#### Funcionalidades incluidas

**1. Upload del Excel**
- Botón "Importar desde Excel" en `/suppliers` (solo visible para jefe).
- Acepta `.xlsx` y `.xls`.
- El archivo se procesa en el backend — no se guarda en Storage.

**2. Parseo y mapeo de columnas**
- El backend lee las columnas del Excel y las mapea a los campos de la app:
  - *Proveedor* → `name`
  - *Nombre de Contacto* → `contact_name` (campo nuevo)
  - *Actividad* → IA clasifica en categoría + tipo (`vendor` / `service_provider` / `both`)
  - *Dirección* → `address` (campo nuevo)
  - *Municipio / Departamento* → `city`
  - *Fijo - Celular* → `whatsapp`
  - *Correos* → `email`

**3. Clasificación con IA**
- El campo *Actividad* (texto libre, ej: "SEGUROS Y POLIZAS") se envía al LLM junto con las categorías existentes.
- La IA devuelve: categoría sugerida + tipo de proveedor.
- Se procesa en batch (todos los ítems en una sola llamada al LLM).

**4. Vista previa antes de importar**
- Se muestra una tabla con los registros que se van a crear.
- Se indica cuántos se saltarán por duplicado (mismo nombre ya existe en la app).
- El usuario puede confirmar o cancelar.

**5. Importación**
- Bulk insert de todos los registros confirmados.
- Los proveedores importados tienen `has_rut = false`, `has_chamber_cert = false`, `trusted = false` por defecto.
- Resumen final: "X proveedores importados, Y saltados por duplicado".

#### Pantallas / flujo

```
/suppliers
  └── Botón "Importar desde Excel" (solo jefe)
        ├── Modal: drag & drop o selector de archivo (.xlsx/.xls)
        ├── Spinner "Procesando..."
        ├── Vista previa: tabla con registros detectados + badge "X duplicados"
        └── Botón "Importar X proveedores" → bulk insert → resumen
```

#### Consideraciones técnicas
- Agregar `contact_name TEXT` y `address TEXT` a la tabla `suppliers` (migración de schema).
- Parseo del Excel en el backend con una librería estándar (ej: `xlsx`).
- Clasificación en batch: una sola llamada al LLM con todas las actividades + categorías disponibles.
- Detección de duplicados: `SELECT name FROM suppliers` y comparar con los nombres del Excel (case-insensitive).
- Endpoint: `POST /api/admin/suppliers/import` — solo accesible para jefe.
- El archivo no se almacena — se procesa en memoria y se descarta.

---

### Lectura automática de facturas (PDF/XML)

- **Qué:** Al subir una factura (PDF o XML), el sistema intenta extraer automáticamente los datos clave antes de que el usuario los llene manualmente.
- **Para quién:** Admin y colaboradores que suben facturas.
- **Por qué:** Reduce errores de digitación y acelera la carga de facturas. Las facturas electrónicas en Colombia tienen formato estándar.
- **Prioridad:** media

#### Funcionalidades incluidas

**1. Extracción de datos del PDF**
- Al seleccionar el archivo PDF, enviarlo a un endpoint que use OCR o LLM para extraer: número de factura, fecha, subtotal, IVA, total, NIT del proveedor.
- Pre-llenar el formulario con los datos extraídos (el usuario puede corregir antes de guardar).

**2. Lectura del XML (si se sube)**
- Las facturas electrónicas colombianas incluyen un XML con datos estructurados.
- Parsear el XML para extraer los mismos campos de forma exacta (sin OCR).
- Si hay XML, priorizar sus datos sobre el PDF.

**3. Match automático de ítems**
- La factura ya tiene un contrato asignado. Al leer el contenido de la factura (descripciones de productos/servicios), el sistema compara contra los ítems guardados de ese contrato.
- Usa similitud de texto (LLM o fuzzy matching) para sugerir qué ítems de la app corresponden a cada línea de la factura.
- El usuario ve las sugerencias de match y puede aceptar, corregir o asignar manualmente.
- Dos modos disponibles:
  - **Automático:** el sistema sugiere los matches y el usuario confirma.
  - **Manual:** el usuario selecciona los ítems a mano como funciona actualmente.

#### Pantallas / flujo

```
/invoices → Subir factura
  ├── Usuario selecciona PDF → se envía al backend
  ├── Spinner "Leyendo factura..."
  ├── Formulario se pre-llena con datos extraídos (número, fecha, montos)
  ├── Si sube XML → se parsea y se priorizan esos datos
  ├── Sección "Ítems de la factura"
  │     ├── Toggle: "Asignar automáticamente" / "Asignar manualmente"
  │     ├── Modo automático:
  │     │     ├── Muestra cada línea de la factura con el ítem sugerido al lado
  │     │     ├── Indicador de confianza (alta/media/baja)
  │     │     └── El usuario puede cambiar la sugerencia con un dropdown
  │     └── Modo manual: selector de ítems como funciona hoy
  └── Usuario revisa todo, corrige si necesario, y guarda
```

#### Consideraciones técnicas
- Nuevo endpoint API: `POST /api/parse-invoice` que recibe el archivo y devuelve los datos extraídos + líneas de detalle de la factura.
- Para PDF: usar LLM (OpenRouter) enviando el contenido del PDF como texto o imagen.
- Para XML: parsear con un parser XML estándar (formato UBL 2.1 de DIAN).
- El pre-llenado es sugerencia, no obligatorio — el usuario siempre puede editar.
- Para el match de ítems: enviar las descripciones de la factura + los ítems del contrato al LLM y pedir que haga el match con un score de confianza.
- Los ítems del contrato se filtran por `contract_id` para limitar el scope del match.

---

### Etiquetado inteligente de ítems con IA

- **Qué:** Al crear un ítem, la IA le asigna automáticamente una etiqueta principal y sub-etiquetas basadas en la descripción del producto/servicio. Las sub-etiquetas son colapsables (se ven al hacer clic en la etiqueta principal).
- **Para quién:** Todos los usuarios al crear ítems; el sistema de recomendaciones las consume después.
- **Por qué:** Construir una base de datos rica en metadata para habilitar búsquedas avanzadas, filtros y — a futuro — recomendación automática de proveedores.
- **Prioridad:** media

#### Funcionalidades incluidas

**1. Asignación automática de etiquetas**
- Al crear o importar un ítem, la IA analiza la descripción y asigna:
  - **Etiqueta principal:** la categoría más relevante (ej: "Herramientas").
  - **Sub-etiquetas:** clasificaciones más específicas (ej: "Ferretería", "Industrial", "Jardinería").
- El usuario puede editar, agregar o quitar etiquetas antes de guardar.
- Las etiquetas se crean dinámicamente — no hay un catálogo fijo, la IA puede proponer nuevas.

**2. Visualización colapsable**
- En las listas y vistas de detalle, cada ítem muestra solo la etiqueta principal.
- Al hacer clic en la etiqueta, se despliegan las sub-etiquetas.
- Filtrar ítems por etiqueta en las vistas de contrato y en búsquedas globales.

**3. Base para recomendación de proveedores (futuro)**
- Las etiquetas de ítems se cruzan con las etiquetas/historial de proveedores.
- Cuando se necesite comprar un ítem, la IA sugiere proveedores que han vendido ítems con etiquetas similares en contratos anteriores.

#### Pantallas / flujo

```
Crear/editar ítem:
  ├── Usuario escribe descripción
  ├── IA sugiere etiqueta principal + sub-etiquetas
  ├── Usuario puede aceptar, editar o agregar más
  └── Se guardan con el ítem

Vista de ítem en lista:
  ├── [Herramientas]  ← etiqueta principal visible
  └── Click → se despliega: Ferretería · Industrial · Jardinería
```

#### Consideraciones técnicas
- Nueva tabla `tags` (id, name, created_at) para el catálogo de etiquetas.
- Nueva tabla `item_tags` (item_id FK, tag_id FK, is_primary BOOLEAN) para la relación N:N.
- El endpoint `POST /api/classify-items` existente se extiende para devolver también etiquetas sugeridas.
- Las etiquetas se normalizan (lowercase, sin duplicados) para evitar fragmentación.
- Índice en `item_tags` para búsquedas rápidas por etiqueta.

---

### Recomendación de proveedores con IA

- **Qué:** Cuando se necesita asignar un proveedor a un ítem, la IA sugiere proveedores basándose en el historial de compras, etiquetas de ítems y datos de proveedores.
- **Para quién:** Admin y colaboradores al gestionar ítems de un contrato.
- **Por qué:** Acelera la búsqueda de proveedores y aprovecha la data histórica para tomar mejores decisiones de compra.
- **Prioridad:** baja (depende de etiquetado de ítems)

#### Funcionalidades incluidas

**1. Sugerencia al asignar proveedor**
- Al abrir el selector de proveedor en un ítem, mostrar una sección "Recomendados" arriba de la lista completa.
- La IA analiza: etiquetas del ítem, historial de compras del proveedor en contratos anteriores, verificación legal del proveedor, si es de confianza.
- Muestra un score o razón breve (ej: "Vendió ítems similares en 3 contratos anteriores").

**2. Ranking de proveedores por ítem**
- En la vista de detalle del ítem, sección "Proveedores sugeridos" con lista rankeada.
- Cada sugerencia muestra: nombre, ciudad, score de match, contratos anteriores relacionados.

#### Consideraciones técnicas
- Endpoint API: `POST /api/suggest-suppliers` que recibe item_id y devuelve proveedores rankeados.
- Usa las tablas `item_tags`, `items.supplier_id` (historial), y `suppliers` para construir el contexto.
- El LLM recibe el contexto y devuelve un ranking con justificación.
- Requiere que el etiquetado de ítems esté implementado primero.

---

### Chatbot integrado con IA

- **Qué:** Un asistente conversacional dentro de la app que puede responder preguntas y hacer sugerencias basándose en los datos del sistema (contratos, ítems, proveedores, facturas, envíos).
- **Para quién:** Admin y colaboradores.
- **Por qué:** Acceso rápido a información sin tener que navegar múltiples páginas. Útil para preguntas como "¿Cuánto hemos gastado con el proveedor X?" o "¿Qué ítems del contrato Y están pendientes?".
- **Prioridad:** baja (depende de tener datos suficientes)

#### Funcionalidades incluidas

**1. Chat flotante**
- Botón flotante en la esquina inferior derecha que abre un panel de chat.
- Historial de conversación persistente durante la sesión.

**2. Consultas sobre datos**
- "¿Cuántos contratos activos hay?"
- "¿Qué proveedores tienen documentos vencidos?"
- "¿Cuál es el margen promedio del contrato X?"
- "¿Qué ítems están pendientes de envío?"

**3. Sugerencias proactivas**
- "El proveedor Y tiene el RUT vencido hace 15 días."
- "El contrato Z tiene 5 ítems sin proveedor asignado."
- "Basándose en contratos anteriores, el proveedor W podría servir para este ítem."

**4. Acciones desde el chat (futuro avanzado)**
- "Asigna el proveedor X al ítem Y" → ejecuta la acción con confirmación.
- "Marca este envío como recibido" → ejecuta con confirmación.

#### Pantallas / flujo

```
Cualquier página de la app:
  └── Botón flotante "💬" (esquina inferior derecha)
        └── Panel de chat
              ├── Input de texto
              ├── Historial de mensajes
              ├── Respuestas con datos en tiempo real
              └── Links a las páginas relevantes en las respuestas
```

#### Consideraciones técnicas
- Endpoint API: `POST /api/chat` que recibe el mensaje del usuario y el contexto.
- El backend consulta las tablas relevantes según la pregunta y envía el contexto al LLM.
- Usar function calling / tool use del LLM para decidir qué tablas consultar.
- Respetar el rol del usuario: operadora solo ve datos que le corresponden.
- Rate limiting para evitar abuso del LLM.
- Historial de chat almacenado en localStorage o en una tabla `chat_messages`.
