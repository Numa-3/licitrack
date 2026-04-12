import { admin } from './db.js'

async function main() {
  const { data } = await admin
    .from('secop_processes')
    .select('secop_process_id, entidad, entity_name, estado, monitoring_enabled')
    .eq('source', 'account')
    .order('entity_name')

  if (!data) return

  console.log('entity_name'.padEnd(28) + ' | ' + 'entidad'.padEnd(42) + ' | ' + 'estado'.padEnd(22) + ' | ID')
  console.log('─'.repeat(120))
  for (const p of data) {
    console.log([
      (p.entity_name || 'NULL').slice(0, 27).padEnd(28),
      (p.entidad || '').slice(0, 41).padEnd(42),
      (p.estado || '').slice(0, 21).padEnd(22),
      p.secop_process_id
    ].join(' | '))
  }
  console.log(`\nTotal: ${data.length}`)

  // Count by entity_name
  const byEntity = new Map<string, number>()
  for (const p of data) {
    const key = p.entity_name || 'NULL'
    byEntity.set(key, (byEntity.get(key) || 0) + 1)
  }
  console.log('\nPor entity_name:')
  for (const [k, v] of byEntity) {
    console.log(`  ${k}: ${v}`)
  }
}

main()
