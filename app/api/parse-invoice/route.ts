import { NextRequest } from 'next/server'

/**
 * Parse a DIAN UBL 2.1 XML invoice and extract key fields.
 * Accepts the raw XML text in the request body.
 */
export async function POST(request: NextRequest) {
  try {
    const { xml, pdf_text } = await request.json()

    // Strategy 1: Parse XML (preferred — deterministic, 100% reliable)
    if (xml) {
      const result = parseXmlDian(xml)
      return Response.json({ ...result, source: 'xml' })
    }

    // Strategy 2: AI extraction from pre-extracted PDF text (client extracts text, server does AI)
    if (pdf_text) {
      const result = await extractFromPdfText(pdf_text)
      return Response.json({ ...result, source: 'pdf' })
    }

    return Response.json({ error: 'No XML or PDF text provided' }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error parsing invoice'
    return Response.json({ error: message }, { status: 500 })
  }
}

// ── XML DIAN UBL 2.1 Parser ──────────────────────────────────

function parseXmlDian(xml: string) {
  // Remove BOM if present
  const clean = xml.replace(/^\uFEFF/, '').trim()

  // Helper: extract text content from a tag (handles namespaced and non-namespaced)
  function tag(name: string): string | null {
    // Try with common DIAN namespaces first, then without namespace
    const patterns = [
      new RegExp(`<(?:cbc:|cac:)?${name}[^>]*>([^<]*)<`, 'i'),
      new RegExp(`<[^:>]*:${name}[^>]*>([^<]*)<`, 'i'),
    ]
    for (const re of patterns) {
      const m = clean.match(re)
      if (m?.[1]?.trim()) return m[1].trim()
    }
    return null
  }

  // Helper: extract attribute value
  function attr(tagName: string, attrName: string): string | null {
    const re = new RegExp(`<(?:[\\w]+:)?${tagName}[^>]*${attrName}="([^"]*)"`, 'i')
    const m = clean.match(re)
    return m?.[1] || null
  }

  // Invoice number — try several DIAN patterns
  const invoiceNumber =
    tag('ID') ||  // The first <cbc:ID> is typically the invoice number
    tag('ParentDocumentID') ||
    null

  // Issue date
  const issueDate = tag('IssueDate') || null

  // Supplier (AccountingSupplierParty) NIT
  // In DIAN UBL 2.1, the supplier NIT is inside AccountingSupplierParty > Party > PartyTaxScheme > CompanyID
  // or PartyIdentification > ID
  let supplierNit: string | null = null
  let supplierName: string | null = null

  const supplierBlock = clean.match(/<(?:[\w]+:)?AccountingSupplierParty[^>]*>([\s\S]*?)<\/(?:[\w]+:)?AccountingSupplierParty>/i)
  if (supplierBlock) {
    const block = supplierBlock[1]
    const nitMatch = block.match(/<(?:[\w]+:)?CompanyID[^>]*>([^<]*)</i) ||
                     block.match(/<(?:[\w]+:)?ID[^>]*>([^<]*)</i)
    if (nitMatch) supplierNit = nitMatch[1].trim()

    const nameMatch = block.match(/<(?:[\w]+:)?RegistrationName[^>]*>([^<]*)</i) ||
                      block.match(/<(?:[\w]+:)?Name[^>]*>([^<]*)</i)
    if (nameMatch) supplierName = nameMatch[1].trim()
  }

  // Monetary totals
  // LegalMonetaryTotal contains LineExtensionAmount (subtotal), TaxInclusiveAmount (total), PayableAmount
  const totalsBlock = clean.match(/<(?:[\w]+:)?LegalMonetaryTotal[^>]*>([\s\S]*?)<\/(?:[\w]+:)?LegalMonetaryTotal>/i)
  let subtotal: number | null = null
  let total: number | null = null

  if (totalsBlock) {
    const block = totalsBlock[1]
    const lineExt = block.match(/<(?:[\w]+:)?LineExtensionAmount[^>]*>([^<]*)</i)
    if (lineExt) subtotal = parseFloat(lineExt[1].trim())

    const payable = block.match(/<(?:[\w]+:)?PayableAmount[^>]*>([^<]*)</i) ||
                    block.match(/<(?:[\w]+:)?TaxInclusiveAmount[^>]*>([^<]*)</i)
    if (payable) total = parseFloat(payable[1].trim())
  }

  // Tax (IVA)
  let tax: number | null = null
  const taxBlock = clean.match(/<(?:[\w]+:)?TaxTotal[^>]*>([\s\S]*?)<\/(?:[\w]+:)?TaxTotal>/i)
  if (taxBlock) {
    const taxAmount = taxBlock[1].match(/<(?:[\w]+:)?TaxAmount[^>]*>([^<]*)</i)
    if (taxAmount) tax = parseFloat(taxAmount[1].trim())
  }

  // Currency
  const currency = attr('LineExtensionAmount', 'currencyID') ||
                   attr('PayableAmount', 'currencyID') ||
                   'COP'

  return {
    invoice_number: invoiceNumber,
    issue_date: issueDate,
    subtotal,
    tax,
    total,
    supplier_nit: supplierNit,
    supplier_name: supplierName,
    currency,
  }
}

// ── PDF Text AI Extraction (fallback) ─────────────────────────

async function extractFromPdfText(text: string): Promise<Record<string, unknown>> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return { error: 'No API key configured for PDF extraction' }
  }

  const prompt = `Extraé los siguientes datos de esta factura electrónica colombiana. Respondé SOLO con JSON válido, sin markdown ni explicaciones.

Campos requeridos:
- invoice_number: número de factura (ej: "FE-001", "SETT-123")
- issue_date: fecha de emisión en formato YYYY-MM-DD
- subtotal: subtotal sin IVA (número)
- tax: valor del IVA (número, o null si no aplica)
- total: total a pagar (número)
- supplier_nit: NIT del proveedor/emisor (string)
- supplier_name: nombre del proveedor/emisor (string)

Texto de la factura:
${text.slice(0, 4000)}`

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || 'qwen/qwen-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 300,
    }),
  })

  if (!res.ok) {
    return { error: 'AI extraction failed' }
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content || ''

  try {
    // Extract JSON from response (handle possible markdown wrapping)
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
  } catch {
    // Failed to parse AI response
  }

  return { error: 'Could not parse AI response' }
}
