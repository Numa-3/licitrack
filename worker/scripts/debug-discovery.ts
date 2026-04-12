/**
 * Debug discovery: run for each monitored entity and save HTML + parsed contracts
 * to /tmp/secop-debug/ for comparison.
 */
import { admin } from '../src/db.js'
import { discoverProcesses } from '../src/discovery.js'
import { getValidSession } from '../src/session.js'
import { loginAccount } from '../src/login.js'
import { writeFileSync, mkdirSync } from 'fs'

process.env.DEBUG_HTML = '1'

async function main() {
  const { data: acc } = await admin
    .from('secop_accounts')
    .select('id, name, monitored_entities')
    .eq('is_active', true)
    .limit(1)
    .single()

  if (!acc) { console.log('No active account'); return }

  const entities = (acc.monitored_entities as string[]) || []
  console.log(`Account: ${acc.name}`)
  console.log(`Entities: ${entities.join(', ')}\n`)

  // Ensure session
  let session = await getValidSession(acc.id)
  if (!session) {
    console.log('Logging in...')
    await loginAccount(acc.id)
    session = await getValidSession(acc.id)
  }
  if (!session) { console.log('Login failed'); return }

  mkdirSync('/tmp/secop-debug', { recursive: true })

  for (const entityName of entities) {
    console.log(`\n═══ ${entityName} ═══`)
    const count = await discoverProcesses(acc.id, entityName)
    console.log(`Result: ${count} new contracts`)
  }

  // Now check what's in DB
  console.log('\n═══ DB STATE ═══')
  const { data } = await admin
    .from('secop_processes')
    .select('secop_process_id, entity_name, entidad, estado')
    .eq('source', 'account')
    .order('entity_name')

  const byEntity = new Map<string, number>()
  for (const p of (data || [])) {
    const key = p.entity_name || 'NULL'
    byEntity.set(key, (byEntity.get(key) || 0) + 1)
  }
  for (const [k, v] of byEntity) {
    console.log(`  ${k}: ${v} contracts`)
  }
  console.log(`  Total: ${data?.length}`)
}

main().catch(e => { console.error(e); process.exit(1) })
