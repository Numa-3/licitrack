import { createClient } from '@supabase/supabase-js'

/**
 * Supabase client with service_role key — server-only.
 * Bypasses RLS. Use only in admin API routes.
 */
export function createAdminSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
