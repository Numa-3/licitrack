# LiciTrack — Design System

> Este archivo se pasa como contexto a Claude Design al generar mockups.
> Mantenerlo actualizado garantiza consistencia visual entre todas las páginas.

---

## Identidad visual

- **Producto**: LiciTrack — gestión de licitaciones y contratos públicos
- **Usuarios**: Jefe (admin) y Operadoras (equipo de ejecución)
- **Estética**: Linear-inspired — alta densidad de información, tipografía ajustada, sin decoración innecesaria
- **Vibe**: SaaS interno profesional. Minimalista pero funcional. No un dashboard de marketing.

---

## Layout

- **Sidebar fija** a la izquierda, ancho `260px`, fondo `#111216`
- **Área de trabajo** a la derecha: fondo `#FAFAFA`, scroll vertical
- **Header sticky** de `56px` dentro del área de trabajo: fondo blanco, borde inferior `#EAEAEA`
- El header contiene: breadcrumb izquierda, acciones globales (búsqueda, botón primario) derecha

---

## Paleta de colores

### Sidebar
| Token | Valor |
|---|---|
| Fondo | `#111216` |
| Hover ítem | `#1E1F24` |
| Ítem activo bg | `#24252A` |
| Borde sidebar | `#2A2B30` |
| Accent activo | `#6366F1` (indigo-500) con glow `rgba(99,102,241,0.6)` |

### Área de trabajo
| Token | Valor |
|---|---|
| Fondo página | `#FAFAFA` |
| Borde UI | `#EAEAEA` |
| Fondo cards | `#FFFFFF` |
| Texto primario | `#111827` (gray-900) |
| Texto secundario | `#6B7280` (gray-500) |
| Texto muted | `#9CA3AF` (gray-400) |

### Acentos funcionales
| Uso | Color |
|---|---|
| Activo / En curso | Blue: `bg-blue-50 text-blue-700 ring-blue-700/10` |
| Borrador | Amber: `bg-[#FFFBF0] text-amber-700 ring-amber-600/20` |
| Completado | Green: `bg-[#F0FDF4] text-green-700 ring-green-600/20` |
| Cancelado | Red: `bg-red-50 text-red-700 ring-red-600/20` |
| Alerta / Atención | Amber panel: `bg-[#FFFDF7] border-[#FBECC6]` |
| Peligro crítico | Red-500 |

---

## Tipografía

- **Fuente**: Inter (Google Fonts) — `font-family: 'Inter', sans-serif`
- **En Next.js**: usar Geist Sans (ya configurado en el proyecto)
- Tamaños:
  - Título de página: `text-xl font-semibold`
  - Label de sección: `text-xs font-semibold uppercase tracking-widest text-gray-500`
  - Body tabla: `text-sm`
  - Metadata/muted: `text-xs text-gray-500`
  - Número KPI: `text-3xl font-semibold tracking-tight`

---

## Componentes — patrones fijos

### Sidebar ítem activo
```
relative flex items-center px-3 py-1.5 rounded-md text-sm font-medium bg-[#24252A] text-white
+ div absoluto: left-0, h-4, w-[3px], bg-indigo-500, rounded-r-full, shadow glow indigo
```

### KPI Card
```
bg-white border border-[#EAEAEA] rounded-xl p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]
hover:border-gray-300 transition-colors
- Header: label texto-xs gray-500 + ícono en caja rounded-md con bg tonal
- Valor: text-3xl font-semibold text-gray-900
- Footer: tendencia con ícono trend-up/down + texto, o progress bar
```

### Status pill (inline-flex)
```
inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ring-1 ring-inset
+ dot de color (w-1.5 h-1.5 rounded-full) o ícono check para completado
```

### Alert panel
```
bg-[#FFFDF7] border border-[#FBECC6] rounded-xl p-4
flex items-center gap-4
- Ícono warning circular amber a la izquierda
- Título + subtítulo en el centro
- Badges clickeables con dot de color a la derecha
```

### Data table
```
bg-white border border-[#EAEAEA] rounded-xl overflow-hidden shadow-xs
thead: bg-gray-50/50, th text-xs uppercase tracking-wider text-gray-500
tbody: divide-y divide-[#EAEAEA], hover:bg-gray-50/80
```

### Tab filter (encima de tabla)
```
border-b border-[#EAEAEA]
Tab activo: border-b-2 border-gray-900 text-gray-900
Tab inactivo: border-b-2 border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300
Badge contador: bg-gray-100 text-gray-600 rounded px-1.5 text-[10px]
```

### Progress bar
```
w-full bg-gray-100 rounded-full h-1.5
Fill activo: bg-gray-900
Fill completado: bg-green-500
Fill borrador: bg-gray-300
Fill alerta: bg-amber-400
```

### Botón primario
```
bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-3 py-1.5 rounded-md shadow-sm
```

### Breadcrumb header
```
text-sm: span gray-500 + ph-caret-right gray-400 text-[10px] + span font-medium gray-900
```

---

## Iconos

- Proyecto usa **Lucide React** (ya instalado)
- Si un mockup de Claude Design sugiere otra librería de íconos, mapear siempre al equivalente Lucide
- Tamaño estándar: `size={16}` en sidebar, `size={15}` en cards

---

## Lo que NO hacer

- No usar `bg-slate-800` para estado activo — usar `#24252A` con accent indigo
- No usar pills sin `ring-1 ring-inset` — se ven planos
- No usar `text-gray-400 uppercase` para labels de sección en sidebar — usar `text-gray-500`
- No centrar el contenido — todo left-aligned, alta densidad
- No usar sombras grandes o cards con mucho padding
- No agregar bordes redondeados grandes (`rounded-2xl`) — usar `rounded-xl` máximo

---

## Rediseño 2026-05 — contexto para Claude Design

### Estado del proyecto

Después de la auditoría de features del 2026-05-10 (ver [docs/feature-audit-2026-05.md](docs/feature-audit-2026-05.md)), el alcance de la app se redujo a un set focalizado de pantallas. Lo que queda — y lo que se rediseña — es esto:

| Orden | Pantalla | Ruta | Estado |
|---|---|---|---|
| 1 | **Seguimiento** (lista + tabla principal) | `/secop/seguimiento` | El core. Empezar acá. |
| 2 | **Panel de detalle del proceso** (sidebar derecho de Seguimiento) | (overlay) | Junto con #1. |
| 3 | Calendario SECOP | `/secop/calendario` | Después de Seguimiento. Backlog #16 ya tiene dirección. |
| 4 | Notificaciones (campana del sidebar + panel) | (overlay) | Componente compartido. |
| 5 | Actividad | `/activity` | Audit log para jefe. |
| 6 | Telegram settings | `/settings/telegram` | Config + bot link flow. |
| 7 | Admin | `/admin` | Útil pero menor. |
| 8 | Login | `/login` | Opcional, ya es simple. |

### Dirección creativa

**Abierta a explorar.** Las reglas técnicas de arriba (paleta, tipografía, componentes Tailwind) son ground truth — son el sistema vigente y siguen valiendo. Lo que NO está cerrado es el **carácter** del rediseño:

- ¿Profundizamos el Linear-inspired actual (más austero, más denso)?
- ¿Le metemos más calor / personalidad (estilo Notion, Height, Pitch)?
- ¿Vamos más a "power tool" denso (estilo Bloomberg, Datadog, Cursor)?

**Pedido a Claude Design**: en el primer mockup de Seguimiento, **explorar 2-3 direcciones distintas** sobre la misma estructura de información, manteniendo los tokens de color y tipografía del DESIGN.md. El usuario elige cuál profundizar después.

### Pantalla 1 — Brief de Seguimiento (`/secop/seguimiento`)

**Qué hace**: monitorea los procesos SECOP que el usuario sigue, muestra cambios detectados por el worker, gestiona las cuentas SECOP, y abre un panel de detalle por proceso con notas, cronograma e historial de cambios.

**Estructura actual** (client `SecopSeguimientoClient.tsx` + 3 sub-componentes):

```
┌─ Header (sticky, 56px) ───────────────────────────────────────┐
│ "Seguimiento SECOP" · KPIs inline (procesos, urgentes, cambios│
│ hoy) · Worker status pill · botón "Sincronizar cuentas"       │
├───────────────────────────────────────────────────────────────┤
│ Tabs: [Todos] [Urgentes (badge)] [Cambios recientes]          │
├───────────────────────────────────────────────────────────────┤
│ Tabla 50 filas (paginada):                                    │
│  - Proceso (numero + nombre custom + objeto truncado)         │
│  - Entidad                                                    │
│  - Estado (pill)                                              │
│  - Próximo deadline (fecha + countdown)                       │
│  - Última nota (preview de 1-2 líneas si hay)                 │
│  - Cuenta SECOP (de qué cuenta vino)                          │
│  - Toggle monitoring on/off                                   │
└───────────────────────────────────────────────────────────────┘
+ Panel "Cuentas SECOP" colapsable (jefe): estado por cuenta,
  semáforo de sesión, último login/sync, entidades descubiertas
+ Panel detalle (overlay derecho, al click en una fila):
  Notas del equipo, Cronograma de deadlines, Cambios recientes,
  Estado de monitoreo, Entidad, Objeto, Data grid, link SECOP
```

**Datos pre-cargados en server**: procesos paginados (50), 20 cambios recientes, cuentas, count de urgentes (deadline ≤48h), último worker log. Más una hidratación de "última nota por proceso" para preview en tabla.

### Pain points conocidos (input para el rediseño)

Estas son frustraciones reales identificadas hasta ahora — Claude Design debería resolverlas o proponer alternativas:

1. **Jerarquía del panel detalle es ambigua**. Cada operadora tiene un orden mental distinto de qué es prioritario (Notas? Cronograma? Cambios?). En 2026-05-07 movimos "Notas del equipo" al tope; ayudó a algunos pero forzó la decisión a todos. → El backlog tiene "Layout modular" (Fase A: colapsar/ocultar bloques persistido por usuario) como solución natural.

2. **KPIs del header son inline y se pierden**. Al usuario le cuesta dimensionar "cuántos procesos urgentes hay" de un vistazo. ¿Cards arriba? ¿Banner de alerta cuando hay urgentes? Explorar.

3. **Worker status no es claro**. Pill chico en header; no se entiende si está corriendo, hace cuánto, si hubo error. La data está (`secop_monitor_log`) pero la UI no la celebra.

4. **"Cuenta SECOP" en la tabla no agrega**. Para el jefe sí (saber de qué cuenta vino el proceso); para la operadora es ruido. Considerar columna oculta por rol.

5. **Toggle monitoring on/off como columna de tabla** se pierde en una fila densa. ¿Acción en hover? ¿Bulk action? ¿Toggle en panel detalle?

6. **El panel detalle es overlay derecho**, pero en mobile se vuelve drawer modal. La transición no es perfecta. Considerar layout responsive desde el mockup.

7. **Cambios recientes están en una tab separada** ("Cambios recientes" → muestra timeline). Algunos usuarios prefieren verlos integrados en la tabla principal (badge "1 cambio nuevo" en la fila del proceso).

### Lo que NO se rediseña en esta pantalla

- **Sidebar fija** (260px, dark) — definida y vigente
- **Tokens de color y tipografía** — ground truth, ver secciones de arriba
- **Componentes ya estabilizados**: status pills, alert panels, breadcrumbs (se reusan tal cual)
- **Lógica de datos**: las queries del server (`page.tsx`) y el flujo de fetch del client se mantienen — el rediseño es puramente de presentación

### Workflow esperado con Claude Design

1. Usuario carga `DESIGN.md` (este archivo) + 3-4 capturas del estado actual + este brief en Claude Design
2. Pide "rediseñar la pantalla Seguimiento, explorar 2-3 direcciones, mantener tokens del DESIGN.md"
3. Itera 2-5 vueltas sobre la dirección elegida
4. Exporta URL compartible
5. Trae la URL a Claude Code → port a React/Tailwind preservando lógica existente
