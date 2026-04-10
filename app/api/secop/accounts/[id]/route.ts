import { requireJefe } from '@/lib/admin'
import { encrypt } from '@/lib/secop/crypto'
import { NextRequest } from 'next/server'

/**
 * PATCH /api/secop/accounts/[id]
 * Update a SECOP account.
 * Body: { name?, username?, password?, is_active? }
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
  const { name, username, password, is_active, monitored_entities, entity_name } = body as {
    name?: string
    username?: string
    password?: string
    is_active?: boolean
    monitored_entities?: string[]
    entity_name?: string
  }

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name.trim()
  if (username !== undefined) updates.username = username.trim()
  if (password !== undefined) updates.password_encrypted = encrypt(password)
  if (is_active !== undefined) updates.is_active = is_active
  if (monitored_entities !== undefined) updates.monitored_entities = monitored_entities
  if (entity_name !== undefined) updates.entity_name = entity_name

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'No hay campos para actualizar' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('secop_accounts')
    .update(updates)
    .eq('id', id)
    .select('id, name, username, is_active, last_login_at, last_sync_at, process_count, created_at')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json(data)
}

/**
 * DELETE /api/secop/accounts/[id]
 * Disassociates processes from the account, then deletes the account.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireJefe()
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { id } = await params

  // Disassociate processes first (FK constraint would block delete otherwise)
  await supabase
    .from('secop_processes')
    .update({ account_id: null, monitoring_enabled: false })
    .eq('account_id', id)

  const { error } = await supabase
    .from('secop_accounts')
    .delete()
    .eq('id', id)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
