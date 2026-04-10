# LiciTrack — Design System

> Este archivo es leído automáticamente por AIDesigner en cada generación.
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
- En mockups AIDesigner usa Phosphor Icons — al implementar, mapear al equivalente Lucide
- Tamaño estándar: `size={16}` en sidebar, `size={15}` en cards

---

## Lo que NO hacer

- No usar `bg-slate-800` para estado activo — usar `#24252A` con accent indigo
- No usar pills sin `ring-1 ring-inset` — se ven planos
- No usar `text-gray-400 uppercase` para labels de sección en sidebar — usar `text-gray-500`
- No centrar el contenido — todo left-aligned, alta densidad
- No usar sombras grandes o cards con mucho padding
- No agregar bordes redondeados grandes (`rounded-2xl`) — usar `rounded-xl` máximo
