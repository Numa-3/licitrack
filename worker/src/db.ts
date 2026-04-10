import { createClient } from '@supabase/supabase-js'
import { config } from './config.js'

/**
 * Supabase admin client for the worker.
 * Uses service_role key — bypasses RLS.
 */
export const admin = createClient(
  config.supabaseUrl,
  config.supabaseServiceKey,
  { auth: { autoRefreshToken: false, persistSession: false } },
)
