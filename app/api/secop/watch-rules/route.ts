import { requireAuth, requireJefe } from '@/lib/admin'
import { NextRequest } from 'next/server'

/**
 * GET /api/secop/watch-rules
 * List all watch rules.
 */
export async function GET() {
  const auth = await requireAuth()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { data, error } = await supabase
    .from('secop_watch_rules')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json(data)
}

/**
 * POST /api/secop/watch-rules
 * Create a new watch rule. Only jefe.
 *
 * Body: { name, rule_json, enabled? }
 */
export async function POST(request: NextRequest) {
  const auth = await requireJefe()
  if ('error' in auth) return auth.error
  const { supabase, userId } = auth

  const body = await request.json()
  const { name, rule_json, enabled } = body as {
    name?: string
    rule_json?: Record<string, unknown>
    enabled?: boolean
  }

  if (!name?.trim()) {
    return Response.json({ error: 'El nombre es obligatorio' }, { status: 400 })
  }

  const insert: Record<string, unknown> = {
    name: name.trim(),
    rule_json: rule_json || {},
    created_by: userId,
  }
  if (enabled !== undefined) insert.enabled = enabled

  const { data, error } = await supabase
    .from('secop_watch_rules')
    .insert(insert)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json(data, { status: 201 })
}
