/**
 * Smoke test: fetch a real precontractual process via the public API
 * and run the diff engine against a synthetic "before" snapshot.
 *
 * Run from /worker: npx tsx scripts/test-precontractual.ts
 */
import {
  extractNoticeUid, snapshotByNoticeUid,
} from '../src/precontractual/fetcher.js'
import {
  diffPrecontractualSnapshots, hashPrecontractualSnapshot, findNextDeadline,
} from '../src/precontractual/diff.js'

const TEST_URL = 'https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=CO1.NTC.9200318&isFromPublicArea=True&isModal=False'

async function main() {
  console.log('\n═══════════════════════════════════════════════════')
  console.log('  Precontractual — smoke test')
  console.log('═══════════════════════════════════════════════════\n')

  const noticeUid = extractNoticeUid(TEST_URL)
  console.log('noticeUID:', noticeUid)

  if (!noticeUid) {
    console.error('Failed to extract noticeUID')
    process.exit(1)
  }

  console.log('\nFetching from SECOP II API...')
  const snapshot = await snapshotByNoticeUid(noticeUid)

  console.log('\n── Core ──')
  console.log('  Entidad:         ', snapshot.entidad)
  console.log('  NIT:             ', snapshot.nit_entidad)
  console.log('  Objeto:          ', snapshot.nombre_procedimiento)
  console.log('  Modalidad:       ', snapshot.modalidad)
  console.log('  Tipo contrato:   ', snapshot.tipo_contrato)
  console.log('  Precio base:     ', snapshot.precio_base)
  console.log('  Fase actual:     ', snapshot.fase_actual)
  console.log('  Estado actual:   ', snapshot.estado_actual)
  console.log('  Adjudicado:      ', snapshot.adjudicado)
  if (snapshot.proveedor_adjudicado) {
    console.log('  Proveedor adj:   ', snapshot.proveedor_adjudicado.nombre,
      `(NIT ${snapshot.proveedor_adjudicado.nit})`,
      `— ${snapshot.proveedor_adjudicado.valor}`)
  }

  console.log(`\n── Phases (${snapshot.phases.length}) ──`)
  for (const p of snapshot.phases) {
    console.log(`  [${p.fecha_publicacion?.slice(0, 10)}] ${p.fase} · estado=${p.estado_del_procedimiento} · recepción=${p.fecha_recepcion?.slice(0, 10)} · adj=${p.adjudicado}`)
  }

  const next = findNextDeadline(snapshot)
  console.log('\n── Next deadline ──')
  console.log(`  ${next.label || '(none)'} — ${next.deadline || '(no future date)'}`)

  console.log('\n── Hash ──')
  console.log('  ', hashPrecontractualSnapshot(snapshot))

  // Simulate diff: pretend previous snapshot had 1 fewer phase and was not awarded
  if (snapshot.phases.length > 1) {
    const previous = {
      ...snapshot,
      phases: snapshot.phases.slice(0, -1),
      fase_actual: snapshot.phases[snapshot.phases.length - 2]?.fase || null,
      estado_actual: snapshot.phases[snapshot.phases.length - 2]?.estado_del_procedimiento || null,
      adjudicado: false,
      proveedor_adjudicado: null,
    }
    const changes = diffPrecontractualSnapshots(previous, snapshot, new Set(['902002598']))
    console.log(`\n── Simulated diff (${changes.length} changes) ──`)
    for (const c of changes) {
      console.log(`  [${c.priority.toUpperCase()}] ${c.change_type}: ${c.summary}`)
    }
  }

  console.log('\n✓ Smoke test completed')
}

main().catch(err => {
  console.error('ERROR:', err)
  process.exit(1)
})
