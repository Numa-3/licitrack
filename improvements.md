# LiciTrack — Mejoras a features existentes

> Ajustes, pulido y optimizaciones sobre lo que ya está construido.

---

## Formato

```
### [Nombre de la mejora]
- **Feature afectada:** qué parte del sistema se mejora
- **Situación actual:** cómo funciona hoy
- **Mejora propuesta:** qué cambiaría y cómo
- **Por qué:** qué problema resuelve o qué mejora la experiencia
- **Prioridad:** alta / media / baja
```

---

<!-- Agregá mejoras abajo de esta línea -->

---

### Ítems sin proveedor en detalle de contrato

- **Feature afectada:** Vista de detalle de contrato — sección de ítems.
- **Situación actual:** No hay indicación visual cuando un ítem no tiene proveedor asignado. Hay que revisar uno por uno.
- **Mejora propuesta:**
  - Banner al tope de la lista de ítems cuando hay ítems sin proveedor: *"X ítems sin proveedor asignado"*.
  - Cada ítem sin `supplier_id` se resalta en rojo en la lista (fila o borde).
- **Por qué:** Permite identificar de un vistazo qué falta gestionar sin tener que recorrer la lista completa.
- **Prioridad:** media

---

### Dashboard — métricas y resumen ejecutivo

- **Feature afectada:** Dashboard principal.
- **Situación actual:** El dashboard muestra contratos pero tiene poca información de valor operativo.
- **Mejora propuesta:** Agregar una sección de métricas encima de la lista de contratos con tarjetas resumen:
  - Contratos activos / completados / vencidos.
  - Total de ítems pendientes vs completados.
  - Gasto total del período vs presupuesto.
  - Proveedores activos.
- **Por qué:** Permite tener una vista ejecutiva del estado general sin navegar a cada contrato.
- **Prioridad:** baja (requiere datos suficientes para que sea útil)

---

### Edición de perfil de usuario

- **Feature afectada:** Sistema de cuentas / autenticación (admin y colaboradores).
- **Situación actual:** Los usuarios no pueden modificar su información personal desde la app.
- **Mejora propuesta:** Agregar una página `/perfil` accesible para cualquier usuario autenticado (admin y colaboradores) donde puedan editar:
  - Nombre de usuario
  - Correo electrónico
  - Contraseña (con campo de contraseña actual para verificación + nueva + confirmar)
  - Sexo
  - Imagen de perfil (upload de foto, con preview antes de guardar)
- **Por qué:** Mejora la experiencia y permite mantener datos actualizados sin depender del admin.
- **Prioridad:** media

#### Pantallas / flujo

```
/perfil
  ├── Avatar actual + botón "Cambiar foto" → upload de imagen
  ├── Campos editables: nombre, correo, sexo
  ├── Sección separada "Cambiar contraseña"
  │     ├── Contraseña actual
  │     ├── Nueva contraseña
  │     └── Confirmar nueva contraseña
  └── Botón "Guardar cambios"
```

#### Consideraciones técnicas
- La imagen de perfil se almacena en storage (ej: Supabase Storage) y se guarda la URL en el perfil del usuario.
- El cambio de correo debe requerir re-verificación si el proveedor de auth lo soporta.
- El cambio de contraseña valida la contraseña actual antes de actualizar.
- Aplicar los mismos campos y restricciones tanto para admin como para colaboradores.
