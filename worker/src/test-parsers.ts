/**
 * Test parsers against captured HTML files.
 * Run: npx tsx src/test-parsers.ts
 *
 * SECOP tabs mapping (real stepDiv numbers):
 *   stepDiv_1  = Modificación pendiente (skip)
 *   stepDiv_2  = Información general
 *   stepDiv_3  = Condiciones
 *   stepDiv_4  = Bienes y servicios
 *   stepDiv_5  = Documentos del Proveedor
 *   stepDiv_6  = Documentos del contrato
 *   stepDiv_7  = Información presupuestal
 *   stepDiv_8  = Ejecución del Contrato
 *   stepDiv_9  = Modificaciones del Contrato
 *   stepDiv_10 = Incumplimientos
 */
import { readFileSync, existsSync } from 'fs'
import {
  parseInfoGeneral,
  parseCondiciones,
  parseBienesServicios,
  parseDocsProveedor,
  parseDocsContrato,
  parsePresupuestal,
  parseEjecucion,
  parseModificaciones,
  parseIncumplimientos,
} from './parsers/contract-detail.js'

const DIR = '/tmp/secop-capture'

// Map: captured file slug → real stepDiv number
// The capture script used stepDiv 1-9, but the content is shifted:
//   captured tab-1 → stepDiv_1 (modificación pendiente, skip)
//   captured tab-2 → stepDiv_2 (info general)  → use with parseInfoGeneral
//   captured tab-3 → stepDiv_3 (condiciones)   → use with parseCondiciones
//   etc.
const FILES: Record<string, string> = {
  'info-general': 'tab-2-condiciones.html',      // stepDiv_2 = info general (was mislabeled)
  'condiciones': 'tab-3-bienes-servicios.html',   // stepDiv_3 = condiciones
  'bienes': 'tab-4-docs-proveedor.html',          // stepDiv_4 = bienes y servicios
  'docs-prov': 'tab-5-docs-contrato.html',        // stepDiv_5 = docs proveedor
  'docs-cont': 'tab-6-presupuestal.html',         // stepDiv_6 = docs contrato
  'presupuestal': 'tab-7-ejecucion.html',         // stepDiv_7 = presupuestal
  'ejecucion': 'tab-8-modificaciones.html',       // stepDiv_8 = ejecución
  'modificaciones': 'tab-9-incumplimientos.html', // stepDiv_9 = modificaciones
}

function load(key: string): string {
  const file = FILES[key]
  if (!file) throw new Error(`Unknown key: ${key}`)
  const path = `${DIR}/${file}`
  if (!existsSync(path)) throw new Error(`File not found: ${path}`)
  return readFileSync(path, 'utf-8')
}

console.log('═══════════════════════════════════════════════════')
console.log('  PARSER TEST — against captured SECOP HTML')
console.log('  (tab mapping corrected: stepDiv 2-10)')
console.log('═══════════════════════════════════════════════════\n')

// Tab 2 (stepDiv_2): Info General
console.log('── stepDiv_2: Información General ──')
const info = parseInfoGeneral(load('info-general'))
console.log(JSON.stringify(info, null, 2))
const infoFields = Object.entries(info).filter(([, v]) => v !== null).length
console.log(`→ ${infoFields}/${Object.keys(info).length} fields populated\n`)

// Tab 3 (stepDiv_3): Condiciones
console.log('── stepDiv_3: Condiciones ──')
const cond = parseCondiciones(load('condiciones'))
console.log(JSON.stringify(cond, null, 2))
const condFields = Object.entries(cond).filter(([, v]) => v !== null).length
console.log(`→ ${condFields}/${Object.keys(cond).length} fields populated\n`)

// Tab 4 (stepDiv_4): Bienes y Servicios
console.log('── stepDiv_4: Bienes y Servicios ──')
const bienes = parseBienesServicios(load('bienes'))
console.log(JSON.stringify(bienes, null, 2))
console.log(`→ ${bienes.item_count} items found\n`)

// Tab 5 (stepDiv_5): Docs Proveedor
console.log('── stepDiv_5: Documentos del Proveedor ──')
const docsP = parseDocsProveedor(load('docs-prov'))
console.log(JSON.stringify(docsP, null, 2))
console.log(`→ ${docsP.document_names.length} documents found\n`)

// Tab 6 (stepDiv_6): Docs Contrato
console.log('── stepDiv_6: Documentos del Contrato ──')
const docsC = parseDocsContrato(load('docs-cont'))
console.log(JSON.stringify(docsC, null, 2))
console.log(`→ ${docsC.documents.length} documents found\n`)

// Tab 7 (stepDiv_7): Presupuestal
console.log('── stepDiv_7: Información Presupuestal ──')
const pres = parsePresupuestal(load('presupuestal'))
console.log(JSON.stringify(pres, null, 2))
const presFields = Object.entries(pres).filter(([, v]) => v !== null).length
console.log(`→ ${presFields}/${Object.keys(pres).length} fields populated\n`)

// Tab 8 (stepDiv_8): Ejecución
console.log('── stepDiv_8: Ejecución del Contrato ──')
const ejec = parseEjecucion(load('ejecucion'))
console.log(JSON.stringify(ejec, null, 2))
console.log(`→ ${ejec.pagos.length} pagos, ${ejec.execution_docs.length} docs\n`)

// Tab 9 (stepDiv_9): Modificaciones
console.log('── stepDiv_9: Modificaciones ──')
const mods = parseModificaciones(load('modificaciones'))
console.log(JSON.stringify(mods, null, 2))
console.log(`→ ${mods.entries.length} modifications found\n`)

// Tab 10 (stepDiv_10): Incumplimientos — not captured yet (script only went to 9)
console.log('── stepDiv_10: Incumplimientos ──')
console.log('  NOT CAPTURED (capture script only went to stepDiv_9)\n')

// Summary
console.log('═══════════════════════════════════════════════════')
console.log('  SUMMARY')
console.log('═══════════════════════════════════════════════════')
const results = [
  { tab: 2,  name: 'Info General',     ok: infoFields > 3, detail: `${infoFields}/13 fields` },
  { tab: 3,  name: 'Condiciones',      ok: condFields > 0, detail: `${condFields}/5 fields` },
  { tab: 4,  name: 'Bienes/Servicios', ok: true, detail: `${bienes.item_count} items` },
  { tab: 5,  name: 'Docs Proveedor',   ok: true, detail: `${docsP.document_names.length} docs` },
  { tab: 6,  name: 'Docs Contrato',    ok: true, detail: `${docsC.documents.length} docs` },
  { tab: 7,  name: 'Presupuestal',     ok: presFields > 0, detail: `${presFields}/3 fields` },
  { tab: 8,  name: 'Ejecución',        ok: true, detail: `${ejec.pagos.length} pagos, ${ejec.execution_docs.length} docs` },
  { tab: 9,  name: 'Modificaciones',   ok: true, detail: `${mods.entries.length} mods` },
  { tab: 10, name: 'Incumplimientos',  ok: false, detail: 'not captured' },
]

for (const r of results) {
  const icon = r.ok ? 'PASS' : 'FAIL'
  console.log(`  stepDiv_${r.tab}: ${r.name.padEnd(20)} ${icon.padEnd(6)} ${r.detail}`)
}
