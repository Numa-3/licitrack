import { requireAuth } from '@/lib/admin'
import { NextRequest } from 'next/server'

/**
 * GET /api/secop/processes/[id]/cronograma
 * Returns the latest cronograma. Handles both contractual (page_scrape) and
 * precontractual (api_precontractual / scraper_bootstrap) snapshots.
 */

type ContractualEvent = {
  event_name: string
  start_date: string | null
  end_date: string | null
  remaining_days?: number | null
  status?: string | null
}

type PrecontractualEvent = {
  nombre: string
  fecha_inicio: string | null
  fecha_fin: string | null
  estado: string | null
}

type UiCronogramaEvent = {
  event_name: string
  start_date: string | null
  end_date: string | null
  remaining_days: number | null
  status: 'upcoming' | 'active' | 'past'
}

/**
 * Parse SECOP date format "DD/MM/YYYY HH:MM:SS AM/PM" to ISO string.
 *
 * SECOP siempre publica las horas en UTC-05:00 (Bogotá). Construimos el
 * string ISO con offset explícito para evitar que el runtime (Vercel = UTC)
 * interprete el string como local y termine corriendo todo 5 horas.
 */
function parseSecopDate(s: string | null): string | null {
  if (!s) return null
  // ISO already
  const asIso = new Date(s)
  if (!isNaN(asIso.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(s)) return asIso.toISOString()
  // DD/MM/YYYY H:MM:SS AM/PM
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/)
  if (!m) return null
  const [, d, mo, y, h, mi, se, ampm] = m
  let hour = parseInt(h, 10)
  if ((ampm || '').toUpperCase() === 'PM' && hour < 12) hour += 12
  if ((ampm || '').toUpperCase() === 'AM' && hour === 12) hour = 0
  const pad = (n: number | string) => String(n).padStart(2, '0')
  const isoBogota = `${y}-${pad(mo)}-${pad(d)}T${pad(hour)}:${pad(mi)}:${pad(se || 0)}-05:00`
  const date = new Date(isoBogota)
  return isNaN(date.getTime()) ? null : date.toISOString()
}

/** Derive status from end_date relative to now. */
function deriveStatus(endIso: string | null): 'upcoming' | 'active' | 'past' {
  if (!endIso) return 'upcoming'
  const end = new Date(endIso).getTime()
  if (isNaN(end)) return 'upcoming'
  return end < Date.now() ? 'past' : 'active'
}

function remainingDays(endIso: string | null): number | null {
  if (!endIso) return null
  const end = new Date(endIso).getTime()
  if (isNaN(end)) return null
  const diffMs = end - Date.now()
  return Math.round(diffMs / (24 * 60 * 60 * 1000))
}

/** Normalize contractual or precontractual event to UI shape. */
function normalize(raw: unknown): UiCronogramaEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  // Contractual shape (already close to UI)
  if ('event_name' in r) {
    const ev = r as ContractualEvent
    const endIso = parseSecopDate(ev.end_date) || ev.end_date
    return {
      event_name: ev.event_name,
      start_date: parseSecopDate(ev.start_date) || ev.start_date,
      end_date: endIso,
      remaining_days: remainingDays(endIso),
      status: (ev.status as 'upcoming' | 'active' | 'past') || deriveStatus(endIso),
    }
  }

  // Precontractual shape (nombre/fecha_inicio/fecha_fin)
  if ('nombre' in r) {
    const ev = r as PrecontractualEvent
    const startIso = parseSecopDate(ev.fecha_inicio)
    const endIso = parseSecopDate(ev.fecha_fin) || startIso
    return {
      event_name: ev.nombre,
      start_date: startIso,
      end_date: endIso,
      remaining_days: remainingDays(endIso),
      status: deriveStatus(endIso),
    }
  }

  return null
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth()
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { id } = await params

  // Precontractual: snapshot types 'api_precontractual' or 'scraper_bootstrap'.
  // Contractual: snapshot type 'page_scrape'.
  // Tomamos el snapshot más reciente de cualquier tipo.
  const { data: snapshot, error } = await supabase
    .from('secop_process_snapshots')
    .select('snapshot_json, captured_at, source_type')
    .eq('process_id', id)
    .in('source_type', ['page_scrape', 'api_precontractual', 'scraper_bootstrap'])
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !snapshot) {
    return Response.json({ cronograma: [], captured_at: null })
  }

  const snapshotJson = snapshot.snapshot_json as { cronograma?: unknown[] }
  const raw = snapshotJson?.cronograma || []
  const normalized = raw.map(normalize).filter((e): e is UiCronogramaEvent => e !== null)

  return Response.json({
    cronograma: normalized,
    captured_at: snapshot.captured_at,
  })
}
