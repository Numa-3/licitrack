/**
 * Diagnóstico de extracción del scraper contra HTML ya capturado.
 *
 * Uso:
 *   cd worker
 *   npx tsx scripts/test-extraction.ts debug-html/opportunity-CO1.NTC.10227525.html
 *
 * Imprime qué matchea cada selector del scraper + la estructura cercana
 * a los IDs para identificar por qué la extracción devuelve null.
 */
import { readFile } from 'fs/promises'
import * as cheerio from 'cheerio'

async function main() {
  const file = process.argv[2]
  if (!file) {
    console.error('Uso: npx tsx scripts/test-extraction.ts <ruta-al-html>')
    process.exit(1)
  }

  const html = await readFile(file, 'utf-8')
  console.log(`\nHTML: ${file} (${html.length} bytes)\n`)

  const $ = cheerio.load(html)

  const ids = [
    'fdsRequestSummaryInfo_tblDetail_trRowBuyer_tdCell1',
    'fdsRequestSummaryInfo_tblDetail_trRowRef_tdCell2_spnRequestReference',
    'fdsRequestSummaryInfo_tblDetail_trRowName_tdCell2_spnRequestName',
    'fdsRequestSummaryInfo_tblDetail_trRowDescription_tdCell2_spnDescription',
    'fdsRequestSummaryInfo_tblDetail_trRowProcedureType_tdCell2_spnProcedureType',
    'fdsRequestSummaryInfo_tblDetail_trRowPhase_tdCell2_spnPhase',
    'fdsRequestSummaryInfo_tblDetail_trRowState_tdCell2_spnState',
    'cbxBasePriceValue',
    'fdsObjectOfTheContract_tblDetail_trRowTypeOfContract_tdCell2_spnTypeOfContract',
    'fdsObjectOfTheContract_tblDetail_trRowContractDuration_tdCell2_spnContractDuration',
    'fdsObjectOfTheContract_tblDetail_trRowContractDuration_tdCell2_spnContractDurationType',
  ]

  console.log('─── Selectores por ID ───')
  for (const id of ids) {
    const el = $(`#${id}`)
    const exists = el.length > 0
    const text = el.text().replace(/\s+/g, ' ').trim()
    const marker = exists ? (text ? 'OK' : 'VACIO') : 'NO EXISTE'
    console.log(`  [${marker}] #${id}`)
    console.log(`          text = "${text.slice(0, 100)}"`)
  }

  console.log('\n─── .CompanyFullName ───')
  $('.CompanyFullName').each((i, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim()
    const parent = $(el).parent().attr('id') || $(el).parent().prop('tagName')
    console.log(`  [${i}] "${t.slice(0, 120)}"  (padre: ${parent})`)
  })

  console.log('\n─── Primeros trScheduleDateRow ───')
  $('tr[id^="trScheduleDateRow_"]').slice(0, 3).each((i, row) => {
    const $row = $(row)
    const style = $row.attr('style') || ''
    const label = $row.find('label[id^="lblScheduleDateTimeLabel_"]').first().text().trim()
    const dateText = $row.find('font.DateTimeDetail').first().text().trim()
    console.log(`  [${i}] visible=${!/display\s*:\s*none/i.test(style)} label="${label}" date="${dateText.slice(0, 60)}"`)
  })

  console.log('\n─── Samples de IDs con "spn" o "lbl" ───')
  const allIds = new Set<string>()
  $('[id]').each((_, el) => {
    const id = $(el).attr('id')
    if (id && (id.includes('Company') || id.includes('Buyer') || id.includes('Entity') || id.includes('Request'))) {
      allIds.add(id)
    }
  })
  for (const id of Array.from(allIds).slice(0, 30)) {
    const text = $(`#${id}`).text().replace(/\s+/g, ' ').trim().slice(0, 80)
    console.log(`  #${id} → "${text}"`)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
