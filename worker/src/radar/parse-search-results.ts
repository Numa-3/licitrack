/**
 * Parser de la grilla de resultados del buscador público de SECOP II
 * (community.secop.gov.co/Public/Tendering/ContractNoticeManagement).
 *
 * La grilla es `grdResultList`. Cada fila tiene celdas con IDs estables
 * sufijados con el índice de fila `_N`:
 *   tdAuthorityNameCol       → entidad
 *   tdUniqueIdentifierCol    → referencia
 *   tdDescriptionCol         → descripción
 *   tdCurrentPhaseCol        → fase actual
 *   tdPublishDateCol         → fecha de publicación (con hora)
 *   tdDeadlineCol            → fecha de presentación de ofertas
 *   tdBasePriceColElements   → cuantía (precio base)
 *   tdContractNoticeStateCol → estado
 *   tdDetailColumn_lnkDetailLink_N → onclick con windowURL=...noticeUID=CO1.NTC.xxx
 *
 * Usamos cheerio (no page.evaluate) — mismo patrón que precontractual/scraper.ts.
 */
import * as cheerio from 'cheerio'

export type RadarSearchRow = {
  notice_uid: string | null
  entidad: string | null
  referencia: string | null
  descripcion: string | null
  fase: string | null
  fecha_publicacion: string | null   // "13/06/2026 5:32 PM"
  fecha_presentacion: string | null  // deadline de ofertas
  cuantia_raw: string | null         // "30.000.000 COP"
  cuantia_cop: number | null         // 30000000
  estado: string | null
}

function clean(s: string | undefined | null): string | null {
  if (!s) return null
  const v = s.replace(/\s+/g, ' ').trim()
  return v || null
}

/** "30.000.000 COP" / "$ 30.000.000" → 30000000 */
function parseCop(raw: string | null): number | null {
  if (!raw) return null
  const digits = raw.replace(/[^\d]/g, '')
  if (!digits) return null
  const n = Number(digits)
  return Number.isFinite(n) ? n : null
}

/** "13/06/2026 5:32 PM (UTC -5 horas) - 30.000.000 COP" → solo la fecha/hora */
function extractDateTime(raw: string | null): string | null {
  if (!raw) return null
  const m = raw.match(/(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s*[AP]M)/i)
  return m ? m[1] : null  // "-" (directa sin deadline) u otro → null
}

export function parseSearchResults(html: string): RadarSearchRow[] {
  const $ = cheerio.load(html)
  const out: RadarSearchRow[] = []

  // Una fila por cada span de referencia. El sufijo _N nos da el índice.
  $('[id*="spnMatchingResultReference_"]').each((_i, el) => {
    const id = $(el).attr('id') || ''
    const m = id.match(/_(\d+)$/)
    if (!m) return
    const n = m[1]

    const txtBySuffix = (suffix: string): string | null =>
      clean($(`[id$="${suffix}_${n}"]`).first().text())

    const referencia = txtBySuffix('spnMatchingResultReference')
    const entidad = txtBySuffix('spnMatchingResultAuthorityName')
    const descripcion = txtBySuffix('spnMatchingResultDescription')
    const fase = txtBySuffix('spnMatchingResultPhaseCode')
    const estado = txtBySuffix('spnMatchingResultContractNoticeState')

    // Fecha de publicación, fecha de cierre y cuantía: celdas con id sufijado _N.
    // (las fechas viven en spans VortalDateBox `..._N_txt`, no en spans spnMatchingResult)
    const fechaPubRaw = clean($(`[id$="dtmbRequestOnlinePublishingDate_${n}_txt"]`).first().text())
    const fechaDeadlineRaw = clean($(`[id$="dtmbDueDateForReceivingReplies_${n}_txt"]`).first().text())
    const cuantiaRaw = clean($(`[id$="cbxBasePriceValue_${n}"]`).first().text())

    // noticeUID: del onclick/href del link de detalle de esta fila.
    const $detail = $(`[id$="lnkDetailLink_${n}"], [name$="lnkDetailLink_${n}"]`).first()
    const onclick = `${$detail.attr('onclick') || ''} ${$detail.attr('href') || ''}`
    const um = onclick.match(/CO1\.NTC\.\d+/)
    const notice_uid = um ? um[0] : null

    out.push({
      notice_uid,
      entidad,
      referencia,
      descripcion,
      fase,
      fecha_publicacion: extractDateTime(fechaPubRaw),
      fecha_presentacion: extractDateTime(fechaDeadlineRaw),
      cuantia_raw: cuantiaRaw,
      cuantia_cop: parseCop(cuantiaRaw),
      estado,
    })
  })

  return out
}
