import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Verifies the current user is authenticated and has the 'jefe' role.
 * Returns the supabase client and user id, or a Response error.
 */
export async function requireJefe() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: Response.json({ error: 'No autorizado' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'jefe') {
    return { error: Response.json({ error: 'Acceso denegado' }, { status: 403 }) }
  }

  return { supabase, userId: user.id }
}

/**
 * Extracts the storage path from a Supabase Storage public URL.
 */
export function extractStoragePath(fileUrl: string, bucket: string): string | null {
  try {
    const url = new URL(fileUrl)
    const parts = url.pathname.split(`/object/public/${bucket}/`)
    return parts[1] || null
  } catch {
    return null
  }
}
