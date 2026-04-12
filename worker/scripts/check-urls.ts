import { admin } from './db.js'

async function main() {
  const { data } = await admin
    .from('secop_processes')
    .select('secop_process_id, entity_name, estado, url_publica, monitoring_enabled')
    .eq('source', 'account')
    .order('entity_name')

  if (!data) return

  let withUrl = 0
  let withoutUrl = 0
  let monEnabled = 0

  for (const p of data) {
    const hasUrl = !!p.url_publica
    if (hasUrl) withUrl++
    else withoutUrl++
    if (p.monitoring_enabled) monEnabled++
  }

  console.log(`Total: ${data.length} contracts`)
  console.log(`With URL: ${withUrl}`)
  console.log(`Without URL: ${withoutUrl}`)
  console.log(`Monitoring enabled: ${monEnabled}`)
  console.log()

  // Show AMAZONAS specifically
  const amz = data.filter(p => p.entity_name?.includes('AMAZONAS'))
  console.log(`AMAZONAS contracts: ${amz.length}`)
  for (const p of amz.slice(0, 5)) {
    console.log(`  ${p.secop_process_id} | ${p.estado} | url: ${p.url_publica ? 'YES' : 'NO'}`)
  }

  // Show all with monitoring
  console.log(`\nMonitoring enabled:`)
  for (const p of data.filter(d => d.monitoring_enabled)) {
    console.log(`  ${p.entity_name?.slice(0, 25)} | ${p.secop_process_id} | ${p.estado} | url: ${p.url_publica ? 'YES' : 'NO'}`)
  }
}

main()
