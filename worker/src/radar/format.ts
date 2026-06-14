/**
 * Formato HTML de las alertas del radar para Telegram (parse_mode: HTML).
 */
import type { RadarSearchRow } from './parse-search-results.js'

/** Escapa los caracteres que Telegram interpreta como HTML. */
function esc(s: string | null | undefined): string {
  if (!s) return ''
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** URL pública (página completa) del proceso, clickeable desde Telegram. */
export function publicUrl(noticeUid: string): string {
  return `https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=${noticeUid}&isFromPublicArea=True&isModal=False`
}

function money(row: RadarSearchRow): string {
  if (row.cuantia_raw) return esc(row.cuantia_raw)
  if (row.cuantia_cop != null) return `$${row.cuantia_cop.toLocaleString('es-CO')} COP`
  return '—'
}

/** Alerta individual de un proceso nuevo. */
export function formatRadarAlert(region: string, row: RadarSearchRow): string {
  const url = row.notice_uid ? publicUrl(row.notice_uid) : null
  const lines = [
    `🛰️ <b>Nuevo proceso · ${esc(region)}</b>`,
    '',
    `🏛️ ${esc(row.entidad)}`,
    `📋 ${esc(row.referencia)}`,
    `📝 ${esc(row.descripcion)}`,
    `⚙️ ${esc(row.fase)}`,
    `💰 ${money(row)}`,
  ]
  if (row.fecha_publicacion) lines.push(`📅 Publicado: ${esc(row.fecha_publicacion)}`)
  if (row.fecha_presentacion) lines.push(`⏰ Cierre ofertas: ${esc(row.fecha_presentacion)}`)
  if (url) lines.push('', `🔗 <a href="${url}">Ver en SECOP II</a>`)
  return lines.join('\n')
}

/**
 * Digest: un solo mensaje con los N procesos más recientes.
 * Se usa en el primer run (semilla) y como red anti-flood si aparecen muchos
 * de golpe.
 */
export function formatRadarDigest(region: string, rows: RadarSearchRow[], total: number): string {
  const header =
    total > rows.length
      ? `🛰️ <b>Radar ${esc(region)}</b> — ${total} procesos. Muestro los ${rows.length} más recientes; de aquí en más te aviso uno por uno.`
      : `🛰️ <b>Radar ${esc(region)} activado</b> — últimos ${rows.length}. De aquí en más solo lo nuevo.`

  const items = rows.map((r, i) => {
    const url = r.notice_uid ? publicUrl(r.notice_uid) : null
    const titulo = url ? `<a href="${url}">${esc(r.referencia)}</a>` : esc(r.referencia)
    const desc = r.descripcion ? ` — ${esc(r.descripcion.slice(0, 90))}` : ''
    return `${i + 1}. 🏛️ ${esc(r.entidad)} · ${titulo}\n   💰 ${money(r)}${r.fecha_publicacion ? `  📅 ${esc(r.fecha_publicacion)}` : ''}${desc}`
  })

  return [header, '', ...items].join('\n')
}
