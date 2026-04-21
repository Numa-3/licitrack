import { requireJefe } from '@/lib/admin'
import { extractNoticeUid, fetchProcessPhases, summarizeProcess } from '@/lib/secop/precontractual'

/**
 * POST /api/secop/processes/precontractual
 *
 * Add a precontractual process by its public SECOP URL (OpportunityDetail)
 * or by noticeUID. The process is immediately looked up in the public
 * SECOP II API (dataset p6dx-8zbt) — no login required.
 *
 * Body: { input: string }
 *   - "https://community.secop.gov.co/.../OpportunityDetail/Index?noticeUID=CO1.NTC.9200318..."
 *   - "CO1.NTC.9200318"
 */
export async function POST(request: Request) {
  const auth = await requireJefe()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const body = await request.json().catch(() => ({}))
  const input = typeof (body as { input?: unknown }).input === 'string'
    ? ((body as { input: string }).input).trim()
    : ''

  if (!input) {
    return Response.json(
      { error: 'Se requiere un link de OpportunityDetail o un noticeUID (CO1.NTC.xxxxxxx).' },
      { status: 400 },
    )
  }

  const noticeUid = extractNoticeUid(input)
  if (!noticeUid) {
    return Response.json(
      { error: 'No pude encontrar un noticeUID válido en el input. Debe tener el formato CO1.NTC.xxxxxxx.' },
      { status: 400 },
    )
  }

  // If the process already exists in our DB, just enable monitoring
  const { data: existing } = await supabase
    .from('secop_processes')
    .select('id, notice_uid, secop_process_id, entidad, objeto, monitoring_enabled, tipo_proceso')
    .eq('notice_uid', noticeUid)
    .maybeSingle()

  if (existing) {
    if (!existing.monitoring_enabled) {
      await supabase.from('secop_processes')
        .update({ monitoring_enabled: true })
        .eq('id', existing.id)
    }
    return Response.json({
      id: existing.id,
      notice_uid: noticeUid,
      message: 'Proceso ya existe — monitoreo activado',
      process: existing,
    })
  }

  // Fetch from public SECOP II API
  let records
  try {
    records = await fetchProcessPhases(noticeUid)
  } catch (err) {
    return Response.json(
      { error: `Error consultando SECOP: ${err instanceof Error ? err.message : 'desconocido'}` },
      { status: 502 },
    )
  }

  // Scraper-first fallback: si la API pública no tiene el proceso aún,
  // lo insertamos igual con api_pending=true. El worker en su próximo
  // polling (≤30s) lo bootstrappea vía captcha y trae los datos básicos
  // + cronograma. Cada ciclo de monitoreo reintenta la API para enriquecer.
  if (records.length === 0) {
    const { data: inserted, error } = await supabase
      .from('secop_processes')
      .insert({
        secop_process_id: noticeUid, // usa el propio NTC hasta que API lo enriquezca
        notice_uid: noticeUid,
        entidad: 'Pendiente primer scrape',
        objeto: `Proceso ${noticeUid} — enriqueciendo…`,
        url_publica: `https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=${noticeUid}&isFromPublicArea=True&isModal=False`,
        dataset_hash: '',
        source: 'manual',
        radar_state: 'followed',
        monitoring_enabled: true,
        tipo_proceso: 'precontractual',
        api_pending: true,
      })
      .select('id, notice_uid, entidad, objeto, api_pending')
      .single()

    if (error) {
      if (error.code === '23505') {
        return Response.json({ error: 'Proceso ya existe en el sistema' }, { status: 409 })
      }
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({
      id: inserted.id,
      notice_uid: noticeUid,
      message: 'Proceso agregado. Aún no está indexado en la API pública — el worker lo enriquecerá vía captcha en los próximos minutos.',
      process: inserted,
      phases_count: 0,
      api_pending: true,
    }, { status: 201 })
  }

  const summary = summarizeProcess(noticeUid, records)!

  // Insert into secop_processes. We reuse the id_del_proceso of the latest phase
  // as secop_process_id (required unique field).
  const latestPhaseRecord = records[records.length - 1]
  const processId = latestPhaseRecord.id_del_proceso || noticeUid

  const { data: inserted, error } = await supabase
    .from('secop_processes')
    .insert({
      secop_process_id: processId,
      notice_uid: noticeUid,
      referencia_proceso: latestPhaseRecord.referencia_del_proceso || null,
      entidad: summary.entidad || 'Por determinar',
      nit_entidad: summary.nit_entidad,
      objeto: summary.nombre_procedimiento || `Proceso ${noticeUid}`,
      descripcion: summary.descripcion,
      modalidad: summary.modalidad,
      tipo_contrato: summary.tipo_contrato,
      fase: summary.fase_actual,
      estado: summary.estado_actual,
      estado_resumen: summary.estado_resumen,
      valor_estimado: summary.precio_base ? parseFloat(summary.precio_base) : null,
      fecha_publicacion: summary.fecha_publicacion,
      fecha_ultima_pub: summary.fecha_ultima_pub,
      url_publica: summary.url_publica,
      departamento: summary.departamento,
      municipio: summary.municipio,
      duracion: summary.duracion,
      unidad_duracion: summary.unidad_duracion,
      dataset_hash: '',
      source: 'manual',
      radar_state: 'followed',
      monitoring_enabled: true,
      tipo_proceso: 'precontractual',
      id_portafolio: summary.id_portafolio,
      precio_base: summary.precio_base,
      adjudicado: summary.adjudicado,
      nit_adjudicado: summary.proveedor_adjudicado?.nit || null,
      nombre_adjudicado: summary.proveedor_adjudicado?.nombre || null,
      valor_adjudicado: summary.proveedor_adjudicado?.valor || null,
    })
    .select('id, notice_uid, entidad, objeto, fase, estado, adjudicado')
    .single()

  if (error) {
    if (error.code === '23505') {
      return Response.json({ error: 'Proceso ya existe en el sistema' }, { status: 409 })
    }
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({
    id: inserted.id,
    notice_uid: noticeUid,
    message: 'Proceso agregado — el worker lo empezará a monitorear en el próximo ciclo',
    process: inserted,
    phases_count: summary.phases_count,
  }, { status: 201 })
}
