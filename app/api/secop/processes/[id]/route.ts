import { requireJefe } from '@/lib/admin'
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
  const { radar_state, monitoring_enabled, custom_name } = body as {
    radar_state?: string
    monitoring_enabled?: boolean
    custom_name?: string | null
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
