import * as cheerio from 'cheerio'

/**
 * A company the logged-in user belongs to as a supplier.
 * Parsed from the #companiesSelector dropdown on the contracts management page.
 */
export type CompanyEntry = {
  name: string   // full company name (from title attribute)
  value: string  // numeric company code used in SwitchCompany requests
}

/**
 * A contract discovered from the "Administración de contratos" page.
 * These are contracts where the user's company is the SUPPLIER (proveedor).
 *
 * Columns: Id del contrato | Número del Contrato | Entidad Estatal |
 *          Tipo de entidad | Fecha de firma | Fecha de finalización |
 *          Facturación de la entidad | Valor total de la oferta | Estado | Detalle
 */
export type DiscoveredProcess = {
  secop_process_id: string   // "Id del contrato" — internal SECOP numeric ID (e.g. "7784380")
  referencia: string | null  // "Número del Contrato" (e.g. "CO1.PCCNTR.8263723" or "1769-2025")
  ntc_id: string | null      // always null for contracts (NTC is for procurement notices)
  entidad: string | null     // "Entidad Estatal" (e.g. "GOBERNACION DEL AMAZONAS")
  objeto: string | null      // contract description (needs detail page; null at discovery time)
  estado: string | null      // "Estado" (e.g. "En ejecución", "Firmado")
  end_date: string | null    // ISO string parsed from "Fecha de finalización"
  valor: number | null       // numeric value in COP (from "Valor total de la oferta")
  url: string | null         // full URL to contract detail page
}

/**
 * Parse the company selector from the SECOP contracts management page.
 * The user sees a <select id="companiesSelector"> after login.
 *
 * Example: <option title="AMAZONAS DUTTY FREE.COM SAS" value="728226325">
 */
export function parseCompanyList(html: string): CompanyEntry[] {
  const $ = cheerio.load(html)
  const companies: CompanyEntry[] = []

  $('#companiesSelector option').each((_, el) => {
    const $el = $(el)
    const value = $el.attr('value')
    const name = $el.attr('title') || $el.text().trim()
    if (value && name) {
      companies.push({ name, value })
    }
  })

  return companies
}

/**
 * Extract the mkey (session security token) embedded in page JavaScript.
 * Used in SwitchCompany requests: SwitchCompany?companyCode=XXX&mkey=YYY
 */
export function extractMkey(html: string): string | null {
  const match = html.match(/mkey=([a-f0-9_-]{8,})/)
  return match ? match[1] : null
}

/**
 * Parse the VORTAL "Administración de contratos" grid.
 *
 * VORTAL renders contracts as alternating <tr class="gridLineLight/gridLineDark"> rows.
 * There is NO <thead> — columns are identified by semantic TD IDs:
 *   ContractIdCol      → secop_process_id
 *   ContractNameCol    → referencia
 *   ContractBuyerNameCol → entidad (anchor text)
 *   ContractEndDateCol → end_date
 *   ContractValueCol   → valor (VortalNumericSpan)
 *   ContractStateCol   → estado
 *   ViewContractCol    → detail URL (a[href*="docUniqueIdentifier"])
 *
 * Source: real HTML from /CO1ContractsManagement/Tendering/SalesContractManagement/Folder
 */
export function parseDashboard(html: string): DiscoveredProcess[] {
  const $ = cheerio.load(html)
  const processes: DiscoveredProcess[] = []

  $('tr.gridLineLight, tr.gridLineDark').each((_, row) => {
    const $row = $(row)

    // Contract ID — td id contains "ContractIdCol"
    const contractId = $row.find('td[id*="ContractIdCol"]').find('.VortalSpan').first().text().trim()
    if (!contractId || !/^\d+$/.test(contractId)) return

    // Reference — td id contains "ContractNameCol"
    const referencia = $row.find('td[id*="ContractNameCol"]').find('.VortalSpan').first().text().trim() || null

    // Entity (buyer) — td id contains "ContractBuyerNameCol", text is in <a>
    const $buyerCell = $row.find('td[id*="ContractBuyerNameCol"]')
    const entidad = ($buyerCell.find('a').first().text().trim() || $buyerCell.text().trim()) || null

    // End date — td id contains "ContractEndDateCol", date span has name="VB_..."
    const endDateText = $row.find('td[id*="ContractEndDateCol"]').find('span[name]').text().trim()
    const endDate = parseSecopDate(endDateText)

    // Value — td id contains "ContractValueCol", span class VortalNumericSpan
    const valorText = $row.find('td[id*="ContractValueCol"]').find('.VortalNumericSpan').text().trim()
    const valor = parseValor(valorText)

    // State — td id contains "ContractStateCol"
    const estado = $row.find('td[id*="ContractStateCol"]').find('.VortalSpan').first().text().trim() || null

    // Detail link — href contains docUniqueIdentifier
    const href = $row.find('a[href*="docUniqueIdentifier"]').first().attr('href') || ''
    const fullUrl = href
      ? href.startsWith('http') ? href : `https://www.secop.gov.co${href}`
      : null

    processes.push({
      secop_process_id: contractId,
      referencia,
      ntc_id: null,
      entidad,
      objeto: null,
      estado,
      end_date: endDate,
      valor,
      url: fullUrl,
    })
  })

  if (processes.length === 0) {
    // Check if page is genuinely empty vs wrong structure
    const hasGrid = $('tr.gridLineLight, tr.gridLineDark').length > 0
    if (!hasGrid) {
      console.warn('[parseDashboard] No gridLineLight/gridLineDark rows found — page may be empty or structure changed')
    }
  }

  return processes
}

/**
 * Parse a SECOP date string to ISO 8601.
 *
 * Input formats seen in the contracts list:
 *   "15/04/2026 11:59:59 AM(UTC-05:00) Bogotá, Lima, Quito"
 *   "6 días para terminar\n(15/04/2026 11:59:59 AM(UTC-05:00)..."
 *   "16 días de tiempo transcurrido\n(23/03/2026 11:59:59 PM..."
 *   "-"  (no date)
 */
export function parseSecopDate(text: string): string | null {
  if (!text || text.trim() === '-') return null

  const match = text.match(/(\d{1,2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/i)
  if (!match) return null

  const [, day, month, year, hStr, min, sec, ampm] = match
  let hour = parseInt(hStr, 10)
  if (ampm.toUpperCase() === 'PM' && hour !== 12) hour += 12
  if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0

  // SECOP dates are UTC-5 (Colombia)
  return `${year}-${month}-${day.padStart(2, '0')}T${String(hour).padStart(2, '0')}:${min}:${sec}-05:00`
}

/**
 * Parse "21.251.249 COP" → 21251249
 * Also handles "1.013.175.000 COP"
 */
function parseValor(text: string): number | null {
  if (!text) return null
  const clean = text.replace(/\./g, '').replace(/[^0-9]/g, '')
  const num = parseInt(clean, 10)
  return isNaN(num) ? null : num
}
