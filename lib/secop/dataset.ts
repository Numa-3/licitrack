import { createHash } from 'crypto'

// ── SECOP II Dataset API ────────────────────────────────────
// Dataset: Procesos de contratación SECOP II (p6dx-8zbt)
// API: Socrata Open Data (SoQL)

const DATASET_URL = 'https://www.datos.gov.co/resource/p6dx-8zbt.json'
const APP_TOKEN = process.env.SECOP_APP_TOKEN || ''
const PAGE_SIZE = 1000

// ── Column mapping ──────────────────────────────────────────
// Exact column names from the SECOP II dataset (verified 2026-04-05).
// If Socrata renames columns, update this map — no other file needs to change.
const COL = {
  processId:       'id_del_proceso',
  reference:       'referencia_del_proceso',
  entity:          'entidad',
  entityNit:       'nit_entidad',
  object:          'nombre_del_procedimiento',
  description:     'descripci_n_del_procedimiento',
  modality:        'modalidad_de_contratacion',
  contractType:    'tipo_de_contrato',
  phase:           'fase',
  status:          'estado_del_procedimiento',
  statusSummary:   'estado_resumen',
  basePrice:       'precio_base',
  awardValue:      'valor_total_adjudicacion',
  publishedAt:     'fecha_de_publicacion_del',
  lastPublishedAt: 'fecha_de_ultima_publicaci',
  publicUrl:       'urlproceso',
  department:      'departamento_entidad',
  city:            'ciudad_entidad',
  duration:        'duracion',
  durationUnit:    'unidad_de_duracion',
} as const

// ── Types ───────────────────────────────────────────────────

type RawRecord = Record<string, unknown>

export type SecopProcess = {
  secop_process_id: string
  referencia_proceso: string | null
  entidad: string
  nit_entidad: string | null
  objeto: string
  descripcion: string | null
  modalidad: string | null
  tipo_contrato: string | null
  fase: string | null
  estado: string | null
  estado_resumen: string | null
  valor_estimado: number | null
  valor_adjudicacion: number | null
  fecha_publicacion: string | null
  fecha_ultima_pub: string | null
  url_publica: string | null
  departamento: string | null
  municipio: string | null
  duracion: string | null
  unidad_duracion: string | null
  dataset_hash: string
}

export type WatchRule = {
  keywords?: string[]
  exclude_keywords?: string[]
  entities?: string[]
  entity_nits?: string[]
  departments?: string[]
  municipalities?: string[]
  modalities?: string[]
  states?: string[]
  contract_types?: string[]
  min_value?: number | null
  max_value?: number | null
  // Filtros de fecha — se aplica sobre fecha_de_ultima_publicaci
  days_back?: number | null      // relativo: últimos N días (recomendado, se recalcula en cada run)
  published_after?: string | null // absoluto: fecha ISO "YYYY-MM-DD" (fallback si no hay days_back)
}

// ── Normalizer ──────────────────────────────────────────────

function str(val: unknown): string | null {
  if (val === undefined || val === null) return null
  const s = String(val).trim()
  if (s === '' || s === 'No Definido' || s === 'No Adjudicado') return null
  return s
}

function num(val: unknown): number | null {
  if (val === undefined || val === null) return null
  const n = Number(val)
  return isNaN(n) ? null : n
}

function extractUrl(val: unknown): string | null {
  if (!val) return null
  // urlproceso comes as { url: "https://..." } from Socrata
  if (typeof val === 'object' && val !== null && 'url' in val) {
    return String((val as { url: string }).url)
  }
  return String(val)
}

function hashRecord(raw: RawRecord): string {
  // Hash the fields that matter for change detection
  const relevant = [
    raw[COL.phase], raw[COL.status], raw[COL.statusSummary],
    raw[COL.basePrice], raw[COL.awardValue],
    raw[COL.lastPublishedAt],
  ]
  return createHash('sha256').update(JSON.stringify(relevant)).digest('hex').slice(0, 16)
}

export function normalizeRecord(raw: RawRecord): SecopProcess | null {
  const processId = str(raw[COL.processId])
  const entity = str(raw[COL.entity])
  const object = str(raw[COL.object])

  // These three are required
  if (!processId || !entity || !object) return null

  return {
    secop_process_id: processId,
    referencia_proceso: str(raw[COL.reference]),
    entidad: entity,
    nit_entidad: str(raw[COL.entityNit]),
    objeto: object,
    descripcion: str(raw[COL.description]),
    modalidad: str(raw[COL.modality]),
    tipo_contrato: str(raw[COL.contractType]),
    fase: str(raw[COL.phase]),
    estado: str(raw[COL.status]),
    estado_resumen: str(raw[COL.statusSummary]),
    valor_estimado: num(raw[COL.basePrice]),
    valor_adjudicacion: num(raw[COL.awardValue]),
    fecha_publicacion: str(raw[COL.publishedAt]),
    fecha_ultima_pub: str(raw[COL.lastPublishedAt]),
    url_publica: extractUrl(raw[COL.publicUrl]),
    departamento: str(raw[COL.department]),
    municipio: str(raw[COL.city]),
    duracion: str(raw[COL.duration]),
    unidad_duracion: str(raw[COL.durationUnit]),
    dataset_hash: hashRecord(raw),
  }
}

// ── SoQL query builder ──────────────────────────────────────

function buildWhereClause(rule: WatchRule): string {
  const conditions: string[] = []

  if (rule.keywords?.length) {
    const kw = rule.keywords
      .map(k => `upper(${COL.object}) like upper('%${escapeSoQL(k)}%')`)
      .join(' OR ')
    conditions.push(`(${kw})`)
  }

  if (rule.exclude_keywords?.length) {
    for (const k of rule.exclude_keywords) {
      conditions.push(`upper(${COL.object}) not like upper('%${escapeSoQL(k)}%')`)
    }
  }

  if (rule.entities?.length) {
    const vals = rule.entities.map(e => `'${escapeSoQL(e)}'`).join(',')
    conditions.push(`${COL.entity} in(${vals})`)
  }

  if (rule.entity_nits?.length) {
    const vals = rule.entity_nits.map(n => `'${escapeSoQL(n)}'`).join(',')
    conditions.push(`${COL.entityNit} in(${vals})`)
  }

  if (rule.departments?.length) {
    const vals = rule.departments.map(d => `'${escapeSoQL(d)}'`).join(',')
    conditions.push(`${COL.department} in(${vals})`)
  }

  if (rule.municipalities?.length) {
    const vals = rule.municipalities.map(m => `'${escapeSoQL(m)}'`).join(',')
    conditions.push(`${COL.city} in(${vals})`)
  }

  if (rule.modalities?.length) {
    const vals = rule.modalities.map(m => `'${escapeSoQL(m)}'`).join(',')
    conditions.push(`${COL.modality} in(${vals})`)
  }

  if (rule.states?.length) {
    const vals = rule.states.map(s => `'${escapeSoQL(s)}'`).join(',')
    conditions.push(`${COL.status} in(${vals})`)
  }

  if (rule.contract_types?.length) {
    const vals = rule.contract_types.map(t => `'${escapeSoQL(t)}'`).join(',')
    conditions.push(`${COL.contractType} in(${vals})`)
  }

  if (rule.min_value != null) {
    conditions.push(`${COL.basePrice} >= ${rule.min_value}`)
  }
  if (rule.max_value != null) {
    conditions.push(`${COL.basePrice} <= ${rule.max_value}`)
  }

  // Filtro de fecha — days_back tiene prioridad sobre published_after
  if (rule.days_back != null && rule.days_back > 0) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - rule.days_back)
    // Socrata floating_timestamp requires 'YYYY-MM-DDTHH:MM:SS.000' without timezone suffix
    const socrataDate = cutoff.toISOString().replace('Z', '').split('.')[0] + '.000'
    conditions.push(`${COL.lastPublishedAt} >= '${socrataDate}'`)
  } else if (rule.published_after) {
    conditions.push(`${COL.lastPublishedAt} >= '${rule.published_after}T00:00:00.000'`)
  }

  // Siempre excluir procesos cerrados — el radar es solo para oportunidades activas
  conditions.push(`estado_de_apertura_del_proceso = 'Abierto'`)

  return conditions.join(' AND ')
}

function escapeSoQL(val: string): string {
  return val.replace(/'/g, "''")
}

// ── Fetch ───────────────────────────────────────────────────

export async function fetchSecopProcesses(
  rule: WatchRule,
  maxRecords = 2000,
): Promise<SecopProcess[]> {
  const results: SecopProcess[] = []
  let offset = 0

  const where = buildWhereClause(rule)

  while (offset < maxRecords) {
    const limit = Math.min(PAGE_SIZE, maxRecords - offset)

    // Note: URLSearchParams encodes '$' as '%24', which breaks Socrata SoQL parameter names.
    // Build the query string manually to keep literal '$limit', '$where', etc.
    const parts: string[] = [
      `$limit=${limit}`,
      `$offset=${offset}`,
      `$order=${encodeURIComponent(COL.lastPublishedAt + ' DESC')}`,
    ]
    if (where) parts.push(`$where=${encodeURIComponent(where)}`)

    const headers: Record<string, string> = { Accept: 'application/json' }
    if (APP_TOKEN) headers['X-App-Token'] = APP_TOKEN

    const url = `${DATASET_URL}?${parts.join('&')}`
    const res = await fetch(url, { headers, next: { revalidate: 0 } })

    if (!res.ok) {
      throw new Error(`SECOP API error: ${res.status} ${res.statusText}`)
    }

    const rows: RawRecord[] = await res.json()
    if (rows.length === 0) break

    for (const raw of rows) {
      const normalized = normalizeRecord(raw)
      if (normalized) results.push(normalized)
    }

    // If we got fewer rows than the limit, we've reached the end
    if (rows.length < limit) break
    offset += limit
  }

  return results
}

// ── Deduplicate across multiple rules ───────────────────────

export function deduplicateProcesses(all: SecopProcess[]): SecopProcess[] {
  const seen = new Map<string, SecopProcess>()
  for (const p of all) {
    const existing = seen.get(p.secop_process_id)
    if (!existing) {
      seen.set(p.secop_process_id, p)
    }
  }
  return Array.from(seen.values())
}
