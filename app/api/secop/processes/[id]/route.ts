import { requireJefe } from '@/lib/admin'
import { extractNoticeUid } from '@/lib/secop/precontractual'
import { NextRequest } from 'next/server'

/**
 * PATCH /api/secop/processes/[id]
 *
 * Update radar_state of a process.
 * Body: { radar_state: 'reviewing' | 'followed' | 'dismissed' | 'new' }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireJefe()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { id } = await params
  const body = await request.json()
  const { radar_state, monitoring_enabled, custom_name, phase_override, url_publica } = body as {
    radar_state?: string
    monitoring_enabled?: boolean
    custom_name?: string | null
    phase_override?: 'pre' | 'contractual' | 'post' | null
    url_publica?: string
  }

  const updates: Record<string, unknown> = {}

  if (radar_state !== undefined) {
    const validStates = ['new', 'reviewing', 'followed', 'dismissed']
    if (!validStates.includes(radar_state)) {
      return Response.json(
        { error: `radar_state debe ser uno de: ${validStates.join(', ')}` },
        { status: 400 },
      )
    }
    updates.radar_state = radar_state
  }

  if (monitoring_enabled !== undefined) {
    updates.monitoring_enabled = monitoring_enabled
  }

  if (custom_name !== undefined) {
    const trimmed = typeof custom_name === 'string' ? custom_name.trim() : ''
    updates.custom_name = trimmed.length > 0 ? trimmed.slice(0, 120) : null
  }

  if (phase_override !== undefined) {
    const validPhases = ['pre', 'contractual', 'post']
    if (phase_override !== null && !validPhases.includes(phase_override)) {
      return Response.json(
        { error: `phase_override debe ser uno de: ${validPhases.join(', ')} o null` },
        { status: 400 },
      )
    }
    updates.phase_override = phase_override
  }

  // Relink manual: el usuario pegó un nuevo URL (típicamente porque SECOP creó
  // una adenda con un notice_uid distinto). Extraemos el CO1.NTC.X del URL,
  // actualizamos notice_uid + secop_process_id, y reseteamos last_monitored_at
  // para forzar re-scrape en el próximo ciclo del worker.
  if (url_publica !== undefined) {
    const trimmed = typeof url_publica === 'string' ? url_publica.trim() : ''
    const noticeUid = extractNoticeUid(trimmed)
    if (!noticeUid) {
      return Response.json(
        { error: 'No pude extraer CO1.NTC.X del URL. Asegurate de pegar un link de SECOP válido.' },
        { status: 400 },
      )
    }
    updates.url_publica = `https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=${noticeUid}&isFromPublicArea=True&isModal=False`
    updates.notice_uid = noticeUid
    updates.secop_process_id = noticeUid
    updates.last_monitored_at = null
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('secop_processes')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json(data)
}

/**
 * DELETE /api/secop/processes/[id]
 *
 * Hard delete del proceso. Cascadea a secop_process_snapshots,
 * secop_process_changes y notifications vía FK ON DELETE CASCADE
 * configurados en migrations 002 y 006. Solo jefe.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireJefe()
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { id } = await params

  const { error } = await supabase
    .from('secop_processes')
    .delete()
    .eq('id', id)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
