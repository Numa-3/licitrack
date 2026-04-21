import { readFile } from 'fs/promises'
import * as cheerio from 'cheerio'

// Este script es una réplica standalone de las funciones de extracción
// para probar contra un HTML guardado sin levantar Playwright.

function normalizeText(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

function extractBasicInfo(html: string) {
  const $ = cheerio.load(html)
  const byId = (id: string): string | null => {
    const el = $(`#${id}`)
    if (el.length === 0) return null
    const v = normalizeText(el.text())
    return v || null
  }

  return {
    entidad: normalizeText($('#fdsRequestSummaryInfo_tblDetail_trRowBuyer_tdCell1 .CompanyFullName').first().text()) || null,
    precio_base: byId('cbxBasePriceValue'),
    referencia: byId('fdsRequestSummaryInfo_tblDetail_trRowRef_tdCell2_spnRequestReference'),
    objeto: byId('fdsRequestSummaryInfo_tblDetail_trRowName_tdCell2_spnRequestName'),
    descripcion: byId('fdsRequestSummaryInfo_tblDetail_trRowDescription_tdCell2_spnDescription'),
    modalidad: byId('fdsRequestSummaryInfo_tblDetail_trRowProcedureType_tdCell2_spnProcedureType'),
    tipo_contrato: byId('fdsObjectOfTheContract_tblDetail_trRowTypeOfContract_tdCell2_spnTypeOfContract'),
    fase: byId('fdsRequestSummaryInfo_tblDetail_trRowPhase_tdCell2_spnPhase'),
    estado: byId('fdsRequestSummaryInfo_tblDetail_trRowState_tdCell2_spnState'),
    duracion: byId('fdsObjectOfTheContract_tblDetail_trRowContractDuration_tdCell2_spnContractDuration'),
    unidad_duracion: byId('fdsObjectOfTheContract_tblDetail_trRowContractDuration_tdCell2_spnContractDurationType'),
  }
}

function extractCronograma(html: string) {
  const $ = cheerio.load(html)
  const results: { nombre: string; fecha: string | null }[] = []

  const rows = $('tr[id^="trScheduleDateRow_"]').toArray()
  for (const row of rows) {
    const $row = $(row)
    const style = $row.attr('style') || ''
    if (/display\s*:\s*none/i.test(style)) continue

    const label = normalizeText($row.find('label[id^="lblScheduleDateTimeLabel_"]').first().text())
    if (!label) continue

    const detailText = normalizeText($row.find('font.DateTimeDetail').first().text())
    let fecha: string | null = null
    if (detailText) {
      const m = detailText.match(/\(?\s*([\d\/]+\s+[\d:]+\s*[AP]M)/i)
      if (m) fecha = m[1]
    }

    results.push({ nombre: label, fecha })
  }
  return results
}

async function main() {
  const path = process.argv[2] || '/Users/brandon/Downloads/Index.html'
  console.log(`Loading HTML from: ${path}`)
  const html = await readFile(path, 'utf-8')
  console.log(`HTML size: ${html.length} bytes\n`)

  const info = extractBasicInfo(html)
  console.log('=== Basic info ===')
  for (const [k, v] of Object.entries(info)) {
    console.log(`  ${k}: ${v || '(empty)'}`)
  }

  const crono = extractCronograma(html)
  console.log(`\n=== Cronograma (${crono.length} eventos) ===`)
  for (const e of crono) {
    console.log(`  ${e.nombre} → ${e.fecha || '(sin fecha)'}`)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
