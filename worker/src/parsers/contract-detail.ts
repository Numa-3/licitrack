import * as cheerio from 'cheerio'
import type {
  InfoGeneral,
  Condiciones,
  BienesServicios,
  DocProveedor,
  DocContrato,
  Presupuestal,
  Ejecucion,
  PagoEntry,
  Modificaciones,
  ModificacionEntry,
  Incumplimientos,
  IncumplimientoEntry,
} from '../diff.js'

// ── Helpers ─────────────────────────────────────────────────

function text($: cheerio.CheerioAPI, selector: string): string | null {
  const t = $(selector).first().text().trim()
  return t || null
}

function inputVal($: cheerio.CheerioAPI, selector: string): string | null {
  const v = $(selector).first().val()
  const s = typeof v === 'string' ? v.trim() : null
  return s || null
}

// ── Tab 1: Información general ──────────────────────────────

export function parseInfoGeneral(html: string): InfoGeneral {
  const $ = cheerio.load(html)

  return {
    estado: text($, '#spnContractState'),
    referencia: inputVal($, '#txtContractReference1Gen') || text($, '#spnContractReferenceGen'),
    descripcion: inputVal($, '#txaContractDescription1Gen') || text($, '#spnContractDescriptionGen'),
    unique_id: text($, '#spnContractUniqueIdentifierGen'),
    version: text($, '#spnContractVersionGen'),
    valor: text($, '#cbxContractValue1Gen'),
    fecha_inicio: inputVal($, '#dtmbContractStartDate_txt'),
    fecha_fin: inputVal($, '#dtmbContractEndDate_txt'),
    fecha_liquidacion_inicio: inputVal($, '#dtmbLiquidationStartDateValue_txt'),
    fecha_liquidacion_fin: inputVal($, '#dtmbLiquidationEndDateValue_txt'),
    proveedor: text($, '#lblSupplierName'),
    aprobacion_comprador: inputVal($, '#dtmbBuyerApprovalDateTimeBox_txt'),
    aprobacion_proveedor: inputVal($, '#dtmbSupplierApprovalDateTimeBox_txt'),
  }
}

// ── Tab 2: Condiciones ──────────────────────────────────────

export function parseCondiciones(html: string): Condiciones {
  const $ = cheerio.load(html)

  // These fields live in fdsFinancialAndDeliveryConditionsP2Gen table rows
  const renewableRow = $('[id*="RenewableContractRow"]')
  const renewalDateRow = $('[id*="ContractRenewalDateRow"]')
  const paymentMethodRow = $('[id*="PaymentMethodRow"]')
  const paymentTermRow = $('[id*="PaymentTermRow"]')
  const deliveryRow = $('[id*="DeliveryOptionsRow"]')

  return {
    renovable: renewableRow.find('span, select').first().text().trim() || null,
    fecha_renovacion: renewalDateRow.find('input[id*="_txt"]').val()?.toString().trim() || null,
    metodo_pago: paymentMethodRow.find('span').first().text().trim() || null,
    plazo_pago: paymentTermRow.find('span').first().text().trim() || null,
    opciones_entrega: deliveryRow.find('span').first().text().trim() || null,
  }
}

// ── Tab 3: Bienes y servicios ───────────────────────────────

export function parseBienesServicios(html: string): BienesServicios {
  const $ = cheerio.load(html)
  // Count catalogue item rows — each has id like "incCatalogueItems..."
  const items = $('[id*="incCatalogueItems"]').filter((_, el) => {
    const id = $(el).attr('id') || ''
    return id.includes('questionDescription')
  })
  return { item_count: items.length }
}

// ── Tab 4: Documentos del proveedor ─────────────────────────

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

// ── Tab 5: Documentos del contrato ──────────────────────────

export function parseDocsContrato(html: string): DocContrato {
  const $ = cheerio.load(html)
  const documents: { name: string; description: string }[] = []

  // grdContractDocument grid — rows are grdContractDocument_tr0, tr1, etc.
  // Each row has lnkDownloadDocument_N for filename
  const grid = $('#grdContractDocument_tbl')
  grid.find('tr[id*="grdContractDocument_tr"]').each((i, row) => {
    const $row = $(row)
    const name = $row.find(`#lnkDownloadDocument_${i}`).text().trim()
    const desc = $row.find(`td[id*="thDescriptionCol"]`).text().trim()
    if (name) {
      documents.push({ name, description: desc })
    }
  })

  // Fallback: find all download links if grid wasn't found
  if (documents.length === 0) {
    $('a[id^="lnkDownloadDocument_"]').each((_, el) => {
      const name = $(el).text().trim()
      if (name) documents.push({ name, description: '' })
    })
  }

  return { documents }
}

// ── Tab 6: Información presupuestal ─────────────────────────

export function parsePresupuestal(html: string): Presupuestal {
  const $ = cheerio.load(html)

  return {
    cdp_balance: text($, '#cbxCDPBalanceTextbox'),
    vigencia_futura_balance: text($, '#cbxVigenciaFuturaBalanceTextbox'),
    budget_origin_total: text($, '#cbxBudgetOriginTotalValue'),
  }
}

// ── Tab 7: Ejecución del contrato ───────────────────────────

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

  // Execution documents
  const execution_docs: string[] = []
  $('a[id*="lnkDownloadExecutionDocument"], #grdContractExecutionDocument_tbl a[id*="Download"]').each((_, el) => {
    const name = $(el).text().trim()
    if (name) execution_docs.push(name)
  })

  // Fallback: execution document filenames from grid
  if (execution_docs.length === 0) {
    $('#grdContractExecutionDocument_tbl td[id*="ExecutionFileNameCol"]').each((_, el) => {
      const name = $(el).text().trim()
      if (name) execution_docs.push(name)
    })
  }

  return { pagos, execution_docs }
}

// ── Tab 8: Modificaciones del contrato ──────────────────────

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
      fecha: inputVal($, `#dtmbModificationDateValue_${i}_txt`),
      fecha_aprobacion: inputVal($, `#dtmbModificationApprovalDateValue_${i}_txt`),
      version: text($, `#spnModificationVersionSpan_${i}`),
    })
  }

  return { entries }
}

// ── Tab 9: Incumplimientos ──────────────────────────────────

export function parseIncumplimientos(html: string): Incumplimientos {
  const $ = cheerio.load(html)
  const entries: IncumplimientoEntry[] = []

  // grdNonCompliancesGrid — columns: Type, ActDate, EndDate, State, Value
  const grid = $('#grdNonCompliancesGrid_tbl')
  grid.find('tr[id*="grdNonCompliancesGrid_tr"]').each((_, row) => {
    const $row = $(row)
    const cells = $row.find('td')
    if (cells.length < 4) return

    entries.push({
      tipo: $(cells[0]).text().trim() || null,
      fecha_acta: $(cells[1]).text().trim() || null,
      fecha_fin: $(cells[2]).text().trim() || null,
      estado: $(cells[3]).text().trim() || null,
      valor: cells.length > 4 ? $(cells[4]).text().trim() || null : null,
    })
  })

  // Fallback: try indexed spans
  if (entries.length === 0) {
    for (let i = 0; i < 50; i++) {
      const tipo = text($, `#spnNonCompliancesTypeSpan_${i}`)
      if (!tipo) break
      entries.push({
        tipo,
        estado: text($, `#spnNonCompliancesStateSpan_${i}`),
        fecha_acta: text($, `#spnNonCompliancesActDateSpan_${i}`),
        fecha_fin: text($, `#spnNonCompliancesEndDateSpan_${i}`),
        valor: text($, `#spnNonCompliancesValueSpan_${i}`),
      })
    }
  }

  return { entries }
}
