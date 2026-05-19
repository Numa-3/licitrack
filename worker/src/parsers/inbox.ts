/**
 * Parser de la bandeja de mensajes SECOP.
 *
 * URL: https://www.secop.gov.co/CO1Marketplace/Messages/MessageManagement/Index
 *
 * Estrategia: detectar la tabla por keywords en los headers (Desde, Tipo,
 * Asunto, Fecha, Estado) en vez de hardcodear selectores. Esto es resiliente
 * a IDs auto-generados y a pequeños cambios de SECOP.
 *
 * Si la detección falla retorna [] y el caller debe volcar el HTML a disco
 * para inspeccionar.
 */
import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'

export type InboxMessageRow = {
  desde: string | null
  tipo: string
  asunto: string
  fecha_raw: string            // texto crudo "19/05/2026 11:47 AM"
  fecha_iso: string | null     // parseado a ISO
  estado: string
  has_attachments: boolean
  detalle_url: string | null
  // El Ref puede estar en la fila como atributo, en el detalle, o derivable del asunto
  ref_proceso: string | null
}

const HEADER_HINTS = ['desde', 'tipo', 'asunto', 'fecha', 'estado'] as const
type HeaderKey = typeof HEADER_HINTS[number]

function norm(s: string | null | undefined): string {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Parsea "DD/MM/YYYY HH:MM AM/PM" → ISO UTC, asumiendo Bogotá (UTC-05:00).
 * SECOP siempre publica las horas en hora Bogotá sin offset.
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
 * Detecta el orden de columnas leyendo los `<th>` del header. Devuelve un map
 * { desde: 0, tipo: 1, ... } o null si la tabla no es la de mensajes.
 */
function detectColumns($: cheerio.CheerioAPI, $table: cheerio.Cheerio<AnyNode>): Record<HeaderKey, number> | null {
  const $headers = $table.find('thead th, thead td').length > 0
    ? $table.find('thead th, thead td')
    : $table.find('tr').first().find('th, td')

  if ($headers.length === 0) return null

  const map: Partial<Record<HeaderKey, number>> = {}
  $headers.each((idx, el) => {
    const text = norm($(el).text())
    for (const hint of HEADER_HINTS) {
      if (map[hint] === undefined && text.includes(hint)) {
        map[hint] = idx
      }
    }
  })

  // Al menos asunto + fecha deben estar para considerarla válida
  if (map.asunto === undefined || map.fecha === undefined) return null

  // Defaults razonables si faltan
  return {
    desde: map.desde ?? -1,
    tipo: map.tipo ?? -1,
    asunto: map.asunto,
    fecha: map.fecha,
    estado: map.estado ?? -1,
  }
}

/**
 * Encuentra la tabla del listado de mensajes en el DOM. Recorre todas las
 * tablas, identifica la que tiene headers con las keywords esperadas.
 */
function findMessageTable($: cheerio.CheerioAPI): { $table: cheerio.Cheerio<AnyNode>; cols: Record<HeaderKey, number> } | null {
  let result: { $table: cheerio.Cheerio<AnyNode>; cols: Record<HeaderKey, number> } | null = null
  $('table').each((_, el) => {
    if (result) return
    const $t = $(el)
    const cols = detectColumns($, $t)
    if (cols) {
      result = { $table: $t, cols }
      return false  // break
    }
  })
  return result
}

function extractCellText($: cheerio.CheerioAPI, $row: cheerio.Cheerio<AnyNode>, index: number): string {
  if (index < 0) return ''
  const $cells = $row.find('td')
  if (index >= $cells.length) return ''
  const $cell = $cells.eq(index)
  // Clonar para no modificar el DOM; remover scripts/styles/timezone labels
  const clone = $cell.clone()
  clone.find('script, style, font.DateTimeDetail, .DateTimeDetail').remove()
  return clone.text().replace(/\s+/g, ' ').trim()
}

function extractAttachments($: cheerio.CheerioAPI, $row: cheerio.Cheerio<AnyNode>): boolean {
  // Heurística: si alguna celda tiene un img/icon de paperclip, o un link con
  // "Archivo"/"Adjunto", asumimos que tiene archivos.
  const html = $row.html() || ''
  if (/paperclip|attach|adjunto|archivo/i.test(html)) return true
  // Algunas implementaciones usan font-awesome
  if (/fa-paperclip|glyphicon-paperclip/.test(html)) return true
  return false
}

function extractDetailUrl($: cheerio.CheerioAPI, $row: cheerio.Cheerio<AnyNode>): string | null {
  // Buscar un link "Detalle" o el primer link de la fila
  const detalleByText = $row.find('a').filter((_, a) => norm($(a).text()).includes('detalle')).first()
  if (detalleByText.length > 0) {
    const href = detalleByText.attr('href')
    if (href) return href
  }
  const firstLink = $row.find('a').first().attr('href')
  return firstLink || null
}

/**
 * Intenta extraer "Ref:" del proceso desde la fila. SECOP puede:
 *  - Incluirlo en el asunto como prefijo "[Ref: XXX]"
 *  - Incluirlo en un atributo data-* o en un title/tooltip
 *  - No incluirlo (entonces hay que abrir el detalle, que ya descartamos)
 *
 * Esta función intenta los dos primeros; si no aparece, devuelve null y el
 * caller maneja matching por otros medios (asunto fuzzy, sender + fecha).
 */
function extractRefProceso($: cheerio.CheerioAPI, $row: cheerio.Cheerio<AnyNode>): string | null {
  // 1) data-ref / data-process / data-referencia
  for (const attr of ['data-ref', 'data-process', 'data-referencia', 'data-process-ref']) {
    const v = $row.attr(attr) || $row.find(`[${attr}]`).first().attr(attr)
    if (v) return v.trim()
  }
  // 2) title o tooltip que mencione "Ref:"
  const titleText = $row.find('[title*="Ref"]').first().attr('title')
  if (titleText) {
    const m = titleText.match(/Ref[:\s]+([A-Za-z0-9._-]+)/i)
    if (m) return m[1]
  }
  // 3) Texto de cualquier celda con "Ref:"
  const fullText = $row.text()
  const m = fullText.match(/Ref[:\s]+([A-Za-z0-9._-]+)/i)
  if (m) return m[1]
  return null
}

export type ParseInboxResult = {
  rows: InboxMessageRow[]
  warnings: string[]
}

/**
 * Parsea la página de detalle de un mensaje (cuando lo abrimos para extraer
 * el "Ref:" del proceso). Solo se llama para mensajes nuevos — SECOP los va
 * a marcar como "Leído" tras esto, pero es aceptable porque justo llegaron.
 */
export type InboxDetailInfo = {
  ref_proceso: string | null
  message_uid: string | null   // CO1.MSG.X si lo encuentra
}

export function parseInboxDetail(html: string): InboxDetailInfo {
  const $ = cheerio.load(html)
  const fullText = $('body').text().replace(/\s+/g, ' ').trim()

  // 1) "Ref:" en cualquier parte del texto
  let ref_proceso: string | null = null
  const refMatch = fullText.match(/Ref(?:erencia)?[:\s]+([A-Za-z0-9._\-/]+)/i)
  if (refMatch) ref_proceso = refMatch[1]

  // 2) CO1.MSG.X
  let message_uid: string | null = null
  const msgMatch = fullText.match(/(CO1\.MSG\.\d+)/i)
  if (msgMatch) message_uid = msgMatch[1].toUpperCase()

  return { ref_proceso, message_uid }
}

export function parseInboxList(html: string): ParseInboxResult {
  const warnings: string[] = []
  const $ = cheerio.load(html)

  const table = findMessageTable($)
  if (!table) {
    warnings.push('No se encontró tabla de mensajes con headers Asunto/Fecha. Posible cambio de SECOP o página de error.')
    return { rows: [], warnings }
  }

  const { $table, cols } = table
  const $rows = $table.find('tbody tr').length > 0
    ? $table.find('tbody tr')
    : $table.find('tr').slice(1)  // skip header

  const rows: InboxMessageRow[] = []

  $rows.each((_, el) => {
    const $row = $(el)
    if ($row.find('td').length === 0) return  // skip header-like rows

    const asunto = extractCellText($, $row, cols.asunto)
    const fecha_raw = extractCellText($, $row, cols.fecha)
    if (!asunto || !fecha_raw) return  // fila vacía / separador

    const tipo = extractCellText($, $row, cols.tipo) || 'General'
    const desde = extractCellText($, $row, cols.desde) || null
    const estado = extractCellText($, $row, cols.estado) || 'Nuevo'
    const fecha_iso = parseSecopDateTime(fecha_raw)
    if (!fecha_iso) {
      warnings.push(`Fecha no parseable: "${fecha_raw}" (asunto="${asunto.slice(0, 50)}")`)
      return
    }

    rows.push({
      desde,
      tipo,
      asunto,
      fecha_raw,
      fecha_iso,
      estado,
      has_attachments: extractAttachments($, $row),
      detalle_url: extractDetailUrl($, $row),
      ref_proceso: extractRefProceso($, $row),
    })
  })

  return { rows, warnings }
}
