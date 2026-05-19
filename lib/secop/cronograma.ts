/**
 * Helper compartido para extraer eventos de cronograma desde un snapshot
 * de SECOP. Maneja los dos shapes que existen en la DB:
 *
 *  - Precontractual (source_type = 'scraper_bootstrap' | 'api_precontractual'):
 *    `snapshot_json.cronograma = [{ nombre, fecha_inicio, fecha_fin, estado }]`
 *  - Contractual (source_type = 'page_scrape'):
 *    no hay `cronograma`; los eventos se sintetizan desde `info_general.*` y
 *    `condiciones.fecha_*`.
 */

export type CronogramaEvent = {
  event_name: string
  start_date: string | null
  end_date: string | null
  remaining_days: number | null
  status: 'upcoming' | 'active' | 'past'
}

type AnyJson = Record<string, unknown>

/**
 * Parsea fechas de SECOP a ISO. Acepta tanto ISO ya formateado como el formato
 * latino "DD/MM/YYYY HH:MM:SS AM/PM". SECOP publica horas en UTC-05:00 (Bogotá)
 * — construimos el ISO con offset explícito para que Vercel (UTC) no se desfase.
 */
export function parseSecopDate(s: string | null | undefined): string | null {
  if (!s) return null
  const trimmed = s.trim()

  // ISO ya formateado
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const asIso = new Date(trimmed)
    if (!isNaN(asIso.getTime())) return asIso.toISOString()
  }

  // DD/MM/YYYY HH:MM:SS AM/PM
  const m = trimmed.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?/)
  if (!m) return null
  const [, d, mo, y, h, mi, se, ampm] = m
  let hour = h ? parseInt(h, 10) : 0
  if ((ampm || '').toUpperCase() === 'PM' && hour < 12) hour += 12
  if ((ampm || '').toUpperCase() === 'AM' && hour === 12) hour = 0
  const pad = (n: number | string) => String(n).padStart(2, '0')
  const isoBogota = `${y}-${pad(mo)}-${pad(d)}T${pad(hour)}:${pad(mi || 0)}:${pad(se || 0)}-05:00`
  const date = new Date(isoBogota)
  return isNaN(date.getTime()) ? null : date.toISOString()
}

function deriveStatus(endIso: string | null): 'upcoming' | 'active' | 'past' {
  if (!endIso) return 'upcoming'
  const end = new Date(endIso).getTime()
  if (isNaN(end)) return 'upcoming'
  return end < Date.now() ? 'past' : 'upcoming'
}

function remainingDays(endIso: string | null): number | null {
  if (!endIso) return null
  const end = new Date(endIso).getTime()
  if (isNaN(end)) return null
  return Math.round((end - Date.now()) / (24 * 60 * 60 * 1000))
}

function normalizeContractualEvent(r: AnyJson): CronogramaEvent | null {
  const endRaw = r.end_date as string | null
  const startRaw = r.start_date as string | null
  const eventName = r.event_name as string
  if (!eventName) return null
  const endIso = parseSecopDate(endRaw) || endRaw
  return {
    event_name: eventName,
    start_date: parseSecopDate(startRaw) || startRaw,
    end_date: endIso,
    remaining_days: remainingDays(endIso),
    status: (r.status as 'upcoming' | 'active' | 'past') || deriveStatus(endIso),
  }
}

function normalizePrecontractualEvent(r: AnyJson): CronogramaEvent | null {
  const nombre = r.nombre as string
  if (!nombre) return null
  const startIso = parseSecopDate(r.fecha_inicio as string | null)
  const endIso = parseSecopDate(r.fecha_fin as string | null) || startIso
  return {
    event_name: nombre,
    start_date: startIso,
    end_date: endIso,
    remaining_days: remainingDays(endIso),
    status: deriveStatus(endIso),
  }
}

/**
 * Sintetiza eventos de cronograma para un snapshot contractual (page_scrape).
 * Estos snapshots no tienen `cronograma` — los eventos relevantes están
 * dispersos en `info_general.fecha_*` y `condiciones.fecha_*`.
 */
function synthesizeContractualEvents(snapshot: AnyJson): CronogramaEvent[] {
  const info = (snapshot.info_general as AnyJson | undefined) || {}
  const cond = (snapshot.condiciones as AnyJson | undefined) || {}

  const candidates: { name: string; raw: unknown }[] = [
    { name: 'Inicio del contrato', raw: info.fecha_inicio },
    { name: 'Finalización del contrato', raw: info.fecha_fin },
    { name: 'Inicio de liquidación', raw: info.fecha_liquidacion_inicio },
    { name: 'Fin de liquidación', raw: info.fecha_liquidacion_fin },
    { name: 'Entrega de garantías', raw: cond.fecha_entrega_garantias },
    { name: 'Plazo límite de garantías', raw: cond.fecha_limite_garantias },
  ]

  const out: CronogramaEvent[] = []
  for (const c of candidates) {
    if (!c.raw || typeof c.raw !== 'string') continue
    const iso = parseSecopDate(c.raw)
    if (!iso) continue
    out.push({
      event_name: c.name,
      start_date: iso,
      end_date: iso,
      remaining_days: remainingDays(iso),
      status: deriveStatus(iso),
    })
  }
  return out
}

/**
 * Parsea un snapshot_json a una lista normalizada de eventos de cronograma.
 * Detecta automáticamente si es contractual (sintetiza desde fecha_*) o
 * precontractual (lee cronograma[]).
 */
export function parseCronogramaFromSnapshot(snapshotJson: unknown): CronogramaEvent[] {
  if (!snapshotJson || typeof snapshotJson !== 'object') return []
  const json = snapshotJson as AnyJson

  // Precontractual: tiene array cronograma top-level
  const raw = json.cronograma
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .map(item => {
        if (!item || typeof item !== 'object') return null
        const r = item as AnyJson
        // Contractual-shaped item dentro de cronograma (poco común pero existe)
        if ('event_name' in r) return normalizeContractualEvent(r)
        if ('nombre' in r) return normalizePrecontractualEvent(r)
        return null
      })
      .filter((e): e is CronogramaEvent => e !== null)
  }

  // Contractual: sintetizar desde info_general + condiciones
  if (json.info_general || json.condiciones) {
    return synthesizeContractualEvents(json)
  }

  return []
}
