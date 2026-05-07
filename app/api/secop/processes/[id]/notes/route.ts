import { requireAuth } from '@/lib/admin'
import { NextRequest } from 'next/server'

/**
 * GET /api/secop/processes/[id]/notes
 *
 * Returns timeline of notes for a process, ordered by created_at DESC.
 * By default filters out soft-deleted notes. If `?include_deleted=true`
 * AND the caller is a jefe, also includes deleted ones (auditoría).
 *
 * Operadoras nunca ven notas borradas, sin importar el query param.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth()
  if ('error' in auth) return auth.error
  const { supabase, role } = auth
  const { id: processId } = await params

  const url = new URL(request.url)
  const includeDeleted = url.searchParams.get('include_deleted') === 'true' && role === 'jefe'

  // Fetch notes — embeddings to profile via FK don't work directly in Supabase
  // PostgREST without a configured relationship name, so we hydrate emails in
  // a second query. With note volumes < 100 per process this is trivial.
  let query = supabase
    .from('secop_process_notes')
    .select('*')
    .eq('process_id', processId)
    .order('created_at', { ascending: false })

  if (!includeDeleted) {
    query = query.is('deleted_at', null)
  }

  const { data: notes, error } = await query
  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Hydrate author + deleted_by emails in one round trip.
  const profileIds = new Set<string>()
  for (const n of notes || []) {
    if (n.author_id) profileIds.add(n.author_id)
    if (n.deleted_by) profileIds.add(n.deleted_by)
  }

  const profileMap: Record<string, string> = {}
  if (profileIds.size > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email')
      .in('id', Array.from(profileIds))
    for (const p of profiles || []) {
      profileMap[p.id] = p.email
    }
  }

  const enriched = (notes || []).map(n => ({
    ...n,
    author_email: profileMap[n.author_id] || null,
    deleted_by_email: n.deleted_by ? (profileMap[n.deleted_by] || null) : null,
  }))

  return Response.json({ data: enriched })
}

/**
 * POST /api/secop/processes/[id]/notes
 *
 * Body: { content: string }  (1–2000 chars after trim)
 * Creates a note authored by the current user. Available to any auth role.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth()
  if ('error' in auth) return auth.error
  const { supabase, userId } = auth
  const { id: processId } = await params

  const body = await request.json().catch(() => ({}))
  const rawContent = (body as { content?: unknown }).content
  if (typeof rawContent !== 'string') {
    return Response.json({ error: 'content debe ser string' }, { status: 400 })
  }
  const content = rawContent.trim()
  if (content.length === 0) {
    return Response.json({ error: 'La nota no puede estar vacía' }, { status: 400 })
  }
  if (content.length > 2000) {
    return Response.json({ error: 'La nota excede 2000 caracteres' }, { status: 400 })
  }

  const { data: note, error } = await supabase
    .from('secop_process_notes')
    .insert({
      process_id: processId,
      author_id: userId,
      content,
    })
    .select('*')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Hydrate author email for the freshly-created row
  const { data: profile } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .single()

  return Response.json({
    data: {
      ...note,
      author_email: profile?.email || null,
      deleted_by_email: null,
    },
  }, { status: 201 })
}
