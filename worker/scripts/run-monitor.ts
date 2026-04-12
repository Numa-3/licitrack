import { runMonitorCycle } from './monitor.js'

const result = await runMonitorCycle()
console.log('\n═══════════════════════════════')
console.log('  MONITOR RESULT:', JSON.stringify(result))
console.log('═══════════════════════════════')
process.exit(0)
