/**
 * Parser de la bandeja de mensajes SECOP.
 *
 * URL: https://www.secop.gov.co/CO1Marketplace/Messages/MessageManagement/Index
 *
 * El listado es una tabla con class="VortalGrid" e id que contiene
 * "grdResultList". Las celdas se identifican por sufijos estables en sus IDs
 * (_tdFromCol, _tdMessageTypeCol, _tdSubjectCol, _tdHasAttachmentsCol,
 * _tdMessageDateCol, _tdMessageStateColumn, _tdMessageDetailCol).
 *
 * Los IDs reales son larguísimos (200+ chars con todo el path del control),
 * por eso usamos selectors con [id*="..."] que matchean cualquier sufijo.
 */
import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'

export type InboxMessageRow = {
  desde: string | null
  tipo: string
  asunto: string
  fecha_raw: string            // "21/05/2026 12:08 PM"
  fecha_iso: string | null     // ISO con offset Bogotá UTC-05
  estado: string               // 'Nuevo' | 'Leídas' | 'Enviado' | ...
  has_attachments: boolean
  detalle_url: string | null
  message_uid: string | null   // id numérico interno de SECOP
  ref_proceso: string | null   // intento de extraer del asunto
}

export type InboxDetailInfo = {
  ref_proceso: string | null
  message_uid: string | null
}

export type ParseInboxResult = {
  rows: InboxMessageRow[]
  warnings: string[]
}

/**
 * Parsea "DD/MM/YYYY HH:MM AM/PM" → ISO UTC, asumiendo Bogotá (UTC-05:00).
 * SECOP siempre publica las horas en hora Bogotá.
 */
function parseSecopDateTime(s: string | null): string | null {
  if (!s) return null
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?$/)
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

/**
 * El href del link "Detalle" es javascript:void(0); el URL real vive en el
 * onclick: window.location.href = '...ProcedureMessageDisplay/Index' + '?' + 'id=' + '153833537' + ...
 * Devuelve { messageId, detalleUrl } o nulls si no parsea.
 */
function parseDetalleFromOnclick(onclick: string | undefined): { messageId: string | null; detalleUrl: string | null } {
  if (!onclick) return { messageId: null, detalleUrl: null }
  // Patrón: 'id=' + 'NUMERO'
  const m = onclick.match(/'id='\s*\+\s*'(\d+)'/)
  if (!m) return { messageId: null, detalleUrl: null }
  const id = m[1]
  return {
    messageId: id,
    detalleUrl: `https://www.secop.gov.co/CO1BusinessLine/Tendering/ProcedureMessageDisplay/Index?id=${id}&prevCtxUrl=https%3a%2f%2fwww.secop.gov.co%3a443%2fCO1Marketplace%2fMessages%2fMessageManagement%2fIndex&prevCtxLbl=Mensajes`,
  }
}

/**
 * Algunos subjects contienen el código de referencia del proceso embebido,
 * típicamente con formato XXXX-NN-XXX-2026-XXX. Extraemos por regex con
 * heurísticas conservadoras para no agarrar falsos positivos.
 *
 * IMPORTANTE: SECOP a veces inserta espacios espurios después de un guión
 * en el asunto (ej. "ICBF-MC-009- 276705-2026-AMAZ"). Normalizamos antes de
 * matchear, colapsando `-\s+` → `-`, para que el regex capture el Ref completo.
 */
function extractRefFromSubject(subject: string): string | null {
  if (!subject) return null
  // Normalizar espacios después de guiones (bug común del asunto SECOP).
  const normalized = subject.replace(/-\s+/g, '-')
  // Patrones comunes: ICBF-MC-008-..., SASI-AMZ-RA-..., CCENEG-097-01-..., CO1.AWD.X
  const patterns = [
    /\b([A-Z]{2,8}-[A-Z0-9]{1,8}-[A-Z0-9]{1,8}(?:-[A-Z0-9]{1,8})+)\b/,  // 4+ segmentos (con espacio normalizado)
    /\b([A-Z]{2,8}-[A-Z0-9]{1,8}-[A-Z0-9]{1,8})\b/,                      // 3 segmentos
    /\b(CO1\.[A-Z]+\.\d+)\b/,
    /\b(\d{3,5}-20\d{2})\b/,  // ej. 1769-2025
  ]
  for (const re of patterns) {
    const m = normalized.match(re)
    if (m) return m[1]
  }
  return null
}

/**
 * SECOP usa una convención asimétrica de IDs:
 *  - Las TDs de cada fila tienen IDs como `..._grdResultListtd_thFromCol`,
 *    `..._thSubjectCol`, `..._thMessageDateCol`, `..._thMessageStateColumn`.
 *    Sí: la TD también lleva prefijo `_th`, no `_td`. Eso engañaba al parser.
 *  - Los SPANs hijos dentro de algunas columnas SÍ usan `_td{Col}_spn...`
 *    (ej. `_tdSubjectCol_spnMatchingResultSubject_0`), pero la columna
 *    "Desde" tiene un SPAN con id `spnFromFriendlyname_N` — sin `_tdFromCol`.
 *
 * Estrategia: matchear la TD por `_th{Col}` (que cubre TODAS las columnas) y
 * extraer su texto. Las TH del header viven en otro `<tr>` que ya fue
 * filtrado por el regex `/_tr\d+$/`, así que no hay colisión.
 */
function cellText($row: cheerio.Cheerio<AnyNode>, idSuffix: string): string {
  // idSuffix llega como `_tdFromCol`, `_tdSubjectCol`, etc. — convertimos a `_th{Col}`
  const thSuffix = idSuffix.replace(/^_td/, '_th')
  const $td = $row.find(`td[id*="${thSuffix}"]`).first()
  if ($td.length === 0) return ''
  const clone = $td.clone()
  clone.find('script, style').remove()
  return clone.text().replace(/\s+/g, ' ').trim()
}

/**
 * Has attachments: la imagen de paperclip tiene src real cuando hay adjunto,
 * o style="display:none" cuando no. Detectamos por presencia de src útil.
 */
function hasAttachments($row: cheerio.Cheerio<AnyNode>): boolean {
  const $img = $row.find('img[id*="_imgHasAttachments"]').first()
  if ($img.length === 0) return false
  const style = ($img.attr('style') || '').toLowerCase()
  if (style.includes('display:none') || style.includes('display: none')) return false
  const src = $img.attr('src')
  return !!src
}

export function parseInboxList(html: string): ParseInboxResult {
  const warnings: string[] = []
  const $ = cheerio.load(html)

  // Identificación específica de la grilla SECOP — NO heurística genérica.
  // Class="VortalGrid" + id contiene "grdResultList" es único en esta página.
  let $table = $('table.VortalGrid[id*="grdResultList"]').first()
  if ($table.length === 0) {
    $table = $('table[id*="grdResultList_tbl"]').first()
  }
  if ($table.length === 0) {
    warnings.push('No se encontró la grilla de mensajes (table.VortalGrid con id grdResultList). HTML guardado.')
    return { rows: [], warnings }
  }

  // Filas de datos: cualquier <tr> que NO sea el header
  const $dataRows = $table.find('tr').filter((_, el) => {
    const id = $(el).attr('id') || ''
    return /_tr\d+$/.test(id)  // _tr0, _tr1, _tr2, ...
  })

  if ($dataRows.length === 0) {
    warnings.push('Grilla encontrada pero sin filas (_trN). Posible bandeja vacía o cargando.')
    return { rows: [], warnings }
  }

  const rows: InboxMessageRow[] = []

  $dataRows.each((_, el) => {
    const $row = $(el)

    const desde = cellText($row, '_tdFromCol') || null
    const tipo = cellText($row, '_tdMessageTypeCol') || 'General'
    const asunto = cellText($row, '_tdSubjectCol')
    const fecha_raw = cellText($row, '_tdMessageDateCol')
    const estado = cellText($row, '_tdMessageStateColumn') || 'Nuevo'

    if (!asunto || !fecha_raw) {
      warnings.push(`Fila incompleta: asunto="${asunto}" fecha="${fecha_raw}"`)
      return
    }

    const fecha_iso = parseSecopDateTime(fecha_raw)
    if (!fecha_iso) {
      warnings.push(`Fecha no parseable: "${fecha_raw}" (asunto="${asunto.slice(0, 50)}")`)
      return
    }

    const detalleAnchor = $row.find('a[id*="_lnkDetailLink"]').first()
    const { messageId, detalleUrl } = parseDetalleFromOnclick(detalleAnchor.attr('onclick'))

    rows.push({
      desde,
      tipo,
      asunto,
      fecha_raw,
      fecha_iso,
      estado,
      has_attachments: hasAttachments($row),
      detalle_url: detalleUrl,
      message_uid: messageId,
      ref_proceso: extractRefFromSubject(asunto),
    })
  })

  return { rows, warnings }
}

/**
 * Página del detalle de un mensaje (ProcedureMessageDisplay/Index?id=X).
 * Cuando lo abrimos, SECOP marca el mensaje como "Leído" — solo lo hacemos
 * para mensajes que YA estaban en estado "Nuevo" y necesitamos su Ref.
 */
export function parseInboxDetail(html: string): InboxDetailInfo {
  const $ = cheerio.load(html)
  const fullText = $('body').text().replace(/\s+/g, ' ').trim()

  let ref_proceso: string | null = null
  // En la página de detalle aparece típicamente como "Ref:" o "Referencia del proceso:"
  const refLabel = fullText.match(/(?:Ref(?:erencia)?\s+(?:del\s+proceso)?)\s*:?\s*([A-Z0-9._\-/]{4,})/i)
  if (refLabel) ref_proceso = refLabel[1]
  // Fallback: patrones embebidos
  if (!ref_proceso) ref_proceso = extractRefFromSubject(fullText.slice(0, 2000))

  let message_uid: string | null = null
  const msgMatch = fullText.match(/(CO1\.MSG\.\d+)/i)
  if (msgMatch) message_uid = msgMatch[1].toUpperCase()

  return { ref_proceso, message_uid }
}
