import { admin } from './db.js'

async function main() {
  const { data } = await admin
    .from('secop_processes')
    .select('id, secop_process_id, referencia_proceso, entity_name, estado, url_publica, monitoring_enabled')
    .eq('source', 'account')
    .order('entity_name')
    .limit(15)

  if (!data?.length) {
    console.log('No contracts found')
    return
  }

  console.log(`Found ${data.length} contracts:\n`)
  for (const p of data) {
    const mon = p.monitoring_enabled ? 'ON' : 'off'
    const hasUrl = p.url_publica ? 'URL' : 'no-url'
    console.log(`[${mon}] ${p.entity_name?.slice(0, 30)?.padEnd(30)} | ${p.secop_process_id} | ${p.estado?.slice(0, 25)} | ${hasUrl}`)
  }
}

main()
