import { requireJefe } from '@/lib/admin'
import { encrypt } from '@/lib/secop/crypto'

/**
 * GET /api/secop/accounts
 * List all SECOP accounts (passwords excluded).
 */
export async function GET() {
  const auth = await requireJefe()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { data, error } = await supabase
    .from('secop_accounts')
    .select('id, name, username, is_active, entity_name, discovered_entities, monitored_entities, last_login_at, last_sync_at, sync_requested_at, process_count, cookies_expire_at, created_at')
    .order('created_at', { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Add session status
  const accounts = (data || []).map(acc => ({
    ...acc,
    session_status: getSessionStatus(acc.cookies_expire_at),
  }))

  return Response.json(accounts)
}

/**
 * POST /api/secop/accounts
 * Create a new SECOP account.
 * Body: { name, username, password }
 */
export async function POST(request: Request) {
  const auth = await requireJefe()
  if ('error' in auth) return auth.error
  const { supabase, userId } = auth

  try {
    const body = await request.json().catch(() => ({}))
    const { name, username, password, entity_name } = body as {
      name?: string
      username?: string
      password?: string
      entity_name?: string
    }

    if (!name?.trim() || !username?.trim() || !password) {
      return Response.json(
        { error: 'name, username y password son requeridos' },
        { status: 400 },
      )
    }

    let passwordEncrypted: string
    try {
      passwordEncrypted = encrypt(password)
    } catch (err) {
      console.error('[accounts:POST] encrypt failed:', err)
      return Response.json(
        {
          error: `Error encriptando password: ${err instanceof Error ? err.message : 'desconocido'}`,
          hint: 'Verifica que SECOP_ENCRYPTION_KEY esté configurada en el entorno.',
        },
        { status: 500 },
      )
    }

    const { data, error } = await supabase
      .from('secop_accounts')
      .insert({
        name: name.trim(),
        username: username.trim(),
        password_encrypted: passwordEncrypted,
        entity_name: entity_name?.trim() || null,
        created_by: userId,
      })
      .select('id, name, username, is_active, entity_name, created_at')
      .single()

    if (error) {
      console.error('[accounts:POST] supabase insert failed:', error)
      return Response.json(
        { error: error.message, code: error.code, details: error.details, hint: error.hint },
        { status: 500 },
      )
    }

    return Response.json(data, { status: 201 })
  } catch (err) {
    console.error('[accounts:POST] unexpected error:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Error inesperado' },
      { status: 500 },
    )
  }
}

function getSessionStatus(expiresAt: string | null): 'active' | 'expired' | 'none' {
  if (!expiresAt) return 'none'
  return new Date(expiresAt).getTime() > Date.now() ? 'active' : 'expired'
}
