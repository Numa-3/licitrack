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

// ── Tab 2 (stepDiv_2): Información general ──────────────────

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

// ── Tab 3 (stepDiv_3): Condiciones ──────────────────────────

export function parseCondiciones(html: string): Condiciones {
  const $ = cheerio.load(html)

  return {
    renovable: text($, '#selBreakableContract') || text($, '#rdbgBreakableContractValue input:checked + label'),
    fecha_renovacion: text($, '#dtmbContractBreakingDate_txt') || text($, '#dtmbContractRenewalDate_txt'),
    metodo_pago: text($, '#selPaymentMethod'),
    plazo_pago: text($, '#selPaymentTerm'),
    opciones_entrega: text($, '#selIncoterm'),
  }
}

// ── Tab 4 (stepDiv_4): Bienes y servicios ───────────────────

export function parseBienesServicios(html: string): BienesServicios {
  const $ = cheerio.load(html)
  // Count catalogue item rows — each has id like "incCatalogueItems..."
  const items = $('[id*="incCatalogueItems"]').filter((_, el) => {
    const id = $(el).attr('id') || ''
    return id.includes('questionDescription')
  })
  return { item_count: items.length }
}

// ── Tab 5 (stepDiv_5): Documentos del proveedor ─────────────

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

// ── Tab 6 (stepDiv_6): Documentos del contrato ──────────────

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

// ── Tab 7 (stepDiv_7): Información presupuestal ─────────────

export function parsePresupuestal(html: string): Presupuestal {
  const $ = cheerio.load(html)

  return {
    cdp_balance: text($, '#cbxCDPBalanceTextbox'),
    vigencia_futura_balance: text($, '#cbxVigenciaFuturaBalanceTextbox'),
    budget_origin_total: text($, '#cbxBudgetOriginTotalValue'),
  }
}

// ── Tab 8 (stepDiv_8): Ejecución del contrato ───────────────

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

// ── Tab 9 (stepDiv_9): Modificaciones del contrato ──────────

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

// ── Tab 10 (stepDiv_10): Incumplimientos ────────────────────

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
