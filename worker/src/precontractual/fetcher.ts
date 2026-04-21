/**
 * Fetcher for the SECOP II Procesos de Contratación dataset.
 * Uses the public Socrata API — no captcha, no login.
 *
 * Docs: https://dev.socrata.com/foundry/www.datos.gov.co/p6dx-8zbt
 */
import type { PhaseSnapshot, PrecontractualSnapshot } from './types.js'

const BASE_URL = 'https://www.datos.gov.co/resource/p6dx-8zbt.json'
const USER_AGENT = 'LiciTrack/1.0 (+https://licitrack.app)'

type ApiRecord = {
  entidad?: string
  nit_entidad?: string
  departamento_entidad?: string
  ciudad_entidad?: string
  ordenentidad?: string
  codigo_pci?: string
  id_del_proceso?: string
  referencia_del_proceso?: string
  ppi?: string
  id_del_portafolio?: string
  nombre_del_procedimiento?: string
  descripci_n_del_procedimiento?: string
  fase?: string
  fecha_de_publicacion_del?: string
  fecha_de_ultima_publicaci?: string
  precio_base?: string
  modalidad_de_contratacion?: string
  justificaci_n_modalidad_de?: string
  duracion?: string
  unidad_de_duracion?: string
  fecha_de_recepcion_de?: string
  fecha_de_apertura_de_respuesta?: string
  fecha_de_apertura_efectiva?: string
  ciudad_de_la_unidad_de?: string
  nombre_de_la_unidad_de?: string
  proveedores_invitados?: string
  respuestas_al_procedimiento?: string
  respuestas_externas?: string
  conteo_de_respuestas_a_ofertas?: string
  proveedores_unicos_con?: string
  estado_del_procedimiento?: string
  id_estado_del_procedimiento?: string
  adjudicado?: string
  id_adjudicacion?: string
  codigoproveedor?: string
  valor_total_adjudicacion?: string
  nombre_del_adjudicador?: string
  nombre_del_proveedor?: string
  nit_del_proveedor_adjudicado?: string
  codigo_principal_de_categoria?: string
  estado_de_apertura_del_proceso?: string
  tipo_de_contrato?: string
  subtipo_de_contrato?: string
  urlproceso?: { url: string }
  estado_resumen?: string
}

/**
 * Extract the noticeUID from a SECOP OpportunityDetail URL.
 * Accepts both the public and internal URL formats.
 *
 * Input: https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=CO1.NTC.9200318&...
 * Output: "CO1.NTC.9200318"
 */
export function extractNoticeUid(url: string): string | null {
  const match = url.match(/noticeUID=([A-Z0-9.]+)/i)
  return match ? match[1] : null
}

function n(s: string | undefined | null): number {
  if (!s) return 0
  const v = parseInt(s, 10)
  return isNaN(v) ? 0 : v
}

function mapPhase(r: ApiRecord): PhaseSnapshot {
  return {
    id_del_proceso: r.id_del_proceso || '',
    id_del_portafolio: r.id_del_portafolio || null,
    referencia: r.referencia_del_proceso || null,
    fase: r.fase || null,
    estado_del_procedimiento: r.estado_del_procedimiento || null,
    estado_resumen: r.estado_resumen || null,
    estado_apertura: r.estado_de_apertura_del_proceso || null,
    fecha_publicacion: r.fecha_de_publicacion_del || null,
    fecha_ultima_publicacion: r.fecha_de_ultima_publicaci || null,
    fecha_recepcion: r.fecha_de_recepcion_de || null,
    fecha_apertura_respuesta: r.fecha_de_apertura_de_respuesta || null,
    fecha_apertura_efectiva: r.fecha_de_apertura_efectiva || null,
    respuestas_al_procedimiento: n(r.respuestas_al_procedimiento),
    respuestas_externas: n(r.respuestas_externas),
    conteo_respuestas_ofertas: n(r.conteo_de_respuestas_a_ofertas),
    proveedores_unicos: n(r.proveedores_unicos_con),
    adjudicado: (r.adjudicado || '').trim().toLowerCase() === 'si',
    id_adjudicacion: r.id_adjudicacion && r.id_adjudicacion !== 'No Adjudicado' ? r.id_adjudicacion : null,
    nombre_proveedor_adjudicado: r.nombre_del_proveedor && r.nombre_del_proveedor !== 'No Definido'
      ? r.nombre_del_proveedor : null,
    nit_proveedor_adjudicado: r.nit_del_proveedor_adjudicado && r.nit_del_proveedor_adjudicado !== 'No Definido'
      ? r.nit_del_proveedor_adjudicado : null,
    valor_adjudicacion: r.valor_total_adjudicacion || null,
  }
}

async function queryApi(whereClause: string, limit = 50): Promise<ApiRecord[]> {
  const url = `${BASE_URL}?$where=${encodeURIComponent(whereClause)}&$limit=${limit}`
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`SECOP API returned ${res.status}: ${await res.text().catch(() => '')}`)
  }
  return (await res.json()) as ApiRecord[]
}

/**
 * Fetch all phase records for the process identified by a noticeUID.
 *
 * Two-step lookup:
 *   1. Query by noticeUID (embedded in urlproceso.url) to find the matching row.
 *      This gives us id_del_portafolio.
 *   2. Query by id_del_portafolio to get ALL phase rows (observaciones, oferta,
 *      adjudicación, etc.) for the same process, because the noticeUID itself
 *      changes between phases.
 *
 * If step 1 returns a row with no portafolio, we return just that row.
 */
export async function fetchProcessPhases(noticeUid: string): Promise<ApiRecord[]> {
  if (!/^CO1\.NTC\.\d+$/.test(noticeUid)) {
    throw new Error(`Invalid noticeUID format: ${noticeUid}`)
  }
  const numericPart = noticeUid.replace(/^CO1\.NTC\./, '')

  // Query rápida por id_del_proceso (igualdad directa, usa índice → <1s).
  // CRÍTICO: los contadores de NTC y REQ son INDEPENDIENTES — pueden coincidir
  // numéricamente pero apuntar a procesos distintos. Por eso hay que VERIFICAR
  // después que el urlproceso.url del resultado mencione el NTC original; si
  // no, es un false positive y lo descartamos.
  let initial = await queryApi(`id_del_proceso='CO1.REQ.${numericPart}'`, 5)

  // Filtrar records cuyo URL no corresponde al NTC pedido (REQ match por azar).
  initial = initial.filter(r => (r.urlproceso?.url || '').toUpperCase().includes(noticeUid))

  // NOTA: No hay forma viable de buscar por NTC en este dataset (urlproceso
  // es Socrata URL type → no soporta LIKE). Si la query REQ no valida, el
  // caller debe invocar scraper-first con captcha.
  if (initial.length === 0) return []

  const portfolio = initial[0].id_del_portafolio
  if (!portfolio) return initial

  // Fetch all phases sharing the same portfolio
  const allPhases = await queryApi(`id_del_portafolio='${portfolio}'`, 50)
  return allPhases.length > 0 ? allPhases : initial
}

/**
 * Build a complete PrecontractualSnapshot from the dataset records.
 * Takes the latest phase as the "current" reference.
 */
export function buildSnapshot(noticeUid: string, records: ApiRecord[]): PrecontractualSnapshot {
  const publicUrl = records[0]?.urlproceso?.url
    || `https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=${noticeUid}&isFromPublicArea=True&isModal=False`

  // Sort phases ascending by fecha_publicacion
  const phases = records
    .map(mapPhase)
    .sort((a, b) => {
      const aMs = a.fecha_publicacion ? new Date(a.fecha_publicacion).getTime() : 0
      const bMs = b.fecha_publicacion ? new Date(b.fecha_publicacion).getTime() : 0
      return aMs - bMs
    })

  const latest = phases[phases.length - 1] || null
  const first = records[0]

  return {
    notice_uid: noticeUid,
    url_publica: publicUrl,
    entidad: first?.entidad || null,
    nit_entidad: first?.nit_entidad || null,
    departamento: first?.departamento_entidad || null,
    ciudad: first?.ciudad_entidad || null,
    orden_entidad: first?.ordenentidad || null,
    unidad_contratacion: first?.nombre_de_la_unidad_de || null,
    nombre_procedimiento: first?.nombre_del_procedimiento || null,
    descripcion: first?.descripci_n_del_procedimiento || null,
    modalidad: first?.modalidad_de_contratacion || null,
    justificacion_modalidad: first?.justificaci_n_modalidad_de || null,
    tipo_contrato: first?.tipo_de_contrato || null,
    categoria_principal: first?.codigo_principal_de_categoria || null,
    precio_base: first?.precio_base || null,
    fase_actual: latest?.fase || null,
    estado_actual: latest?.estado_del_procedimiento || null,
    adjudicado: phases.some(p => p.adjudicado),
    proveedor_adjudicado: (() => {
      const awarded = phases.find(p => p.adjudicado)
      if (!awarded) return null
      return {
        nombre: awarded.nombre_proveedor_adjudicado,
        nit: awarded.nit_proveedor_adjudicado,
        valor: awarded.valor_adjudicacion,
      }
    })(),
    phases,
    // Cronograma is populated by scraper.ts (captcha-protected page).
    // Left as null here so the monitor can preserve the last value.
    cronograma: null,
    cronograma_captured_at: null,
    scraped_at: new Date().toISOString(),
  }
}

/** Convenience: fetch + build in one call. */
export async function snapshotByNoticeUid(noticeUid: string): Promise<PrecontractualSnapshot> {
  const records = await fetchProcessPhases(noticeUid)
  if (records.length === 0) {
    throw new Error(`No records found in SECOP II API for noticeUID ${noticeUid}`)
  }
  return buildSnapshot(noticeUid, records)
}
