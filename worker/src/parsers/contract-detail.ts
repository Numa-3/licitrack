import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'
import type {
  InfoGeneral,
  Condiciones,
  GarantiaEntry,
  GarantiaRequisitos,
  DocProveedor,
  DocContrato,
  Ejecucion,
  PagoEntry,
  Modificaciones,
  ModificacionEntry,
} from '../diff.js'

// ── Helpers ─────────────────────────────────────────────────

/**
 * Strip noise from a node before extracting text:
 *  - <script>/<style>: SECOP injects translator.loadFileAndTranslateElement(...) calls
 *    next to state spans. cheerio's .text() concatenates them with the visible text,
 *    producing e.g. "Pendiente translator.loadFileAndTranslateElement($('#spnStateSpn_0'),
 *    '.../CO.json_v639128464126706405')". The _v... cache-buster changes between scrapes
 *    and creates spurious diffs.
 *  - font.DateTimeDetail / .DateTimeDetail: timezone label "((UTC-05:00) Bogotá...)"
 *    appended to date spans. Whitespace inside this label varies between scrapes.
 */
function cleanText($el: cheerio.Cheerio<AnyNode>): string {
  const clone = $el.clone()
  clone.find('script, style, font.DateTimeDetail, .DateTimeDetail').remove()
  return clone.text().replace(/\s+/g, ' ').trim()
}

function text($: cheerio.CheerioAPI, selector: string): string | null {
  const el = $(selector).first()
  if (el.length === 0) return null
  const t = cleanText(el)
  return t || null
}

// ── Tab 1 (stepDiv_2): Información general ──────────────────

export function parseInfoGeneral(html: string): InfoGeneral {
  const $ = cheerio.load(html)

  return {
    estado: text($, '#spnContractState'),
    referencia: text($, '#txtContractReference1Gen'),
    descripcion: text($, '#txaContractDescription1Gen'),
    unique_id: text($, '#spnContractUniqueIdentifier'),
    version: text($, '#spnContractVersion'),
    valor: text($, '#cbxContractValue1Gen'),
    fecha_inicio: text($, '#dtmbContractStartDate_txt'),
    fecha_fin: text($, '#dtmbContractEndDate_txt'),
    fecha_liquidacion_inicio: text($, '#dtmbLiquidationStartDateValue_txt'),
    fecha_liquidacion_fin: text($, '#dtmbLiquidationEndDateValue_txt'),
    proveedor: text($, '#lblSupplierName'),
    aprobacion_comprador: text($, '#dtmbBuyerApprovalDateTimeBox_txt'),
    aprobacion_proveedor: text($, '#dtmbSupplierApprovalDateTimeBox_txt'),
  }
}

// ── Tab 2 (stepDiv_2): Condiciones + Garantías ──────────────

export function parseCondiciones(html: string): Condiciones {
  const $ = cheerio.load(html)

  return {
    renovable: text($, '#selBreakableContract')
      || text($, '#rdbgRenewableContract input:checked ~ label')
      || text($, '#rdbgBreakableContractValue input:checked + label'),
    fecha_renovacion: text($, '#dtmbContractBreakingDate_txt') || text($, '#dtmbContractRenewalDate_txt'),
    metodo_pago: text($, '#selPaymentMethod'),
    plazo_pago: text($, '#selPaymentTerm'),
    opciones_entrega: text($, '#selIncoterm'),
    fecha_limite_garantias: extractDateText($, '#dtmbDueDateToDeliverWarrantiesBox_txt'),
    fecha_entrega_garantias: extractDateText($, '#dtmbWarrantiesDeliveryDateBox_txt'),
    requisitos_garantias: parseRequisitosGarantias($),
    garantias: parseGarantias($),
  }
}

// extractDateText: kept as alias of `text` so existing callers stay readable.
// `text` already strips font.DateTimeDetail / scripts via cleanText.
const extractDateText = text

/**
 * Extract garantía requirements from "Configuración financiera - Garantías".
 * Returns null if the section is absent (some contracts don't require warranties).
 */
function parseRequisitosGarantias($: cheerio.CheerioAPI): GarantiaRequisitos | null {
  // Section is absent → no requirements to parse
  if ($('#fdsWarrantiesSectionP2Gen').length === 0) return null

  const radioCheckedLabel = (groupId: string): string | null => {
    const checked = $(`#${groupId} input:checked`).first()
    if (checked.length === 0) return null
    const forId = checked.attr('id')
    const label = forId ? $(`label[for="${forId}"]`).first().text().trim() : null
    return label || null
  }

  const isChecked = (id: string): boolean => {
    const el = $(`#${id}`).first()
    if (el.length === 0) return false
    return (el.attr('checked') === 'true' || el.attr('checked') === 'checked')
  }

  return {
    solicita_garantias: radioCheckedLabel('rdbgWarrantiesField'),
    seriedad_oferta: radioCheckedLabel('rdbgSeriousnessField'),
    seriedad_porcentaje: text($, '#nbxSeriousnessPercentageField'),
    cumplimiento: radioCheckedLabel('rdbgComplianceField'),
    cumplimiento_porcentaje: text($, '#nbxComplianceContractPercentageField'),
    anticipo_activo: isChecked('chkComplianceInvestmentCB'),
    anticipo_porcentaje: text($, '#nbxComplianceInvestPercentageField'),
    anticipo_vigencia_desde: extractDateText($, '#dtmbComplianceInvestStartDateBox_txt'),
    anticipo_vigencia_hasta: extractDateText($, '#dtmbComplianceInvestEndDateBox_txt'),
    cumplimiento_contrato_activo: isChecked('chkComplianceContractCB'),
    cumplimiento_contrato_vigencia_desde: extractDateText($, '#dtmbComplianceContractStartDateBox_txt'),
  }
}

/**
 * Parse the "Garantías del proveedor" grid.
 *
 * SECOP's grid has a stable structure:
 *   <table id="grdSupplierWarrantiesList_tbl">
 *     <tr id="grdSupplierWarrantiesList_header"> ...headers... </tr>
 *     <tr> [checkbox] | Id (CO1.WRT.xxx) | Justificación | Tipo | Valor | Emisor | Fecha fin | Estado | ... </tr>
 *
 * We use the grid id as the primary selector; as a safety net, we fall back
 * to any row whose first/second cell matches the warranty id pattern.
 */
function parseGarantias($: cheerio.CheerioAPI): GarantiaEntry[] {
  const entries: GarantiaEntry[] = []
  const seen = new Set<string>()

  const collectFrom = (rowSelector: string) => {
    $(rowSelector).each((_, row) => {
      const $row = $(row)
      // Skip header row
      if ($row.attr('id')?.endsWith('_header')) return
      const entry = tryParseWarrantyRow($, $row)
      if (entry && !seen.has(entry.garantia_id)) {
        seen.add(entry.garantia_id)
        entries.push(entry)
      }
    })
  }

  // Strategy 1: exact grid id confirmed from SECOP HTML sample
  collectFrom('#grdSupplierWarrantiesList_tbl tr')

  // Strategy 2 (fallback): any row whose cells contain CO1.WRT.xxx
  if (entries.length === 0) {
    collectFrom('tr')
  }

  return entries
}

function tryParseWarrantyRow($: cheerio.CheerioAPI, $row: cheerio.Cheerio<AnyNode>): GarantiaEntry | null {
  const cells = $row.find('td')
  // Need at least: checkbox + 7 data columns (Id, Justificación, Tipo, Valor, Emisor, Fecha fin, Estado) = 8
  if (cells.length < 8) return null

  // Find the cell that contains the warranty id (CO1.WRT.xxxxxxxx)
  let idCellIndex = -1
  let warrantyId: string | null = null
  for (let i = 0; i < cells.length; i++) {
    const cellText = $(cells[i]).text().trim()
    const match = cellText.match(/CO1\.WRT\.\d+/i)
    if (match) {
      warrantyId = match[0]
      idCellIndex = i
      break
    }
  }
  if (!warrantyId || idCellIndex === -1) return null

  const getCell = (offset: number): string | null => {
    const idx = idCellIndex + offset
    if (idx < 0 || idx >= cells.length) return null
    const v = cleanText($(cells[idx]))
    return v || null
  }

  return {
    garantia_id: warrantyId,
    justificacion: getCell(1),
    tipo: getCell(2),
    valor: getCell(3),
    emisor: getCell(4),
    fecha_fin: getCell(5),
    estado: getCell(6),
  }
}

// ── Tab 4 (stepDiv_5): Documentos del proveedor ─────────────

export function parseDocsProveedor(html: string): DocProveedor {
  const $ = cheerio.load(html)
  const names: string[] = []
  // Attestation documents use a grid with download links
  $('a[id*="lnkDownloadDocument"], a[id*="AttestationDocument"]').each((_, el) => {
    const name = $(el).text().trim()
    if (name) names.push(name)
  })
  return { document_names: names }
}

// ── Tab 5 (stepDiv_6): Documentos del contrato ──────────────

export function parseDocsContrato(html: string): DocContrato {
  const $ = cheerio.load(html)
  const documents: { name: string; description: string }[] = []

  // Contract documents — lnkDownloadDocument_N for filename, lblDescription_N for description
  for (let i = 0; i < 50; i++) {
    const name = text($, `#lnkDownloadDocument_${i}`)
    if (!name) break
    const desc = text($, `[id$="lblDescription_${i}"]`) || ''
    documents.push({ name, description: desc })
  }

  return { documents }
}

// ── Tab 7 (stepDiv_8): Ejecución del contrato ───────────────

export function parseEjecucion(html: string): Ejecucion {
  const $ = cheerio.load(html)

  // Payments — indexed spans: spnPaymentIdSpan_N, spnInvoiceNrSpan_N, etc.
  const pagos: PagoEntry[] = []
  for (let i = 0; i < 50; i++) {
    const pagoId = text($, `#spnPaymentIdSpan_${i}`)
    if (!pagoId) break
    pagos.push({
      pago_id: pagoId,
      factura_nr: text($, `#spnInvoiceNrSpan_${i}`),
      valor: text($, `#cbxInvoiceTotalValueBox_${i}`),
      estado: text($, `#spnInvoiceStateSpan_${i}`),
    })
  }

  // Execution documents — file names are in lblExecutionFileName_N labels
  const execution_docs: string[] = []
  for (let i = 0; i < 100; i++) {
    const name = text($, `#lblExecutionFileName_${i}`)
    if (!name) break
    execution_docs.push(name)
  }

  return { pagos, execution_docs }
}

// ── Tab 8 (stepDiv_9): Modificaciones del contrato ──────────

export function parseModificaciones(html: string): Modificaciones {
  const $ = cheerio.load(html)
  const entries: ModificacionEntry[] = []

  // grdContractVersionsGrid — rows: grdContractVersionsGrid_tr0, tr1...
  for (let i = 0; i < 50; i++) {
    const tipo = text($, `#spnModificationTypeSpan_${i}`)
    if (!tipo) break
    entries.push({
      tipo,
      estado: text($, `#spnModificationStatusValue_${i}`),
      fecha: text($, `#dtmbModificationDateValue_${i}_txt`),
      fecha_aprobacion: text($, `#dtmbModificationApprovalDateValue_${i}_txt`),
      version: text($, `#spnModificationVersionValue_${i}`),
    })
  }

  return { entries }
}
