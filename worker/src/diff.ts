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

/** Tab 2: Condiciones */
export type Condiciones = {
  renovable: string | null
  fecha_renovacion: string | null
  metodo_pago: string | null
  plazo_pago: string | null
  opciones_entrega: string | null
}

/** Tab 3: Bienes y servicios — just track count */
export type BienesServicios = {
  item_count: number
}

/** Tab 4: Documentos del proveedor */
export type DocProveedor = {
  document_names: string[]
}

/** Tab 5: Documentos del contrato */
export type DocContrato = {
  documents: { name: string; description: string }[]
}

/** Tab 6: Información presupuestal */
export type Presupuestal = {
  cdp_balance: string | null
  vigencia_futura_balance: string | null
  budget_origin_total: string | null
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

/** Tab 9: Incumplimientos */
export type IncumplimientoEntry = {
  tipo: string | null
  estado: string | null
  fecha_acta: string | null
  fecha_fin: string | null
  valor: string | null
}

export type Incumplimientos = {
  entries: IncumplimientoEntry[]
}

/** Complete snapshot of all 9 tabs */
export type ProcessSnapshot = {
  info_general: InfoGeneral
  condiciones: Condiciones
  bienes_servicios: BienesServicios
  docs_proveedor: DocProveedor
  docs_contrato: DocContrato
  presupuestal: Presupuestal
  ejecucion: Ejecucion
  modificaciones: Modificaciones
  incumplimientos: Incumplimientos
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

export function hashSnapshot(snapshot: ProcessSnapshot): string {
  const relevant = {
    estado: snapshot.info_general.estado,
    valor: snapshot.info_general.valor,
    fecha_fin: snapshot.info_general.fecha_fin,
    version: snapshot.info_general.version,
    docs_count: snapshot.docs_contrato.documents.length,
    pagos_count: snapshot.ejecucion.pagos.length,
    pagos_last_estado: snapshot.ejecucion.pagos.at(-1)?.estado || null,
    mods_count: snapshot.modificaciones.entries.length,
    incumplimientos_count: snapshot.incumplimientos.entries.length,
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

  // 1. Estado del contrato
  if (before.info_general.estado !== after.info_general.estado) {
    changes.push({
      change_type: 'state_changed',
      priority: 'high',
      before_json: { estado: before.info_general.estado },
      after_json: { estado: after.info_general.estado },
      summary: `Estado cambió: ${before.info_general.estado || '?'} → ${after.info_general.estado || '?'}`,
    })
  }

  // 2. Valor del contrato
  if (before.info_general.valor !== after.info_general.valor) {
    changes.push({
      change_type: 'value_changed',
      priority: 'high',
      before_json: { valor: before.info_general.valor },
      after_json: { valor: after.info_general.valor },
      summary: `Valor cambió: ${before.info_general.valor || '?'} → ${after.info_general.valor || '?'}`,
    })
  }

  // 3. Fechas clave
  if (before.info_general.fecha_fin !== after.info_general.fecha_fin) {
    changes.push({
      change_type: 'end_date_changed',
      priority: 'high',
      before_json: { fecha_fin: before.info_general.fecha_fin },
      after_json: { fecha_fin: after.info_general.fecha_fin },
      summary: `Fecha fin cambió: ${before.info_general.fecha_fin || '?'} → ${after.info_general.fecha_fin || '?'}`,
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
  if (before.info_general.version !== after.info_general.version) {
    changes.push({
      change_type: 'version_changed',
      priority: 'high',
      before_json: { version: before.info_general.version },
      after_json: { version: after.info_general.version },
      summary: `Versión cambió: ${before.info_general.version || '?'} → ${after.info_general.version || '?'}`,
    })
  }

  // 6. New documents (Tab 5)
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

  // 7. New payments (Tab 7)
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

  // 8. Payment state changes (Tab 7)
  for (const afterPago of after.ejecucion.pagos) {
    const beforePago = before.ejecucion.pagos.find(p => p.pago_id === afterPago.pago_id)
    if (beforePago && beforePago.estado !== afterPago.estado) {
      changes.push({
        change_type: 'payment_state_changed',
        priority: 'medium',
        before_json: beforePago,
        after_json: afterPago,
        summary: `${afterPago.pago_id}: ${beforePago.estado || '?'} → ${afterPago.estado || '?'}`,
      })
    }
  }

  // 9. New modifications (Tab 8)
  if (after.modificaciones.entries.length > before.modificaciones.entries.length) {
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

  // 10. New incumplimientos (Tab 9)
  if (after.incumplimientos.entries.length > before.incumplimientos.entries.length) {
    const newInc = after.incumplimientos.entries.slice(before.incumplimientos.entries.length)
    for (const inc of newInc) {
      changes.push({
        change_type: 'new_incumplimiento',
        priority: 'high',
        before_json: null,
        after_json: inc,
        summary: `Nuevo incumplimiento: ${inc.tipo || 'Desconocido'} — ${inc.valor || '?'}`,
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
