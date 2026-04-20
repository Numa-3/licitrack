import { cleanDateString } from '../src/utils/date-format.js'

const cases: [string | null, string][] = [
  // ISO con hora
  ['2026-03-15T14:30:00.000', '15/03/2026 14:30'],
  // ISO a medianoche → sin hora
  ['2026-03-15T00:00:00.000', '15/03/2026'],
  // ISO con Z
  ['2025-06-25T09:00:00.000Z', '25/06/2025 09:00'],
  // DD/MM AM
  ['25/06/2025 2:00:00 AM', '25/06/2025 02:00'],
  // DD/MM PM
  ['15/03/2026 2:30:00 PM', '15/03/2026 14:30'],
  // DD/MM 12 PM (noon → 12:00)
  ['15/03/2026 12:00:00 PM', '15/03/2026 12:00'],
  // DD/MM 12 AM (midnight → 00:00 → sin hora)
  ['15/03/2026 12:00:00 AM', '15/03/2026'],
  // null
  [null, 'fecha desconocida'],
  // string raro
  ['not a date', 'fecha desconocida'],
  // empty
  ['', 'fecha desconocida'],
]

let passed = 0
let failed = 0
for (const [input, expected] of cases) {
  const actual = cleanDateString(input)
  const ok = actual === expected
  if (ok) {
    passed++
    console.log(`✓ ${JSON.stringify(input)} → "${actual}"`)
  } else {
    failed++
    console.log(`✗ ${JSON.stringify(input)} → "${actual}" (expected: "${expected}")`)
  }
}

console.log(`\n${passed}/${cases.length} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
