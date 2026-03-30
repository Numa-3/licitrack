import { requireJefe } from '@/lib/admin'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'

export async function GET() {
  const auth = await requireJefe()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  // Profiles for name/role
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, name, role, created_at')
    .order('created_at', { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Auth users for email and banned status
  const adminClient = createAdminSupabaseClient()
  const { data: authData } = await adminClient.auth.admin.listUsers()
  const authMap = new Map(
    (authData?.users ?? []).map(u => [
      u.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- banned_at exists at runtime but missing from Supabase TS types
      { email: u.email, banned_at: (u as any).banned_at as string | null },
    ])
  )

  const users = (profiles ?? []).map(p => ({
    ...p,
    email: authMap.get(p.id)?.email ?? '',
    banned: !!authMap.get(p.id)?.banned_at,
  }))

  return Response.json(users)
}

export async function POST(request: NextRequest) {
  const auth = await requireJefe()
  if ('error' in auth) return auth.error
  const { userId } = auth

  const body = await request.json()
  const { name, email, password } = body as {
    name?: string
    email?: string
    password?: string
  }

  if (!name || !email || !password) {
    return Response.json(
      { error: 'Nombre, email y contraseña son obligatorios' },
      { status: 400 }
    )
  }

  if (password.length < 6) {
    return Response.json(
      { error: 'La contraseña debe tener al menos 6 caracteres' },
      { status: 400 }
    )
  }

  const adminClient = createAdminSupabaseClient()

  // Create auth user — the handle_new_user trigger creates the profile automatically
  const { data: newUser, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role: 'operadora' },
  })

  if (error) {
    if (error.message.includes('already been registered')) {
      return Response.json(
        { error: 'Ya existe un usuario con ese email' },
        { status: 409 }
      )
    }
    return Response.json({ error: error.message }, { status: 500 })
  }

  // Log the action
  const supabase = auth.supabase
  await supabase.from('activity_log').insert({
    user_id: userId,
    action: 'create',
    entity_type: 'user',
    entity_id: newUser.user.id,
    details: { name, email },
  })

  return Response.json(
    { id: newUser.user.id, name, email, role: 'operadora' },
    { status: 201 }
  )
}
