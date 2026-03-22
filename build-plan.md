# LiciTrack — Plan de construcción

> Guía paso a paso para construir el MVP con Claude Code.
> Cada sección = un chat nuevo con Claude Code.
> Siempre arrancá cada chat dentro de la carpeta del proyecto (`cd ~/Desktop/licitrack`).

---

## Antes de empezar: Setup del Mac

Abrí Terminal (Cmd + Espacio → "Terminal" → Enter) y ejecutá estos comandos en orden:

### 1. Homebrew
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```
Seguí las instrucciones que muestre al final (dos comandos para agregar al PATH).
Verificá: `brew --version`

### 2. Git
```bash
brew install git
git config --global user.name "Brandon"
git config --global user.email "tu@email.com"
```
Verificá: `git --version`

### 3. Node.js
```bash
brew install node
```
Verificá: `node --version` y `npm --version`

### 4. Claude Code
```bash
curl -fsSL https://claude.ai/install.sh | sh
```
Verificá: `claude --version`
Después ejecutá `claude` → te abre el navegador → autenticá con tu cuenta Pro/Max.

### 5. Crear la carpeta del proyecto
```bash
cd ~/Desktop
mkdir licitrack
cd licitrack
git init
```

### 6. Copiar el spec.md
Copiá el archivo `spec.md` a la carpeta `~/Desktop/licitrack/`.

### 7. Abrir en VS Code
```bash
code .
```

Ya estás listo. Cada chat se inicia así:
```bash
cd ~/Desktop/licitrack
claude
```

---

## Chat 1 — Fundación del proyecto

### Qué se construye
- Proyecto Next.js con App Router y TypeScript
- Estructura de carpetas según el spec
- Configuración de Supabase (cliente, tipos)
- Layout principal con navegación
- Configuración de Tailwind CSS
- Primer deploy a Vercel

### Prompt inicial
```
Lee el archivo spec.md que está en la raíz del proyecto. Es la especificación técnica completa de LiciTrack.

Necesito que hagas lo siguiente:

1. Creá el proyecto Next.js con App Router, TypeScript y Tailwind CSS
2. Instalá las dependencias: @supabase/supabase-js, @supabase/ssr
3. Creá la estructura de carpetas exactamente como dice el spec (sección 11):
   - app/ con todas las rutas (dashboard, contracts/new, shipments, activity, organizations, suppliers, invoices)
   - components/ui/ y components/features/
   - lib/supabase/, lib/excel/, lib/utils/
4. Creá el layout principal (app/layout.tsx) con una barra de navegación lateral con los links a cada sección
5. Creá archivos placeholder (page.tsx) para cada ruta con un título simple
6. Configurá el cliente de Supabase en lib/supabase/client.ts usando variables de entorno (NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY)
7. Creá un archivo .env.local.example con las variables necesarias
8. Creá el README.md con instrucciones de setup

NO crees las tablas de Supabase todavía, eso lo hacemos en el siguiente chat.
El diseño debe ser limpio, con Tailwind. Idioma de la interfaz: español.
```

### Después del chat
```bash
git add .
git commit -m "chore: proyecto base Next.js con estructura del spec"
```

### Verificación
- `npm run dev` funciona y muestra la app en http://localhost:3000
- La navegación lateral lleva a cada página
- No hay errores en la consola

---

## Chat 2 — Base de datos y autenticación

### Qué se construye
- Todas las tablas en Supabase (SQL)
- Row Level Security (RLS)
- Triggers de updated_at
- Categorías iniciales
- Autenticación (login/logout)
- Middleware de protección de rutas
- Tabla de profiles sincronizada con auth

### Preparación
Antes de este chat, necesitás tener un proyecto creado en Supabase (supabase.com → New Project). Anotá la URL y la anon key.

### Prompt inicial
```
Lee el spec.md. Vamos a trabajar en la base de datos y autenticación.

1. Generá un archivo SQL completo (supabase/schema.sql) que cree TODAS las tablas del spec (sección 6):
   - organizations, contracts, categories, items, suppliers, supplier_documents, shipments, shipment_items, invoices, invoice_items, profiles, activity_log
   - Con todos los campos, tipos, FKs y defaults exactamente como dice el spec
   - Incluyendo los campos: status en contracts, updated_at y deleted_at donde corresponde, payment_status en items, short_name y description en items, etc.
   
2. En el mismo SQL, agregá:
   - El trigger update_timestamp() para items y contracts
   - Las categorías iniciales (Ferretería, Tecnología, Papelería, etc.)
   - RLS policies para todas las tablas según el spec (jefe ve/edita todo, operadora edita lo asignado)
   
3. Creá la página de login (app/login/page.tsx) con email y password usando Supabase Auth
   
4. Creá un middleware (middleware.ts) que redirija a /login si no hay sesión activa
   
5. Agregá un trigger en Supabase que cuando se crea un usuario en auth.users, automáticamente cree su perfil en profiles

6. Conectá el layout principal para que muestre el nombre del usuario logueado y un botón de logout

El SQL debe poder copiarse y pegarse directamente en el SQL Editor de Supabase.
```

### Después del chat
1. Andá a Supabase → SQL Editor → pegá el schema.sql → Run
2. Andá a Settings → API → copiá la URL y anon key → pegalas en `.env.local`
3. Creá un usuario de prueba desde Supabase Auth
```bash
git add .
git commit -m "feat: schema completo, RLS, auth y login"
```

### Verificación
- Podés hacer login y logout
- Las tablas existen en Supabase con todos los campos
- Un usuario sin sesión es redirigido a /login

---

## Chat 3 — Empresas y contratos

### Qué se construye
- CRUD de organizations (mis empresas)
- CRUD de contracts (crear, listar, editar, archivar)
- Dashboard principal con lista de contratos y barras de progreso
- Filtros por status (draft/active/completed)
- Asignación de contrato a persona

### Prompt inicial
```
Lee el spec.md y revisá el código existente. Vamos a construir el módulo de empresas y contratos.

1. Página de organizaciones (app/organizations/page.tsx):
   - Lista de mis empresas con nombre, NIT, correo de facturación
   - Modal para crear/editar empresa
   - Upload de RUT y Cámara de Comercio a Supabase Storage (bucket "documents")

2. Dashboard principal (app/dashboard/page.tsx):
   - Lista de contratos filtrable por status: Activos | Completados | Todos
   - Cada contrato muestra: nombre, entidad, empresa, tipo (con ícono), responsable, barra de progreso
   - La barra de progreso muestra proporción de ítems por estado
   - Botón "Nuevo contrato" que lleva a /contracts/new

3. Crear contrato (app/contracts/new/page.tsx) — SOLO el formulario por ahora, sin Excel:
   - Campos: nombre, entidad contratante, empresa (dropdown de organizations), tipo (purchase/logistics/service/mixed)
   - Al crear, status = 'draft'
   - Redirige a la página del contrato

4. Detalle de contrato (app/dashboard/[contractId]/page.tsx):
   - Muestra info del contrato
   - Botón "Editar" para nombre/entidad/tipo
   - Botón "Archivar" (soft delete, solo jefe)
   - Botón "Completar contrato" (valida que todos los ítems estén en estado final)
   - Lista de ítems vacía por ahora (la llenamos en el siguiente chat)

Usá componentes reutilizables en components/features/. Diseño desktop-first con Tailwind. Interfaz en despañol.
```

### Después del chat
```bash
git add .
git commit -m "feat: CRUD empresas y contratos, dashboard con filtros"
```

### Verificación
- Podés crear una empresa con NIT y correo
- Podés crear un contrato asociado a esa empresa
- El dashboard muestra los contratos con filtros
- El contrato se puede archivar

---

## Chat 4 — Carga de Excel + IA (el corazón del MVP)

### Qué se construye
- Upload de Excel en la página de crear contrato
- Parseo con SheetJS (detección de columnas, selector de hoja)
- Llamada a OpenRouter para clasificar ítems (Edge Function)
- Pantalla de revisión con tabla editable
- Botón "Confirmar e importar"
- Fallback si falla la IA

### Preparación
Necesitás una API key de OpenRouter (openrouter.ai). Agregala a `.env.local` como `OPENROUTER_API_KEY`.

### Prompt inicial
```
Lee el spec.md (especialmente la sección 7: Flujo de carga por Excel). Revisá el código existente. Vamos a construir la feature central del MVP.

1. Instalá SheetJS: npm install xlsx

2. En la página de crear contrato (app/contracts/new/page.tsx), agregá:
   - Zona de drag & drop para subir Excel (después del formulario del contrato)
   - Si el archivo tiene múltiples hojas, selector de hoja
   - Detección automática de columnas por nombre (buscar variantes: Item/#/Número, Descripción/Descripcion/Detalle, Unidad/Medida, Cantidad/Cant, Valor/Precio/Unitario)
   - Si no detecta, dropdowns manuales para mapear columnas
   - Preview de las filas parseadas en tabla

3. Creá un API route (app/api/classify-items/route.ts) que:
   - Reciba un array de descripciones
   - Llame a OpenRouter (https://openrouter.ai/api/v1/chat/completions) con el modelo de la variable de entorno LLM_MODEL (default: "qwen/qwen-turbo")
   - Use el prompt exacto del spec (sección 7) que pide: short_name, category y type para cada ítem
   - Devuelva el JSON parseado
   - Si falla: devuelva un array vacío (el frontend maneja el fallback)

4. Pantalla de revisión (después del preview):
   - Tabla editable con: #, short_name (editable), descripción original, categoría (dropdown de categories), tipo (dropdown purchase/logistics/service), cantidad, unidad, valor unitario
   - Si la IA falló: short_name vacío, categoría vacía, tipo heredado del contrato. Aviso: "No se pudo clasificar automáticamente. Podés completar a mano o reintentar." Botón "Reintentar".
   - Selector de responsable (assigned_to) para todo el lote
   - Checkbox para desmarcar filas basura
   - Validación: cantidad > 0, valor > 0. Filas inválidas en rojo.

5. Botón "Confirmar e importar":
   - Inserta todos los ítems en Supabase con los campos del spec
   - Contrato pasa de draft a active
   - Registra en activity_log: action='items_imported'
   - Redirige al detalle del contrato

Seguí las decisiones del spec: si falla la IA no se bloquea nada. El parseo del Excel funciona sin internet. Solo la IA y el guardado necesitan conexión.
```

### Después del chat
```bash
git add .
git commit -m "feat: carga de Excel con IA, parseo SheetJS, revisión y confirmación"
```

### Verificación
- Podés subir un Excel y ver el preview
- La IA clasifica los ítems (o falla gracefully)
- Podés editar categorías y tipos antes de confirmar
- Al confirmar, los ítems aparecen en el detalle del contrato
- Probá con un Excel real si tenés uno

---

## Chat 5 — Gestión de ítems

### Qué se construye
- Vista de ítems dentro de un contrato (agrupados por proveedor)
- Asignar proveedor (individual y batch)
- Registrar supplier_cost al asignar
- Cambiar estado logístico (individual y batch)
- Cambiar estado de pago
- Botón WhatsApp
- Panel lateral con detalle del ítem

### Prompt inicial
```
Lee el spec.md y revisá el código existente. Vamos a construir la gestión de ítems dentro de un contrato.

1. En la página de detalle del contrato (app/dashboard/[contractId]/page.tsx):
   - Lista de ítems agrupados por proveedor (los sin proveedor van en un grupo "Sin asignar")
   - Cada ítem muestra: item_number, short_name, cantidad × unidad, dos badges (estado logístico + estado de pago), responsable
   - Checkboxes para seleccionar múltiples ítems

2. Acciones en batch (toolbar que aparece al seleccionar ítems):
   - "Asignar proveedor" → modal con búsqueda de proveedores + campo supplier_cost
   - "Cambiar estado" → dropdown con estados válidos según el tipo
   - "Asignar a" → dropdown de usuarios

3. Acciones individuales (click en un ítem abre panel lateral):
   - Panel derecho con: descripción completa, todos los campos editables
   - Cambiar estado logístico con botones/dropdown
   - Cambiar estado de pago (unpaid → invoiced → paid)
   - Botón WhatsApp (link wa.me con mensaje prellenado según el tipo, como dice el spec sección 8)
   - Historial de cambios recientes (últimos 5 del activity_log para ese ítem)

4. Vista de margen:
   - Si el ítem tiene sale_price y supplier_cost, mostrar el margen calculado
   - A nivel de contrato: resumen arriba con ingreso total, costo total, margen. Destacar ítems con margen bajo (<15%) en naranja y negativo en rojo.

5. Cada cambio de estado y asignación se registra en activity_log automáticamente.

Usá proveedores recientes como chips clickeables al asignar (los últimos 5 usados en ese contrato).
```

### Después del chat
```bash
git add .
git commit -m "feat: gestión de ítems, batch ops, WhatsApp, margen"
```

### Verificación
- Podés asignar proveedor a múltiples ítems a la vez
- Los badges de estado se actualizan
- El botón WhatsApp abre wa.me con mensaje correcto
- El margen se calcula cuando hay ambos precios

---

## Chat 6 — Envíos y facturas

### Qué se construye
- Crear envío agrupando ítems de compra
- Vista global de envíos con alertas de retraso
- Carga de facturas (PDF + XML)
- Asociar factura a ítems
- Auto-actualización de payment_status

### Prompt inicial
```
Lee el spec.md y revisá el código existente. Vamos a construir envíos y facturas.

1. Crear envío (desde la vista de contrato):
   - Seleccionar ítems tipo purchase con status "purchased" → botón "Crear envío"
   - Modal: método (avión/barco/terrestre), ciudad origen, fecha despacho, fecha estimada llegada, notas
   - Al crear: los ítems pasan a status "shipped" automáticamente
   - Se registra en activity_log

2. Vista de envíos (app/shipments/page.tsx):
   - Lista de todos los envíos, filtrable por contrato
   - Cada envío muestra: método, origen → Leticia, fecha despacho, fecha estimada, estado (en camino / llegó / retrasado)
   - Alerta visual si pasó la fecha estimada sin marcar llegada (badge rojo "Retrasado")
   - Botón "Marcar como recibido" → pide fecha real de llegada → ítems pasan a "received"

3. Carga de facturas (app/invoices/page.tsx):
   - Botón "Subir factura"
   - Modal: seleccionar contrato, proveedor, número de factura, fecha, subtotal, IVA, total
   - Upload de PDF y opcionalmente XML a Supabase Storage (bucket "invoices")
   - Asociar a ítems del contrato (checkboxes)
   - Al guardar: payment_status de los ítems asociados cambia a "invoiced" automáticamente

4. Lista de facturas filtrable por empresa y contrato. Cada factura con link para ver/descargar el PDF.

Todas las acciones se registran en activity_log.
```

### Después del chat
```bash
git add .
git commit -m "feat: envíos con alertas, facturas con upload PDF/XML"
```

### Verificación
- Podés crear un envío con múltiples ítems
- Los ítems cambian a "shipped" automáticamente
- La alerta de retraso aparece si pasa la fecha
- Podés subir una factura PDF y asociarla a ítems
- payment_status cambia a "invoiced" automáticamente

---

## Chat 7 — Supervisión (dashboard del jefe)

### Qué se construye
- Feed de actividad reciente
- Vista de tareas por persona
- Alertas centralizadas
- Resumen de márgenes

### Prompt inicial
```
Lee el spec.md y revisá el código existente. Vamos a construir las herramientas de supervisión para Brandon.

1. Feed de actividad (app/activity/page.tsx):
   - Timeline cronológico de activity_log
   - Cada entrada: avatar/iniciales del usuario, acción en español legible ("María asignó proveedor 'Ferretería El Triunfo' a 5 ítems"), timestamp relativo ("hace 2 horas")
   - Filtrable por usuario y por contrato
   - Solo visible para rol "jefe"

2. Dashboard mejorado (app/dashboard/page.tsx):
   - Sección superior: métricas globales (contratos activos, ítems pendientes, envíos en camino, facturas por pagar)
   - Vista agrupada por persona: cada operadora con sus ítems asignados y progreso
   - Últimas 5 actividades del feed inlineadas

3. Alertas centralizadas (en el dashboard o como sección):
   - Envíos retrasados (pasó fecha estimada)
   - Ítems estancados (más de 5 días sin cambiar de estado, usando updated_at)
   - Documentos de proveedores por vencer (expires_at en supplier_documents)
   - Ítems con margen negativo

4. Resumen de márgenes por contrato (dentro del detalle de contrato):
   - Ingreso total vs costo total vs margen
   - % de ítems con proveedor asignado
   - Lista de ítems con peor margen

Todo debe ser solo lectura para este chat — la edición ya está en los módulos anteriores.
```

### Después del chat
```bash
git add .
git commit -m "feat: feed actividad, dashboard supervisión, alertas, márgenes"
```

### Verificación
- El feed muestra las acciones que hiciste en chats anteriores
- El dashboard muestra métricas reales
- Las alertas se disparan correctamente

---

## Chat 8 — Proveedores

### Qué se construye
- CRUD de proveedores
- Upload y verificación de documentos
- Checklist de verificación legal
- Búsqueda de proveedores

### Prompt inicial
```
Lee el spec.md y revisá el código existente. Vamos a construir el módulo de proveedores.

1. Lista de proveedores (app/suppliers/page.tsx):
   - Tabla con: nombre, tipo (vendor/service_provider/both), ciudad, WhatsApp, badges de verificación (RUT ✓/✗, Cámara ✓/✗, BBVA ✓/✗, Confiable ✓/✗)
   - Búsqueda por nombre
   - Filtros: por tipo, por ciudad, solo verificados, solo con documentos pendientes
   - Botón "Nuevo proveedor"

2. Detalle/editar proveedor:
   - Todos los campos del spec: nombre, tipo, WhatsApp, email, ciudad, iva_exempt, bbva_registered, trusted, notas
   - Sección "Documentos" con:
     - Upload de RUT, Cámara de Comercio, certificado bancario a Supabase Storage (bucket "supplier-documents")
     - Cada documento muestra: tipo, fecha de subida, quién lo subió, estado de verificación (✓/✗), fecha de vencimiento
     - Botón "Verificar" (solo jefe) que marca verified=true y verified_by
     - Alerta si un documento está por vencer (30 días antes de expires_at)

3. Checklist visual de verificación legal:
   - RUT: ¿subido? ¿verificado?
   - Cámara de Comercio: ¿subida? ¿verificada? ¿vigente?
   - Cuenta bancaria BBVA: ¿inscrita?
   - Barra de progreso: "3 de 4 verificaciones completas"

4. Soft delete: botón "Archivar proveedor" (no eliminar).

Los campos has_rut y has_chamber_cert en la tabla suppliers se actualizan automáticamente cuando se sube/elimina un documento del tipo correspondiente en supplier_documents.
```

### Después del chat
```bash
git add .
git commit -m "feat: CRUD proveedores, documentos, verificación legal"
```

### Verificación
- Podés crear un proveedor y subir documentos
- La checklist visual se actualiza
- El jefe puede verificar documentos
- La alerta de vencimiento funciona

---

## Chat 9 — Pulir y edge cases

### Qué se construye
- Responsive para celular (consulta)
- Banner de sin conexión
- Reintentos automáticos
- EmptyStates por rol
- Agregar ítems manualmente
- Subir segundo Excel a contrato existente

### Prompt inicial
```
Lee el spec.md (especialmente la sección "Manejo de errores y edge cases"). Revisá el código existente. Vamos a pulir la app.

1. Responsive:
   - La navegación lateral se convierte en menú hamburguesa en móvil
   - Las tablas de ítems usan scroll horizontal en pantallas chicas
   - Los badges y botones de WhatsApp se ven bien en celular
   - La subida de Excel y la tabla de revisión NO necesitan optimización móvil

2. Manejo de conexión:
   - Componente ConnectionBanner: detecta navigator.onLine + event listeners. Barra roja fija arriba: "Sin conexión. Los cambios se guardarán cuando vuelva internet."
   - Lógica de retry: si una llamada a Supabase falla por red, reintentar 2 veces con 2s de delay. Si sigue fallando: toast con "No se pudo guardar. ¿Reintentar?"

3. EmptyStates:
   - Dashboard sin contratos (jefe): "No tenés contratos aún. Creá tu primer contrato." + botón
   - Dashboard sin asignaciones (operadora): "No tenés ítems asignados aún. Brandon te asignará tareas pronto."
   - Contrato sin ítems: "Este contrato no tiene ítems. Subí un Excel o agregá ítems manualmente."
   - Proveedores vacío: "No hay proveedores registrados. Agregá tu primer proveedor."

4. Agregar ítems manualmente a un contrato activo:
   - Botón "Agregar ítems" en el detalle de contrato
   - Opción 1: formulario individual (short_name, descripción, tipo, categoría, cantidad, unidad, sale_price)
   - Opción 2: subir otro Excel (los ítems se suman a los existentes, no reemplazan)

5. Editar ítems existentes:
   - Desde el panel lateral, poder editar: cantidad, sale_price, short_name, descripción
   - Cada edición se registra en activity_log

6. Revisá toda la app y asegurate de que no haya:
   - Textos en inglés en la interfaz (todo debe estar en español)
   - Errores de consola
   - Links rotos en la navegación
   - Queries que no filtren deleted_at IS NULL
```

### Después del chat
```bash
git add .
git commit -m "feat: responsive, conexión, empty states, edición de ítems"
```

### Verificación
- Abrí la app en el celular (o con DevTools en modo responsive) y verificá que se puede consultar
- Desconectá el WiFi y verificá que aparece el banner
- Verificá que los EmptyStates se muestran correctamente
- Probá agregar ítems manualmente y editar existentes

---

## Chat 10 — Deploy

### Prompt inicial
```
Revisá el código existente. Vamos a preparar el deploy a Vercel.

1. Asegurate de que el .gitignore incluya: .env.local, node_modules, .next
2. Asegurate de que no haya API keys hardcodeadas en el código
3. Creá un archivo .env.example con todas las variables necesarias (sin valores reales)
4. Verificá que next build compila sin errores
5. Dame las instrucciones paso a paso para:
   - Crear un repo en GitHub y pushear el código
   - Conectar Vercel con el repo
   - Configurar las variables de entorno en Vercel
   - Hacer el primer deploy
```

### Después del chat
Seguí las instrucciones que Claude te dé. El deploy a Vercel generalmente es:
1. Push a GitHub
2. Vercel.com → Import Project → seleccionar el repo
3. Agregar las variables de entorno
4. Deploy automático

---

## Reglas de oro para cada chat

1. **Siempre arrancá con "Lee el spec.md y revisá el código existente"** — esto le da contexto completo.

2. **Si Claude se confunde o el chat se pone largo** → cerrá y abrí uno nuevo. No es falla, es cómo funciona mejor.

3. **Hacé commit después de cada chat** — así si algo se rompe, podés volver atrás con `git checkout .`

4. **Probá después de cada chat** — ejecutá `npm run dev` y verificá que todo funciona antes de seguir.

5. **Si algo no funciona**, decile a Claude exactamente qué error ves: copiá el error de la consola y pegalo en el chat.

6. **No saltés chats** — cada uno construye sobre el anterior. Si saltás al Chat 5 sin hacer el 4, va a faltar código que Claude espera que exista.

---

## Tiempo estimado

| Chat | Módulo | Tiempo aprox |
|------|--------|-------------|
| 1 | Fundación | 30-45 min |
| 2 | Base de datos + auth | 45-60 min |
| 3 | Empresas y contratos | 45-60 min |
| 4 | Excel + IA | 60-90 min |
| 5 | Gestión de ítems | 60-90 min |
| 6 | Envíos y facturas | 45-60 min |
| 7 | Supervisión | 45-60 min |
| 8 | Proveedores | 45-60 min |
| 9 | Pulir | 45-60 min |
| 10 | Deploy | 15-30 min |
| **Total** | | **~8-12 horas** |

No tiene que ser en un solo día. Podés hacer 2-3 chats por sesión. El spec.md y los commits de git aseguran que no se pierde nada entre sesiones.

---

*Generado: 19 de marzo de 2026*
