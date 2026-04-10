import { requireJefe } from '@/lib/admin'
import { normalizeRecord, fetchSecopProcesses } from '@/lib/secop/dataset'

/**
 * POST /api/secop/processes/manual
 * Add a process manually by URL, NTC ID, or process reference.
 *
 * Body: { input: string } — can be:
 *   - Full SECOP URL: "https://community.secop.gov.co/...?noticeUID=CO1.NTC.5398889..."
 *   - NTC ID: "CO1.NTC.5398889"
 *   - Process reference or ID
 */
export async function POST(request: Request) {
  const auth = await requireJefe()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const body = await request.json()
  const { input } = body as { input?: string }

  if (!input?.trim()) {
    return Response.json({ error: 'Se requiere URL, NTC ID o referencia del proceso' }, { status: 400 })
  }

  const trimmed = input.trim()

  // Extract NTC ID from input
  const ntcMatch = trimmed.match(/CO1\.NTC\.\d+/)
  const ntcId = ntcMatch ? ntcMatch[0] : null

  // Extract process ID pattern
  const processIdMatch = trimmed.match(/CO1\.\w+\.\d+/)
  const searchId = processIdMatch ? processIdMatch[0] : trimmed

  // First check if already in our DB
  let query = supabase
    .from('secop_processes')
    .select('id, secop_process_id, objeto, entidad, monitoring_enabled')
    .eq('secop_process_id', searchId)
    .limit(1)

  if (ntcId) {
    // Also check by NTC ID — separate query to avoid .or() string interpolation
    const { data: byNtc } = await supabase
      .from('secop_processes')
      .select('id, secop_process_id, objeto, entidad, monitoring_enabled')
      .eq('secop_ntc_id', ntcId)
      .limit(1)
      .maybeSingle()
    if (byNtc) {
      query = supabase
        .from('secop_processes')
        .select('id, secop_process_id, objeto, entidad, monitoring_enabled')
        .eq('id', byNtc.id)
    }
  }

  const { data: existing } = await query.maybeSingle()

  if (existing) {
    // Enable monitoring if not already
    if (!existing.monitoring_enabled) {
      await supabase
        .from('secop_processes')
        .update({ monitoring_enabled: true, source: 'manual', secop_ntc_id: ntcId })
        .eq('id', existing.id)
    }

    return Response.json({
      id: existing.id,
      message: 'Proceso ya existe — monitoreo activado',
      process: existing,
    })
  }

  // Try to find in SECOP public API (Socrata)
  // Search by process ID
  try {
    const processes = await fetchSecopProcesses({
      keywords: [searchId],
    }, 5)

    if (processes.length > 0) {
      const proc = processes[0]
      const { data: inserted, error } = await supabase
        .from('secop_processes')
        .insert({
          ...proc,
          source: 'manual',
          radar_state: 'followed',
          monitoring_enabled: true,
          secop_ntc_id: ntcId,
        })
        .select('id, secop_process_id, objeto, entidad')
        .single()

      if (error) {
        // Might be duplicate
        if (error.code === '23505') {
          return Response.json({ error: 'Proceso ya existe en el sistema' }, { status: 409 })
        }
        return Response.json({ error: error.message }, { status: 500 })
      }

      return Response.json({
        id: inserted.id,
        message: 'Proceso agregado desde SECOP API publica',
        process: inserted,
      }, { status: 201 })
    }
  } catch (err) {
    console.error('[Manual] SECOP API search failed:', err instanceof Error ? err.message : err)
  }

  // If not found in API, create minimal record for monitoring
  if (ntcId) {
    const { data: inserted, error } = await supabase
      .from('secop_processes')
      .insert({
        secop_process_id: ntcId,
        entidad: 'Por detectar',
        objeto: `Proceso ${ntcId}`,
        dataset_hash: '',
        source: 'manual',
        radar_state: 'followed',
        monitoring_enabled: true,
        secop_ntc_id: ntcId,
      })
      .select('id, secop_process_id, objeto')
      .single()

    if (error) return Response.json({ error: error.message }, { status: 500 })

    return Response.json({
      id: inserted.id,
      message: 'Proceso agregado — datos completos se obtendran en el proximo monitoreo',
      process: inserted,
    }, { status: 201 })
  }

  return Response.json(
    { error: 'No se pudo encontrar el proceso. Verifica el ID o URL.' },
    { status: 404 },
  )
}
