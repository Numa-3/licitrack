/**
 * Format date strings coming from SECOP into compact human-readable form.
 *
 * SECOP gives us:
 *   - ISO 8601: "2026-03-15T14:30:00.000" or "2026-03-15T00:00:00.000"
 *   - DD/MM/YYYY H:MM:SS AM/PM: "15/03/2026 2:30:00 PM"
 *
 * Output:
 *   - With non-midnight time → "DD/MM/YYYY HH:mm"
 *   - Exactly midnight       → "DD/MM/YYYY"
 *   - Null / unparseable     → "fecha desconocida"
 */
export function cleanDateString(raw: string | null | undefined): string {
  if (!raw) return 'fecha desconocida'

  const iso = parseIso(raw)
  if (iso) return formatParts(iso)

  const legacy = parseLegacy(raw)
  if (legacy) return formatParts(legacy)

  return 'fecha desconocida'
}

type Parts = { d: number; mo: number; y: number; h: number; mi: number }

function parseIso(s: string): Parts | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return null
  return {
    y: parseInt(m[1], 10),
    mo: parseInt(m[2], 10),
    d: parseInt(m[3], 10),
    h: parseInt(m[4], 10),
    mi: parseInt(m[5], 10),
  }
}

function parseLegacy(s: string): Parts | null {
  const m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM|am|pm)?/)
  if (!m) return null
  let h = parseInt(m[4], 10)
  const ampm = (m[6] || '').toUpperCase()
  if (ampm === 'PM' && h < 12) h += 12
  if (ampm === 'AM' && h === 12) h = 0
  return {
    d: parseInt(m[1], 10),
    mo: parseInt(m[2], 10),
    y: parseInt(m[3], 10),
    h,
    mi: parseInt(m[5], 10),
  }
}

function formatParts(p: Parts): string {
  const dd = String(p.d).padStart(2, '0')
  const mm = String(p.mo).padStart(2, '0')
  const yyyy = String(p.y)
  if (p.h === 0 && p.mi === 0) {
    return `${dd}/${mm}/${yyyy}`
  }
  const hh = String(p.h).padStart(2, '0')
  const mi = String(p.mi).padStart(2, '0')
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`
}
