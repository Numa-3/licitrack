'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// ── Types ──────────────────────────────────────────────────────
type InvoiceItem = {
  item_id: string
  items: { id: string; short_name: string } | null
}

type Invoice = {
  id: string
  organization_id: string
  contract_id: string
  supplier_id: string
  invoice_number: string
  issue_date: string
  subtotal: number
  tax: number | null
  total: number
  pdf_url: string
  xml_url: string | null
  notes: string
  created_at: string
  contracts: { name: string } | null
  suppliers: { name: string } | null
  organizations: { name: string } | null
  invoice_items: InvoiceItem[]
}

type Contract = { id: string; name: string; organization_id: string }
type Supplier = { id: string; name: string }
type ItemOption = { id: string; short_name: string; contract_id: string; payment_status: string }

type Props = {
  invoices: Invoice[]
  contracts: Contract[]
  suppliers: Supplier[]
  items: ItemOption[]
  currentUserId: string
}

// ── Helpers ────────────────────────────────────────────────────
function formatCurrency(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)
}

function formatDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Component ──────────────────────────────────────────────────
export default function InvoicesClient({ invoices: initialInvoices, contracts, suppliers, items, currentUserId }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [invoices, setInvoices] = useState(initialInvoices || [])
  const [filterContract, setFilterContract] = useState('')
  const [filterOrg, setFilterOrg] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [form, setForm] = useState({
    contract_id: '', supplier_id: '', invoice_number: '', issue_date: '',
    subtotal: '', tax: '', total: '',  notes: '',
  })
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [xmlFile, setXmlFile] = useState<File | null>(null)

  // Unique organizations from contracts
  const orgs = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of contracts) {
      if (c.organization_id) map.set(c.organization_id, c.organization_id)
    }
    // We need org names from invoices
    const fromInvoices = new Map<string, string>()
    for (const inv of invoices) {
      if (inv.organization_id && inv.organizations?.name) {
        fromInvoices.set(inv.organization_id, inv.organizations.name)
      }
    }
    return Array.from(fromInvoices.entries()).map(([id, name]) => ({ id, name }))
  }, [invoices, contracts])

  // Filtered invoices
  const filtered = useMemo(() => {
    let list = invoices
    if (filterContract) list = list.filter(i => i.contract_id === filterContract)
    if (filterOrg) list = list.filter(i => i.organization_id === filterOrg)
    return list
  }, [invoices, filterContract, filterOrg])

  // Items filtered by selected contract in the form
  const availableItems = useMemo(() => {
    if (!form.contract_id) return []
    return items.filter(i => i.contract_id === form.contract_id)
  }, [items, form.contract_id])

  // Suppliers relevant to selected contract items
  const contractSuppliers = useMemo(() => {
    return suppliers
  }, [suppliers])

  // Organization for selected contract
  const selectedContractOrg = useMemo(() => {
    const c = contracts.find(c => c.id === form.contract_id)
    return c?.organization_id || ''
  }, [contracts, form.contract_id])

  function toggleItem(id: string) {
    setSelectedItems(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!pdfFile) { setError('Debés subir un archivo PDF'); return }
    if (!form.contract_id || !form.supplier_id) { setError('Seleccioná contrato y proveedor'); return }
    setLoading(true)
    setError(null)

    // Upload PDF
    const pdfPath = `invoices/${Date.now()}_${pdfFile.name}`
    const { error: pdfErr } = await supabase.storage.from('invoices').upload(pdfPath, pdfFile)
    if (pdfErr) { setError('Error subiendo PDF: ' + pdfErr.message); setLoading(false); return }
    const { data: pdfUrlData } = supabase.storage.from('invoices').getPublicUrl(pdfPath)
    const pdfUrl = pdfUrlData.publicUrl

    // Upload XML (optional)
    let xmlUrl: string | null = null
    if (xmlFile) {
      const xmlPath = `invoices/${Date.now()}_${xmlFile.name}`
      const { error: xmlErr } = await supabase.storage.from('invoices').upload(xmlPath, xmlFile)
      if (xmlErr) { setError('Error subiendo XML: ' + xmlErr.message); setLoading(false); return }
      const { data: xmlUrlData } = supabase.storage.from('invoices').getPublicUrl(xmlPath)
      xmlUrl = xmlUrlData.publicUrl
    }

    // Insert invoice
    const { data: invoice, error: insertErr } = await supabase
      .from('invoices')
      .insert({
        organization_id: selectedContractOrg,
        contract_id: form.contract_id,
        supplier_id: form.supplier_id,
        invoice_number: form.invoice_number,
        issue_date: form.issue_date,
        subtotal: parseFloat(form.subtotal) || 0,
        tax: form.tax ? parseFloat(form.tax) : null,
        total: parseFloat(form.total) || 0,
        pdf_url: pdfUrl,
        xml_url: xmlUrl,
        notes: form.notes,
        uploaded_by: currentUserId,
      })
      .select('id')
      .single()

    if (insertErr || !invoice) { setError(insertErr?.message || 'Error creando factura'); setLoading(false); return }

    // Link items
    const itemIds = [...selectedItems]
    if (itemIds.length > 0) {
      const links = itemIds.map(item_id => ({ invoice_id: invoice.id, item_id }))
      await supabase.from('invoice_items').insert(links)

      // Update items payment_status to "invoiced"
      await supabase.from('items').update({ payment_status: 'invoiced' }).in('id', itemIds)

      // Log activity
      for (const itemId of itemIds) {
        await supabase.from('activity_log').insert({
          user_id: currentUserId,
          action: 'payment_status_changed',
          entity_type: 'item',
          entity_id: itemId,
          details: { new_value: 'Facturado', invoice_id: invoice.id, invoice_number: form.invoice_number },
        })
      }
    }

    // Reset form
    setShowModal(false)
    setForm({ contract_id: '', supplier_id: '', invoice_number: '', issue_date: '', subtotal: '', tax: '', total: '', notes: '' })
    setSelectedItems(new Set())
    setPdfFile(null)
    setXmlFile(null)
    setLoading(false)
    router.refresh()
  }

  // Auto-calculate total
  function updateSubtotal(val: string) {
    const sub = parseFloat(val) || 0
    const tax = parseFloat(form.tax) || 0
    setForm({ ...form, subtotal: val, total: (sub + tax).toString() })
  }
  function updateTax(val: string) {
    const sub = parseFloat(form.subtotal) || 0
    const tax = parseFloat(val) || 0
    setForm({ ...form, tax: val, total: (sub + tax).toString() })
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Facturas Electrónicas</h1>
          <p className="text-gray-500 text-sm mt-1">Facturas agrupadas por empresa y contrato</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={filterOrg} onChange={e => setFilterOrg(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
            <option value="">Todas las empresas</option>
            {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <select value={filterContract} onChange={e => setFilterContract(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
            <option value="">Todos los contratos</option>
            {contracts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={() => { setShowModal(true); setError(null) }}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
            Subir factura
          </button>
        </div>
      </div>

      {error && !showModal && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-lg">{error}</div>
      )}

      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-12 text-center">
          <p className="text-gray-400 text-lg">No hay facturas registradas</p>
          <p className="text-gray-400 text-sm mt-1">Usá el botón &quot;Subir factura&quot; para cargar una.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">N° Factura</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Contrato</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Proveedor</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Fecha</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Subtotal</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">IVA</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Total</th>
                <th className="text-center px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Ítems</th>
                <th className="text-center px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Archivos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(inv => (
                <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-900">{inv.invoice_number}</td>
                  <td className="px-5 py-3 text-gray-600">{inv.contracts?.name || '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{inv.suppliers?.name || '—'}</td>
                  <td className="px-5 py-3 text-gray-500">{formatDate(inv.issue_date)}</td>
                  <td className="px-5 py-3 text-right text-gray-700">{formatCurrency(inv.subtotal)}</td>
                  <td className="px-5 py-3 text-right text-gray-500">{formatCurrency(inv.tax)}</td>
                  <td className="px-5 py-3 text-right font-medium text-gray-900">{formatCurrency(inv.total)}</td>
                  <td className="px-5 py-3 text-center">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {inv.invoice_items?.length || 0}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                        PDF
                      </a>
                      {inv.xml_url && (
                        <a href={inv.xml_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                          XML
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Subir factura</h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Contract */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contrato</label>
                <select value={form.contract_id} onChange={e => { setForm({ ...form, contract_id: e.target.value, supplier_id: '' }); setSelectedItems(new Set()) }} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
                  <option value="">Seleccionar contrato</option>
                  {contracts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Supplier */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor</label>
                <select value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
                  <option value="">Seleccionar proveedor</option>
                  {contractSuppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              {/* Invoice details */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">N° Factura</label>
                  <input type="text" value={form.invoice_number} onChange={e => setForm({ ...form, invoice_number: e.target.value })} required
                    placeholder="FE-001" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha emisión</label>
                  <input type="date" value={form.issue_date} onChange={e => setForm({ ...form, issue_date: e.target.value })} required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
              </div>

              {/* Amounts */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subtotal</label>
                  <input type="number" value={form.subtotal} onChange={e => updateSubtotal(e.target.value)} required
                    placeholder="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">IVA</label>
                  <input type="number" value={form.tax} onChange={e => updateTax(e.target.value)}
                    placeholder="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Total</label>
                  <input type="number" value={form.total} onChange={e => setForm({ ...form, total: e.target.value })} required
                    placeholder="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 bg-gray-50" />
                </div>
              </div>

              {/* PDF upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PDF de factura *</label>
                <input type="file" accept=".pdf" onChange={e => setPdfFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200" />
                {pdfFile && <p className="text-xs text-green-600 mt-1">{pdfFile.name}</p>}
              </div>

              {/* XML upload (optional) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">XML DIAN (opcional)</label>
                <input type="file" accept=".xml" onChange={e => setXmlFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200" />
                {xmlFile && <p className="text-xs text-green-600 mt-1">{xmlFile.name}</p>}
              </div>

              {/* Associate items */}
              {form.contract_id && availableItems.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Asociar ítems del contrato</label>
                  <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                    {availableItems.map(item => (
                      <label key={item.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm">
                        <input type="checkbox" checked={selectedItems.has(item.id)}
                          onChange={() => toggleItem(item.id)} className="rounded border-gray-300" />
                        <span className="text-gray-700 flex-1">{item.short_name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          item.payment_status === 'invoiced' ? 'bg-amber-50 text-amber-700' :
                          item.payment_status === 'paid' ? 'bg-green-50 text-green-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          {item.payment_status === 'unpaid' ? 'Sin pagar' :
                           item.payment_status === 'invoiced' ? 'Facturado' : 'Pagado'}
                        </span>
                      </label>
                    ))}
                  </div>
                  {selectedItems.size > 0 && (
                    <p className="text-xs text-gray-500 mt-1">{selectedItems.size} ítem{selectedItems.size > 1 ? 's' : ''} seleccionado{selectedItems.size > 1 ? 's' : ''} — pasarán a &quot;Facturado&quot;</p>
                  )}
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none" />
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancelar</button>
                <button type="submit" disabled={loading}
                  className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
                  {loading ? 'Subiendo...' : 'Guardar factura'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
