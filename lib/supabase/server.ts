import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // El método setAll fue llamado desde un Server Component.
            // Se puede ignorar si hay middleware que refresca sesiones.
          }
        },
      },
    }
  )
}

/** Get authenticated user + role in a single call. Redirects to /login if no session. */
export async function getAuthUser(): Promise<{
  supabase: SupabaseClient
  userId: string
  userRole: 'jefe' | 'operadora'
}> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return {
    supabase,
    userId: user.id,
    userRole: (profile?.role || 'operadora') as 'jefe' | 'operadora',
  }
}
