import { createHash } from 'crypto'

// ── Types ───────────────────────────────────────────────────

/** Tab 1: Información general */
export type InfoGeneral = {
  estado: string | null
  referencia: string | null
  descripcion: string | null
  unique_id: string | null
  version: string | null
  valor: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  fecha_liquidacion_inicio: string | null
  fecha_liquidacion_fin: string | null
  proveedor: string | null
  aprobacion_comprador: string | null
  aprobacion_proveedor: string | null
}

/** Tab 2: Condiciones — incluye tabla de garantías del proveedor */
export type GarantiaEntry = {
  garantia_id: string        // CO1.WRT.xxxxxxxx
  justificacion: string | null
  tipo: string | null
  valor: string | null
  emisor: string | null
  fecha_fin: string | null
  estado: string | null      // Borrador | Pendiente | Aceptada | Vencida | Cancelada
}

/**
 * Requisitos de garantías que la entidad pide al proveedor.
 * Capturado de la sección "Configuración financiera - Garantías".
 * Tracked para detectar si la entidad modifica los requisitos (ej: sube el %
 * de cumplimiento o cambia la fecha de vigencia exigida).
 */
export type GarantiaRequisitos = {
  solicita_garantias: string | null       // "Sí" / "No"
  seriedad_oferta: string | null          // "Sí" / "No"
  seriedad_porcentaje: string | null      // "10,00"
  cumplimiento: string | null             // "Sí" / "No"
  cumplimiento_porcentaje: string | null  // "10,000000"
  anticipo_activo: boolean                // Checkbox "Buen manejo y correcta inversión del anticipo"
  anticipo_porcentaje: string | null      // "100,00"
  anticipo_vigencia_desde: string | null  // "1/07/2025 12:00:00 PM"
  anticipo_vigencia_hasta: string | null  // "31/12/2025 11:59:00 PM"
  cumplimiento_contrato_activo: boolean   // Checkbox "Cumplimiento del contrato"
  cumplimiento_contrato_vigencia_desde: string | null
}

export type Condiciones = {
  renovable: string | null
  fecha_renovacion: string | null
  metodo_pago: string | null
  plazo_pago: string | null
  opciones_entrega: string | null
  fecha_limite_garantias: string | null     // "Fecha límite para entrega de garantías"
  fecha_entrega_garantias: string | null    // "Fecha de entrega de garantías" (cuando el proveedor ya las entregó)
  requisitos_garantias: GarantiaRequisitos | null
  garantias: GarantiaEntry[]
}

/** Tab 4: Documentos del proveedor */
export type DocProveedor = {
  document_names: string[]
}

/** Tab 5: Documentos del contrato */
export type DocContrato = {
  documents: { name: string; description: string }[]
}

/** Tab 7: Ejecución del contrato */
export type PagoEntry = {
  pago_id: string
  factura_nr: string | null
  valor: string | null
  estado: string | null
}

export type Ejecucion = {
  pagos: PagoEntry[]
  execution_docs: string[]
}

/** Tab 8: Modificaciones del contrato */
export type ModificacionEntry = {
  tipo: string | null
  estado: string | null
  fecha: string | null
  fecha_aprobacion: string | null
  version: string | null
}

export type Modificaciones = {
  entries: ModificacionEntry[]
}

/**
 * Complete snapshot of the contract's monitored tabs.
 * Tabs 3 (bienes), 6 (presupuestal), 9 (incumplimientos) removed — not needed.
 */
export type ProcessSnapshot = {
  info_general: InfoGeneral
  condiciones: Condiciones
  docs_proveedor: DocProveedor
  docs_contrato: DocContrato
  ejecucion: Ejecucion
  modificaciones: Modificaciones
  scraped_at: string
}

export type ChangeRecord = {
  change_type: string
  priority: 'low' | 'medium' | 'high'
  before_json: unknown
  after_json: unknown
  summary: string
}

// ── Hash ────────────────────────────────────────────────────

function stableHash(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 8)
}

export function hashSnapshot(snapshot: ProcessSnapshot): string {
  const relevant = {
    estado: snapshot.info_general.estado,
    valor: snapshot.info_general.valor,
    fecha_fin: snapshot.info_general.fecha_fin,
    version: snapshot.info_general.version,
    docs_proveedor_count: snapshot.docs_proveedor.document_names.length,
    docs_contrato_count: snapshot.docs_contrato.documents.length,
    pagos_count: snapshot.ejecucion.pagos.length,
    pagos_last_estado: snapshot.ejecucion.pagos.at(-1)?.estado || null,
    execution_docs_count: snapshot.ejecucion.execution_docs.length,
    mods_count: snapshot.modificaciones.entries.length,
    garantias_count: snapshot.condiciones.garantias.length,
    garantias_state_hash: stableHash(
      snapshot.condiciones.garantias.map(g => `${g.garantia_id}:${g.estado}`).join('|'),
    ),
  }
  return createHash('sha256').update(JSON.stringify(relevant)).digest('hex').slice(0, 16)
}

// ── Diff ────────────────────────────────────────────────────

export function diffSnapshots(
  before: ProcessSnapshot | null,
  after: ProcessSnapshot,
): ChangeRecord[] {
  if (!before) return [] // First snapshot — no changes to report

  const changes: ChangeRecord[] = []

  // Guard contra ruido de onboarding: si el valor "antes" no existía (null/empty),
  // el snapshot previo tenía el campo sin capturar — es un descubrimiento, no un cambio.
  // Solo reportamos cuando SÍ había valor previo Y ese valor cambió.

  // 1. Estado del contrato
  if (
    before.info_general.estado
    && before.info_general.estado !== after.info_general.estado
  ) {
    changes.push({
      change_type: 'state_changed',
      priority: 'high',
      before_json: { estado: before.info_general.estado },
      after_json: { estado: after.info_general.estado },
      summary: `Estado cambió: ${before.info_general.estado} → ${after.info_general.estado || '?'}`,
    })
  }

  // 2. Valor del contrato
  if (
    before.info_general.valor
    && before.info_general.valor !== after.info_general.valor
  ) {
    changes.push({
      change_type: 'value_changed',
      priority: 'high',
      before_json: { valor: before.info_general.valor },
      after_json: { valor: after.info_general.valor },
      summary: `Valor cambió: ${before.info_general.valor} → ${after.info_general.valor || '?'}`,
    })
  }

  // 3. Fechas clave
  if (
    before.info_general.fecha_fin
    && before.info_general.fecha_fin !== after.info_general.fecha_fin
  ) {
    changes.push({
      change_type: 'end_date_changed',
      priority: 'high',
      before_json: { fecha_fin: before.info_general.fecha_fin },
      after_json: { fecha_fin: after.info_general.fecha_fin },
      summary: `Fecha fin cambió: ${before.info_general.fecha_fin} → ${after.info_general.fecha_fin || '?'}`,
    })
  }

  // 4. Deadline approaching (< 48h) — fecha_fin
  if (after.info_general.fecha_fin) {
    const now = Date.now()
    const hours48 = 48 * 60 * 60 * 1000
    const deadline = new Date(after.info_general.fecha_fin).getTime()
    if (!isNaN(deadline) && deadline - now < hours48 && deadline > now) {
      const hoursLeft = Math.round((deadline - now) / (60 * 60 * 1000))
      changes.push({
        change_type: 'deadline_approaching',
        priority: 'high',
        before_json: null,
        after_json: { fecha_fin: after.info_general.fecha_fin },
        summary: `Contrato vence en ${hoursLeft} horas`,
      })
    }
  }

  // 5. Version changed (implies otrosi/modification was applied)
  if (
    before.info_general.version
    && before.info_general.version !== after.info_general.version
  ) {
    changes.push({
      change_type: 'version_changed',
      priority: 'high',
      before_json: { version: before.info_general.version },
      after_json: { version: after.info_general.version },
      summary: `Versión cambió: ${before.info_general.version} → ${after.info_general.version || '?'}`,
    })
  }

  // 6. New documents del contrato (Tab 5)
  // Skip onboarding: si antes no había docs capturados, no reportar todos como nuevos.
  if (before.docs_contrato.documents.length > 0) {
    const beforeDocNames = new Set(before.docs_contrato.documents.map(d => d.name))
    const newDocs = after.docs_contrato.documents.filter(d => !beforeDocNames.has(d.name))
    for (const doc of newDocs) {
      changes.push({
        change_type: 'new_document',
        priority: 'medium',
        before_json: null,
        after_json: doc,
        summary: `Nuevo documento: ${doc.name}`,
      })
    }
  }

  // 7. Documentos del proveedor (Tab 4) — add/remove
  // Skip onboarding: si antes estaba vacío, no reportar.
  if (before.docs_proveedor.document_names.length > 0) {
    const beforeProvDocs = new Set(before.docs_proveedor.document_names)
    const afterProvDocs = new Set(after.docs_proveedor.document_names)
    for (const name of afterProvDocs) {
      if (!beforeProvDocs.has(name)) {
        changes.push({
          change_type: 'provider_doc_added',
          priority: 'medium',
          before_json: null,
          after_json: { name },
          summary: `Documento del proveedor agregado: ${name}`,
        })
      }
    }
    for (const name of beforeProvDocs) {
      if (!afterProvDocs.has(name)) {
        changes.push({
          change_type: 'provider_doc_removed',
          priority: 'medium',
          before_json: { name },
          after_json: null,
          summary: `Documento del proveedor eliminado: ${name}`,
        })
      }
    }
  }

  // 8. Documentos de ejecución (Tab 7) — add only
  // Skip onboarding: si antes no había, no reportar.
  if (before.ejecucion.execution_docs.length > 0) {
    const beforeExecDocs = new Set(before.ejecucion.execution_docs)
    for (const name of after.ejecucion.execution_docs) {
      if (!beforeExecDocs.has(name)) {
        changes.push({
          change_type: 'execution_doc_added',
          priority: 'medium',
          before_json: null,
          after_json: { name },
          summary: `Nuevo documento de ejecución: ${name}`,
        })
      }
    }
  }

  // 9. New payments (Tab 7)
  // Skip onboarding: si antes no había pagos capturados, no reportar todos como nuevos.
  if (before.ejecucion.pagos.length > 0) {
    const beforePayIds = new Set(before.ejecucion.pagos.map(p => p.pago_id))
    const newPagos = after.ejecucion.pagos.filter(p => !beforePayIds.has(p.pago_id))
    for (const pago of newPagos) {
      changes.push({
        change_type: 'new_payment',
        priority: 'medium',
        before_json: null,
        after_json: pago,
        summary: `Nuevo pago: ${pago.pago_id} — ${pago.valor || '?'} — ${pago.estado || '?'}`,
      })
    }
  }

  // 10. Payment state changes (Tab 7)
  // Este NO requiere guard de onboarding: solo dispara cuando ambos snapshots tienen
  // el mismo pago_id con estado distinto (cambio real de estado del pago).
  for (const afterPago of after.ejecucion.pagos) {
    const beforePago = before.ejecucion.pagos.find(p => p.pago_id === afterPago.pago_id)
    if (beforePago && beforePago.estado && beforePago.estado !== afterPago.estado) {
      changes.push({
        change_type: 'payment_state_changed',
        priority: 'medium',
        before_json: beforePago,
        after_json: afterPago,
        summary: `${afterPago.pago_id}: ${beforePago.estado} → ${afterPago.estado || '?'}`,
      })
    }
  }

  // 11. New modifications (Tab 8)
  // Skip onboarding: si antes no había modificaciones capturadas, no reportar todas como nuevas.
  if (
    before.modificaciones.entries.length > 0
    && after.modificaciones.entries.length > before.modificaciones.entries.length
  ) {
    const newMods = after.modificaciones.entries.slice(before.modificaciones.entries.length)
    for (const mod of newMods) {
      changes.push({
        change_type: 'new_modification',
        priority: 'high',
        before_json: null,
        after_json: mod,
        summary: `Nueva modificación: ${mod.tipo || 'Desconocida'} — ${mod.estado || '?'}`,
      })
    }
  }

  // 12. Garantías del proveedor (Tab 2) — add / state change / vencida
  const beforeGarantias = new Map(before.condiciones.garantias.map(g => [g.garantia_id, g]))
  const afterGarantias = new Map(after.condiciones.garantias.map(g => [g.garantia_id, g]))

  // Nueva garantía — skip onboarding: si antes no había garantías, no reportar.
  if (before.condiciones.garantias.length > 0) {
    for (const [id, g] of afterGarantias) {
      if (!beforeGarantias.has(id)) {
        changes.push({
          change_type: 'warranty_added',
          priority: 'medium',
          before_json: null,
          after_json: g,
          summary: `Nueva garantía ${id} — ${g.tipo || 'tipo ?'} — Estado: ${g.estado || '?'}`,
        })
      }
    }
  }

  // Cambio de estado / vencida
  // Requiere que ambos snapshots tengan la póliza con estado previo real.
  for (const [id, afterG] of afterGarantias) {
    const beforeG = beforeGarantias.get(id)
    if (!beforeG || !beforeG.estado) continue

    if (beforeG.estado !== afterG.estado) {
      const isRejected = (afterG.estado || '').toLowerCase().includes('rechaz')
      const isAccepted = (afterG.estado || '').toLowerCase().includes('acept')
      const isVencida = (afterG.estado || '').toLowerCase().includes('venc')
      changes.push({
        change_type: isVencida
          ? 'warranty_expired'
          : isAccepted
            ? 'warranty_accepted'
            : isRejected
              ? 'warranty_rejected'
              : 'warranty_state_changed',
        priority: 'high',
        before_json: { garantia_id: id, estado: beforeG.estado },
        after_json: { garantia_id: id, estado: afterG.estado },
        summary: `Póliza ${id}: ${beforeG.estado || '?'} → ${afterG.estado || '?'}`,
      })
    }
  }

  return changes
}

// ── Next deadline ───────────────────────────────────────────

export function findNextDeadline(snapshot: ProcessSnapshot): {
  deadline: string | null
  label: string | null
} {
  const dates: { date: string; label: string }[] = []

  if (snapshot.info_general.fecha_fin) {
    dates.push({ date: snapshot.info_general.fecha_fin, label: 'Finalización del contrato' })
  }
  if (snapshot.info_general.fecha_liquidacion_fin) {
    dates.push({ date: snapshot.info_general.fecha_liquidacion_fin, label: 'Fin de liquidación' })
  }
  if (snapshot.condiciones.fecha_limite_garantias) {
    dates.push({ date: snapshot.condiciones.fecha_limite_garantias, label: 'Entrega de garantías' })
  }

  const now = Date.now()
  let nearest: { date: string; label: string } | null = null
  let nearestMs = Infinity

  for (const d of dates) {
    const ms = new Date(d.date).getTime()
    if (!isNaN(ms) && ms > now && ms < nearestMs) {
      nearestMs = ms
      nearest = d
    }
  }

  return {
    deadline: nearest?.date || null,
    label: nearest?.label || null,
  }
}
