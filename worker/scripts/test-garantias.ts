/**
 * Test parseCondiciones() against the garantías fixture.
 * Run from /worker: npx tsx scripts/test-garantias.ts
 */
import { readFileSync } from 'fs'
import { parseCondiciones } from '../src/parsers/contract-detail.js'

const HTML = readFileSync(new URL('./garantias-fixture.html', import.meta.url), 'utf-8')

const result = parseCondiciones(HTML)

console.log('\n═══════════════════════════════════════════════════')
console.log('  parseCondiciones() — test against fixture')
console.log('═══════════════════════════════════════════════════')

console.log('\n── Renovable / Pago / Entrega ──')
console.log('  renovable:       ', result.renovable)
console.log('  fecha_renovacion:', result.fecha_renovacion)
console.log('  metodo_pago:     ', result.metodo_pago)
console.log('  plazo_pago:      ', result.plazo_pago)
console.log('  opciones_entrega:', result.opciones_entrega)

console.log('\n── Fechas de garantías ──')
console.log('  fecha_limite_garantias:  ', result.fecha_limite_garantias)
console.log('  fecha_entrega_garantias: ', result.fecha_entrega_garantias)

console.log('\n── Requisitos de garantías ──')
if (result.requisitos_garantias) {
  for (const [k, v] of Object.entries(result.requisitos_garantias)) {
    console.log(`  ${k.padEnd(35)}: ${v}`)
  }
} else {
  console.log('  (null — sección no encontrada)')
}

console.log('\n── Garantías del proveedor ──')
console.log(`  Total encontradas: ${result.garantias.length}`)
for (const g of result.garantias) {
  console.log(`  ┌─ ${g.garantia_id}`)
  console.log(`  │  Justificación: ${g.justificacion}`)
  console.log(`  │  Tipo:          ${g.tipo}`)
  console.log(`  │  Valor:         ${g.valor}`)
  console.log(`  │  Emisor:        ${g.emisor}`)
  console.log(`  │  Fecha fin:     ${g.fecha_fin}`)
  console.log(`  └  Estado:        ${g.estado}`)
}

console.log('\n── Validaciones ──')
const checks = [
  { name: 'fecha_limite_garantias == 25/06/2025 12:00:00 PM', ok: result.fecha_limite_garantias === '25/06/2025 12:00:00 PM' },
  { name: 'fecha_entrega_garantias == 20/11/2025 4:19:30 PM', ok: result.fecha_entrega_garantias === '20/11/2025 4:19:30 PM' },
  { name: 'Detecta 4 garantías', ok: result.garantias.length === 4 },
  { name: 'CO1.WRT.19648919 está en Borrador', ok: result.garantias.find(g => g.garantia_id === 'CO1.WRT.19648919')?.estado === 'Borrador' },
  { name: 'CO1.WRT.19642372 está en Pendiente', ok: result.garantias.find(g => g.garantia_id === 'CO1.WRT.19642372')?.estado === 'Pendiente' },
  { name: 'CO1.WRT.18681864 está en Aceptada', ok: result.garantias.find(g => g.garantia_id === 'CO1.WRT.18681864')?.estado === 'Aceptada' },
  { name: 'CO1.WRT.18665415 está en Vencida', ok: result.garantias.find(g => g.garantia_id === 'CO1.WRT.18665415')?.estado === 'Vencida' },
  { name: 'Requisitos: solicita_garantias == Sí', ok: result.requisitos_garantias?.solicita_garantias === 'Sí' },
  { name: 'Requisitos: seriedad_porcentaje == 10,00', ok: result.requisitos_garantias?.seriedad_porcentaje === '10,00' },
  { name: 'Requisitos: anticipo_porcentaje == 100,00', ok: result.requisitos_garantias?.anticipo_porcentaje === '100,00' },
  { name: 'Requisitos: anticipo_activo == true', ok: result.requisitos_garantias?.anticipo_activo === true },
  { name: 'Póliza Aceptada tiene Emisor ASEGURADORA SOLIDARIA DE COLOMBIA',
    ok: result.garantias.find(g => g.garantia_id === 'CO1.WRT.18681864')?.emisor === 'ASEGURADORA SOLIDARIA DE COLOMBIA' },
  { name: 'Póliza Aceptada tiene Fecha fin 31/12/2026 (sin timezone)',
    ok: result.garantias.find(g => g.garantia_id === 'CO1.WRT.18681864')?.fecha_fin === '31/12/2026' },
]

let passed = 0
for (const c of checks) {
  const icon = c.ok ? '✓' : '✗'
  console.log(`  ${icon}  ${c.name}`)
  if (c.ok) passed++
}

console.log(`\n  Total: ${passed}/${checks.length} passed`)
if (passed !== checks.length) {
  process.exit(1)
}
