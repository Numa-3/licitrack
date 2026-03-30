import { requireJefe } from '@/lib/admin'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireJefe()
  if ('error' in auth) return auth.error
  const { supabase, userId } = auth
  const { id } = await params

  const body = await request.json()
  const { banned, name } = body as { banned?: boolean; name?: string }

  // Update name
  if (typeof name === 'string') {
    if (!name.trim()) {
      return Response.json({ error: 'El nombre no puede estar vacio' }, { status: 400 })
    }

    const { error: nameErr } = await supabase
      .from('profiles')
      .update({ name: name.trim() })
      .eq('id', id)

    if (nameErr) return Response.json({ error: nameErr.message }, { status: 500 })

    // Also update auth metadata so the trigger stays consistent
    const adminClient = createAdminSupabaseClient()
    await adminClient.auth.admin.updateUserById(id, {
      user_metadata: { name: name.trim() },
    })

    return Response.json({ success: true, name: name.trim() })
  }

  // Ban/unban
  if (typeof banned !== 'boolean') {
    return Response.json(
      { error: 'Se requiere "name" o "banned"' },
      { status: 400 }
    )
  }

  if (id === userId) {
    return Response.json(
      { error: 'No puedes desactivar tu propia cuenta' },
      { status: 400 }
    )
  }

  const adminClient = createAdminSupabaseClient()

  const { error } = await adminClient.auth.admin.updateUserById(id, {
    ban_duration: banned ? '876000h' : 'none', // 876000h ≈ 100 years = permanent
  })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Log the action
  await supabase.from('activity_log').insert({
    user_id: userId,
    action: banned ? 'ban' : 'unban',
    entity_type: 'user',
    entity_id: id,
    details: { banned },
  })

  return Response.json({ success: true, banned })
}
