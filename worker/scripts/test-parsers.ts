/**
 * Test parsers against captured HTML files.
 * Run: npx tsx scripts/test-parsers.ts
 *
 * Prerequisite: run the capture script first (stores HTML in /tmp/secop-capture).
 *
 * SECOP tabs we monitor:
 *   stepDiv_1 → Información general
 *   stepDiv_2 → Condiciones (+ Garantías del proveedor)
 *   stepDiv_4 → Documentos del Proveedor
 *   stepDiv_5 → Documentos del contrato
 *   stepDiv_7 → Ejecución del Contrato
 *   stepDiv_8 → Modificaciones del Contrato
 *
 * Skipped (user requested): stepDiv_3 (Bienes), stepDiv_6 (Presupuestal), stepDiv_9 (Incumplimientos).
 */
import { readFileSync, existsSync } from 'fs'
import {
  parseInfoGeneral,
  parseCondiciones,
  parseDocsProveedor,
  parseDocsContrato,
  parseEjecucion,
  parseModificaciones,
} from '../src/parsers/contract-detail.js'

const DIR = '/tmp/secop-capture'

const FILES: Record<string, string> = {
  'info-general':   'tab-1-info-general.html',
  'condiciones':    'tab-2-condiciones.html',
  'docs-prov':      'tab-4-docs-proveedor.html',
  'docs-cont':      'tab-5-docs-contrato.html',
  'ejecucion':      'tab-7-ejecucion.html',
  'modificaciones': 'tab-8-modificaciones.html',
}

function load(key: string): string | null {
  const file = FILES[key]
  if (!file) return null
  const path = `${DIR}/${file}`
  if (!existsSync(path)) return null
  return readFileSync(path, 'utf-8')
}

console.log('═══════════════════════════════════════════════════')
console.log('  PARSER TEST — against captured SECOP HTML')
console.log('═══════════════════════════════════════════════════\n')

const results: { tab: number; name: string; ok: boolean; detail: string }[] = []

const info = load('info-general')
if (info) {
  const r = parseInfoGeneral(info)
  console.log('── stepDiv_1: Información General ──')
  console.log(JSON.stringify(r, null, 2))
  const n = Object.values(r).filter(v => v !== null).length
  results.push({ tab: 1, name: 'Info General', ok: n > 3, detail: `${n}/13 fields` })
} else {
  console.log('── stepDiv_1: Información General — SKIPPED (no capture) ──\n')
}

const cond = load('condiciones')
if (cond) {
  const r = parseCondiciones(cond)
  console.log('\n── stepDiv_2: Condiciones ──')
  console.log(JSON.stringify(r, null, 2))
  results.push({
    tab: 2, name: 'Condiciones', ok: r.garantias.length >= 0,
    detail: `${r.garantias.length} garantías, fecha_limite=${r.fecha_limite_garantias ?? '—'}`,
  })
} else {
  console.log('\n── stepDiv_2: Condiciones — SKIPPED (no capture) ──')
}

const docsP = load('docs-prov')
if (docsP) {
  const r = parseDocsProveedor(docsP)
  console.log('\n── stepDiv_4: Documentos del Proveedor ──')
  console.log(JSON.stringify(r, null, 2))
  results.push({ tab: 4, name: 'Docs Proveedor', ok: true, detail: `${r.document_names.length} docs` })
}

const docsC = load('docs-cont')
if (docsC) {
  const r = parseDocsContrato(docsC)
  console.log('\n── stepDiv_5: Documentos del Contrato ──')
  console.log(JSON.stringify(r, null, 2))
  results.push({ tab: 5, name: 'Docs Contrato', ok: true, detail: `${r.documents.length} docs` })
}

const ejec = load('ejecucion')
if (ejec) {
  const r = parseEjecucion(ejec)
  console.log('\n── stepDiv_7: Ejecución del Contrato ──')
  console.log(JSON.stringify(r, null, 2))
  results.push({
    tab: 7, name: 'Ejecución', ok: true,
    detail: `${r.pagos.length} pagos, ${r.execution_docs.length} docs`,
  })
}

const mods = load('modificaciones')
if (mods) {
  const r = parseModificaciones(mods)
  console.log('\n── stepDiv_8: Modificaciones ──')
  console.log(JSON.stringify(r, null, 2))
  results.push({ tab: 8, name: 'Modificaciones', ok: true, detail: `${r.entries.length} mods` })
}

console.log('\n═══════════════════════════════════════════════════')
console.log('  SUMMARY')
console.log('═══════════════════════════════════════════════════')
if (results.length === 0) {
  console.log('  No HTML captures found in', DIR)
  console.log('  Run the capture script first.')
} else {
  for (const r of results) {
    const icon = r.ok ? 'PASS' : 'FAIL'
    console.log(`  stepDiv_${r.tab}: ${r.name.padEnd(16)} ${icon.padEnd(6)} ${r.detail}`)
  }
}
