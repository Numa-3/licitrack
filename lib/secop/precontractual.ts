/**
 * Server-side helpers for precontractual processes.
 * Consumes the public SECOP II Procesos dataset (p6dx-8zbt) — no login, no captcha.
 *
 * This duplicates a thin slice of worker/src/precontractual/fetcher.ts so the
 * Next app doesn't have to import from /worker (different package, different
 * tsconfig). Keep the two in sync if the API contract changes.
 */

const BASE_URL = 'https://www.datos.gov.co/resource/p6dx-8zbt.json'
const USER_AGENT = 'LiciTrack/1.0 (+https://licitrack.app)'

export type ApiRecord = {
  entidad?: string
  nit_entidad?: string
  departamento_entidad?: string
  ciudad_entidad?: string
  ordenentidad?: string
  id_del_proceso?: string
  referencia_del_proceso?: string
  id_del_portafolio?: string
  nombre_del_procedimiento?: string
  descripci_n_del_procedimiento?: string
  fase?: string
  fecha_de_publicacion_del?: string
  precio_base?: string
  modalidad_de_contratacion?: string
  duracion?: string
  unidad_de_duracion?: string
  fecha_de_recepcion_de?: string
  fecha_de_apertura_de_respuesta?: string
  fecha_de_apertura_efectiva?: string
  estado_del_procedimiento?: string
  estado_resumen?: string
  adjudicado?: string
  id_adjudicacion?: string
  valor_total_adjudicacion?: string
  nombre_del_proveedor?: string
  nit_del_proveedor_adjudicado?: string
  tipo_de_contrato?: string
  urlproceso?: { url: string }
  estado_de_apertura_del_proceso?: string
}

export function extractNoticeUid(input: string): string | null {
  const match = input.match(/(CO1\.NTC\.\d+)/i)
  return match ? match[1].toUpperCase() : null
}

async function queryApi(whereClause: string, limit = 50, timeoutMs = 8_000): Promise<ApiRecord[]> {
  const url = `${BASE_URL}?$where=${encodeURIComponent(whereClause)}&$limit=${limit}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      cache: 'no-store',
      signal: ctrl.signal,
    })
    if (!res.ok) {
      throw new Error(`SECOP API returned ${res.status}`)
    }
    return (await res.json()) as ApiRecord[]
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetch all phase records for a given noticeUID.
 * Two-step lookup: first by notice URL, then by id_del_portafolio to get all phases.
 */
export async function fetchProcessPhases(noticeUid: string): Promise<ApiRecord[]> {
  if (!/^CO1\.NTC\.\d+$/.test(noticeUid)) {
    throw new Error(`Formato inválido de noticeUID: ${noticeUid}`)
  }
  const numericPart = noticeUid.replace(/^CO1\.NTC\./, '')

  // Query rápida por id_del_proceso=CO1.REQ.X (tiene índice, <1s).
  // CRÍTICO: los contadores de NTC y REQ son INDEPENDIENTES — pueden coincidir
  // numéricamente pero apuntar a procesos distintos. Por eso hay que VERIFICAR
  // después que el urlproceso.url del resultado mencione el NTC original; si
  // no, son datos de otro proceso y los descartamos.
  let initial = await queryApi(`id_del_proceso='CO1.REQ.${numericPart}'`, 5, 6_000)

  // Filtrar records cuyo URL no corresponde al NTC pedido (REQ match por azar).
  initial = initial.filter(r => (r.urlproceso?.url || '').toUpperCase().includes(noticeUid))

  // NOTA: No hay forma viable de buscar por NTC en este dataset. La columna
  // urlproceso es Socrata URL type → no soporta LIKE ni upper/cast → todo
  // fallback por URL devuelve type-mismatch. $q (full-text) tampoco indexa
  // urlproceso. Por diseño, si la query REQ no valida, devolvemos [] para
  // que el caller arranque scraper-first (captcha + scrape).
  if (initial.length === 0) return []
  const portfolio = initial[0].id_del_portafolio
  if (!portfolio) return initial
  const all = await queryApi(`id_del_portafolio='${portfolio}'`, 50)
  return all.length > 0 ? all : initial
}

/** Build a compact summary of a precontractual process for the app layer. */
export function summarizeProcess(noticeUid: string, records: ApiRecord[]) {
  if (records.length === 0) return null

  // Sort phases ascending by publication date
  const phases = [...records].sort((a, b) => {
    const aMs = a.fecha_de_publicacion_del ? new Date(a.fecha_de_publicacion_del).getTime() : 0
    const bMs = b.fecha_de_publicacion_del ? new Date(b.fecha_de_publicacion_del).getTime() : 0
    return aMs - bMs
  })

  const first = phases[0]
  const latest = phases[phases.length - 1]
  const awarded = phases.find(r => (r.adjudicado || '').toLowerCase() === 'si')

  const publicUrl = first.urlproceso?.url
    || `https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=${noticeUid}&isFromPublicArea=True&isModal=False`

  return {
    notice_uid: noticeUid,
    url_publica: publicUrl,
    entidad: first.entidad || null,
    nit_entidad: first.nit_entidad || null,
    departamento: first.departamento_entidad || null,
    municipio: first.ciudad_entidad || null,
    nombre_procedimiento: first.nombre_del_procedimiento || null,
    descripcion: first.descripci_n_del_procedimiento || null,
    modalidad: first.modalidad_de_contratacion || null,
    tipo_contrato: first.tipo_de_contrato || null,
    precio_base: first.precio_base || null,
    duracion: first.duracion || null,
    unidad_duracion: first.unidad_de_duracion || null,
    id_portafolio: first.id_del_portafolio || null,
    fase_actual: latest.fase || null,
    estado_actual: latest.estado_del_procedimiento || null,
    estado_resumen: latest.estado_resumen || null,
    fecha_publicacion: first.fecha_de_publicacion_del || null,
    fecha_ultima_pub: latest.fecha_de_publicacion_del || null,
    adjudicado: !!awarded,
    proveedor_adjudicado: awarded ? {
      nombre: awarded.nombre_del_proveedor !== 'No Definido' ? awarded.nombre_del_proveedor || null : null,
      nit: awarded.nit_del_proveedor_adjudicado !== 'No Definido' ? awarded.nit_del_proveedor_adjudicado || null : null,
      valor: awarded.valor_total_adjudicacion || null,
    } : null,
    phases_count: phases.length,
  }
}
