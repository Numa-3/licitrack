import { admin } from './db.js'

async function main() {
  // Pick a mix: 1 "En ejecución", 1 "Modificación aceptada", 1 from each entity
  // First get all contracts with URLs
  const { data: all } = await admin
    .from('secop_processes')
    .select('id, secop_process_id, entity_name, estado, url_publica')
    .eq('source', 'account')
    .not('url_publica', 'is', null)

  if (!all?.length) {
    console.log('No contracts found')
    return
  }

  // Pick 5 diverse contracts
  const picks: typeof all = []

  // 1. "En ejecución"
  const enEjec = all.find(p => p.estado === 'En ejecución')
  if (enEjec) picks.push(enEjec)

  // 2. "Modificación aceptada"
  const modif = all.find(p => p.estado === 'Modificación aceptada' && !picks.some(x => x.id === p.id))
  if (modif) picks.push(modif)

  // 3. From AMAZONAS entity
  const amazonas = all.find(p => p.entity_name?.includes('AMAZONAS') && !picks.some(x => x.id === p.id))
  if (amazonas) picks.push(amazonas)

  // 4. Another AMAZONAS
  const amazonas2 = all.find(p => p.entity_name?.includes('AMAZONAS') && !picks.some(x => x.id === p.id))
  if (amazonas2) picks.push(amazonas2)

  // 5. One more from UT SELVA
  const otro = all.find(p => p.entity_name?.includes('SELVA') && !picks.some(x => x.id === p.id))
  if (otro) picks.push(otro)

  console.log(`Enabling monitoring on ${picks.length} contracts:\n`)
  for (const p of picks) {
    console.log(`  ${p.entity_name?.slice(0, 30)} | ${p.secop_process_id} | ${p.estado}`)
  }

  const ids = picks.map(p => p.id)
  const { error } = await admin
    .from('secop_processes')
    .update({ monitoring_enabled: true })
    .in('id', ids)

  if (error) {
    console.error('Error:', error.message)
  } else {
    console.log(`\nDone! ${ids.length} contracts now have monitoring_enabled=true`)
  }
}

main()
