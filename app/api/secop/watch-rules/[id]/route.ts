import { requireJefe } from '@/lib/admin'
import { NextRequest } from 'next/server'

/**
 * PATCH /api/secop/watch-rules/[id]
 * Update a watch rule. Only jefe.
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
  const { name, rule_json, enabled } = body as {
    name?: string
    rule_json?: Record<string, unknown>
    enabled?: boolean
  }

  const update: Record<string, unknown> = {}
  if (name !== undefined) update.name = name.trim()
  if (rule_json !== undefined) update.rule_json = rule_json
  if (enabled !== undefined) update.enabled = enabled

  if (Object.keys(update).length === 0) {
    return Response.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('secop_watch_rules')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json(data)
}

/**
 * DELETE /api/secop/watch-rules/[id]
 * Delete a watch rule. Only jefe.
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
    .from('secop_watch_rules')
    .delete()
    .eq('id', id)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
