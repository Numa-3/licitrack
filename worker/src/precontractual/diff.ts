import { createHash } from 'crypto'
import type { PrecontractualSnapshot, PrecontractualChangeRecord } from './types.js'
import { cleanDateString } from '../utils/date-format.js'

/**
 * Hash used to detect whether anything we care about changed, so we can skip
 * the full diff when nothing is new.
 */
export function hashPrecontractualSnapshot(s: PrecontractualSnapshot): string {
  const relevant = {
    fase: s.fase_actual,
    estado: s.estado_actual,
    adjudicado: s.adjudicado,
    nit_adjudicado: s.proveedor_adjudicado?.nit || null,
    valor: s.precio_base,
    phases_count: s.phases.length,
    last_phase_id: s.phases.at(-1)?.id_del_proceso || null,
    last_responses: s.phases.at(-1)?.respuestas_al_procedimiento ?? 0,
    last_fecha_recepcion: s.phases.at(-1)?.fecha_recepcion || null,
    last_fecha_apertura: s.phases.at(-1)?.fecha_apertura_efectiva || null,
    cronograma_hash: s.cronograma
      ? s.cronograma.map(e => `${e.nombre}:${e.fecha_inicio || ''}:${e.fecha_fin || ''}:${e.estado || ''}`).join('|')
      : null,
  }
  return createHash('sha256').update(JSON.stringify(relevant)).digest('hex').slice(0, 16)
}

/**
 * Compute change records between two snapshots.
 *
 * @param ourNits  NITs of the user's own companies. Used to classify awards
 *                 as "to us" vs "to other".
 */
export function diffPrecontractualSnapshots(
  before: PrecontractualSnapshot | null,
  after: PrecontractualSnapshot,
  ourNits: Set<string> = new Set(),
): PrecontractualChangeRecord[] {
  if (!before) return [] // first snapshot

  const changes: PrecontractualChangeRecord[] = []

  // Guard doble contra ruido: reportar solo cuando AMBOS valores existen y difieren.
  // Esto previene falsos positivos por onboarding (before=null) y por scrape fallido
  // que devuelve valores nulos (after=null).

  // 1. Phase changed (new fase appeared)
  if (
    before.fase_actual
    && after.fase_actual
    && before.fase_actual !== after.fase_actual
  ) {
    changes.push({
      change_type: 'phase_changed',
      priority: 'high',
      before_json: { fase: before.fase_actual },
      after_json: { fase: after.fase_actual },
      summary: `Fase cambió: ${before.fase_actual} → ${after.fase_actual}`,
    })
  }

  // 2. Estado cambió
  if (
    before.estado_actual
    && after.estado_actual
    && before.estado_actual !== after.estado_actual
  ) {
    changes.push({
      change_type: 'process_state_changed',
      priority: 'high',
      before_json: { estado: before.estado_actual },
      after_json: { estado: after.estado_actual },
      summary: `Estado cambió: ${before.estado_actual} → ${after.estado_actual}`,
    })
  }

  // 3. Adjudicación (false → true)
  if (!before.adjudicado && after.adjudicado) {
    const nit = after.proveedor_adjudicado?.nit || ''
    const nombre = after.proveedor_adjudicado?.nombre || 'proveedor desconocido'
    const valor = after.proveedor_adjudicado?.valor || '?'

    if (ourNits.has(nit)) {
      changes.push({
        change_type: 'process_awarded_to_us',
        priority: 'high',
        before_json: null,
        after_json: after.proveedor_adjudicado,
        summary: `🎯 ADJUDICADO A NOSOTROS (${nombre}) — ${valor}. Cuando aparezca en tu cuenta SECOP podrás trackear el contrato.`,
      })
    } else if (nit) {
      changes.push({
        change_type: 'process_awarded_to_other',
        priority: 'high',
        before_json: null,
        after_json: after.proveedor_adjudicado,
        summary: `Adjudicado a ${nombre} (NIT ${nit}) — ${valor}`,
      })
    } else {
      changes.push({
        change_type: 'process_awarded',
        priority: 'high',
        before_json: null,
        after_json: after.proveedor_adjudicado,
        summary: 'Proceso adjudicado',
      })
    }
  }

  // 4. Declarado desierto
  const wasDesierto = (before.estado_actual || '').toLowerCase().includes('desierto')
  const isDesierto = (after.estado_actual || '').toLowerCase().includes('desierto')
  if (!wasDesierto && isDesierto) {
    changes.push({
      change_type: 'process_declared_void',
      priority: 'high',
      before_json: { estado: before.estado_actual },
      after_json: { estado: after.estado_actual },
      summary: 'Proceso declarado desierto',
    })
  }

  // 5. Valor cambió
  if (before.precio_base !== after.precio_base && before.precio_base && after.precio_base) {
    changes.push({
      change_type: 'process_value_changed',
      priority: 'medium',
      before_json: { precio_base: before.precio_base },
      after_json: { precio_base: after.precio_base },
      summary: `Precio base cambió: ${before.precio_base} → ${after.precio_base}`,
    })
  }

  // 6. Deadlines clave cambiaron (fecha_recepcion, fecha_apertura)
  const bLast = before.phases.at(-1)
  const aLast = after.phases.at(-1)
  if (bLast && aLast) {
    if (
      bLast.fecha_recepcion
      && aLast.fecha_recepcion
      && bLast.fecha_recepcion !== aLast.fecha_recepcion
    ) {
      changes.push({
        change_type: 'process_deadline_changed',
        priority: 'high',
        before_json: { fecha_recepcion: bLast.fecha_recepcion },
        after_json: { fecha_recepcion: aLast.fecha_recepcion },
        summary: `Fecha recepción: ${cleanDateString(bLast.fecha_recepcion)} → ${cleanDateString(aLast.fecha_recepcion)}`,
      })
    }
    if (
      bLast.fecha_apertura_efectiva
      && aLast.fecha_apertura_efectiva
      && bLast.fecha_apertura_efectiva !== aLast.fecha_apertura_efectiva
    ) {
      changes.push({
        change_type: 'process_deadline_changed',
        priority: 'high',
        before_json: { fecha_apertura_efectiva: bLast.fecha_apertura_efectiva },
        after_json: { fecha_apertura_efectiva: aLast.fecha_apertura_efectiva },
        summary: `Fecha apertura: ${cleanDateString(bLast.fecha_apertura_efectiva)} → ${cleanDateString(aLast.fecha_apertura_efectiva)}`,
      })
    }

    // 7. Nuevas respuestas/ofertas
    if (aLast.respuestas_al_procedimiento > bLast.respuestas_al_procedimiento) {
      changes.push({
        change_type: 'new_responses',
        priority: 'low',
        before_json: { respuestas: bLast.respuestas_al_procedimiento },
        after_json: { respuestas: aLast.respuestas_al_procedimiento },
        summary: `Nuevas respuestas al proceso: ${bLast.respuestas_al_procedimiento} → ${aLast.respuestas_al_procedimiento}`,
      })
    }
  }

  // 8. Cronograma con horas exactas (poblado por el scraper de OpportunityDetail)
  if (before.cronograma && after.cronograma) {
    const beforeMap = new Map(before.cronograma.map(e => [e.nombre, e]))
    const afterMap = new Map(after.cronograma.map(e => [e.nombre, e]))

    // Agregados
    for (const [nombre, ev] of afterMap) {
      if (!beforeMap.has(nombre)) {
        changes.push({
          change_type: 'cronograma_event_added',
          priority: 'medium',
          before_json: null,
          after_json: ev,
          summary: `Nuevo evento: ${nombre}${ev.fecha_fin ? ` — vence ${cleanDateString(ev.fecha_fin)}` : ''}`,
        })
      }
    }
    // Removidos
    for (const [nombre, ev] of beforeMap) {
      if (!afterMap.has(nombre)) {
        changes.push({
          change_type: 'cronograma_event_removed',
          priority: 'low',
          before_json: ev,
          after_json: null,
          summary: `Evento removido del cronograma: ${nombre}`,
        })
      }
    }
    // Cambios de fecha/hora
    for (const [nombre, aEv] of afterMap) {
      const bEv = beforeMap.get(nombre)
      if (!bEv) continue
      const startChanged = bEv.fecha_inicio !== aEv.fecha_inicio
      const endChanged = bEv.fecha_fin !== aEv.fecha_fin
      if (startChanged || endChanged) {
        const parts: string[] = []
        if (startChanged) parts.push(`inicio ${cleanDateString(bEv.fecha_inicio)} → ${cleanDateString(aEv.fecha_inicio)}`)
        if (endChanged) parts.push(`fin ${cleanDateString(bEv.fecha_fin)} → ${cleanDateString(aEv.fecha_fin)}`)
        changes.push({
          change_type: 'cronograma_event_changed',
          priority: 'high',
          before_json: bEv,
          after_json: aEv,
          summary: `${nombre}: ${parts.join(' · ')}`,
        })
      }
    }
  }

  return changes
}

/**
 * Find the next upcoming deadline from a snapshot.
 *
 * Priority order:
 *   1. Cronograma con horas exactas (captured via scraper.ts) — most precise
 *   2. API fechas (midnight-only, no hour)
 */
export function findNextDeadline(s: PrecontractualSnapshot): {
  deadline: string | null
  label: string | null
} {
  const now = Date.now()
  const candidates: { date: string; label: string; ms: number }[] = []

  // 1. Cronograma con horas (preferred)
  if (s.cronograma) {
    for (const ev of s.cronograma) {
      const candidate = ev.fecha_fin || ev.fecha_inicio
      if (!candidate) continue
      const ms = parseFlexibleDate(candidate)
      if (!isNaN(ms) && ms > now) {
        candidates.push({ date: candidate, label: ev.nombre, ms })
      }
    }
  }

  // 2. API fechas (fallback)
  const latest = s.phases.at(-1)
  if (latest) {
    if (latest.fecha_recepcion) {
      const ms = new Date(latest.fecha_recepcion).getTime()
      if (!isNaN(ms) && ms > now) candidates.push({ date: latest.fecha_recepcion, label: 'Recepción de ofertas', ms })
    }
    if (latest.fecha_apertura_respuesta) {
      const ms = new Date(latest.fecha_apertura_respuesta).getTime()
      if (!isNaN(ms) && ms > now) candidates.push({ date: latest.fecha_apertura_respuesta, label: 'Apertura de respuesta', ms })
    }
    if (latest.fecha_apertura_efectiva) {
      const ms = new Date(latest.fecha_apertura_efectiva).getTime()
      if (!isNaN(ms) && ms > now) candidates.push({ date: latest.fecha_apertura_efectiva, label: 'Apertura efectiva', ms })
    }
  }

  if (candidates.length === 0) return { deadline: null, label: null }
  candidates.sort((a, b) => a.ms - b.ms)
  // Convertir a ISO para que Postgres TIMESTAMPTZ acepte el valor. Si
  // devolviéramos el string crudo de SECOP ("15/04/2026 10:00:00 AM"),
  // el UPDATE completo fallaría con "invalid input syntax" y ningún campo
  // se escribiría.
  return { deadline: new Date(candidates[0].ms).toISOString(), label: candidates[0].label }
}

/**
 * Parse dates in the formats SECOP uses:
 *   - ISO 8601: "2025-12-02T00:00:00.000"
 *   - DD/MM/YYYY H:MM:SS AM/PM: "25/06/2025 2:00:00 AM"
 *
 * SECOP siempre publica las horas en UTC-05:00 (Bogotá). Construimos el ISO
 * con offset explícito para que sea independiente del TZ del worker host
 * (puede ser Windows local, Linux UTC, etc).
 */
function parseFlexibleDate(s: string): number {
  const iso = new Date(s).getTime()
  if (!isNaN(iso)) return iso
  const m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})[\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/)
  if (m) {
    const [, d, mo, y, h, mi, se, ampm] = m
    let hour = parseInt(h, 10)
    if ((ampm || '').toUpperCase() === 'PM' && hour < 12) hour += 12
    if ((ampm || '').toUpperCase() === 'AM' && hour === 12) hour = 0
    const pad = (n: number | string) => String(n).padStart(2, '0')
    const isoBogota = `${y}-${pad(mo)}-${pad(d)}T${pad(hour)}:${pad(mi)}:${pad(se || 0)}-05:00`
    return new Date(isoBogota).getTime()
  }
  return NaN
}
