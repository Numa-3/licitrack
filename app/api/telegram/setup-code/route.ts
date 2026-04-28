import { requireJefe } from '@/lib/admin'

const CODE_TTL_MINUTES = 10

function generateCode(): string {
  // 6 dígitos crypto-random — leading zeros válidos.
  const buf = crypto.getRandomValues(new Uint8Array(4))
  const n = ((buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3]) >>> 0
  return String(n % 1_000_000).padStart(6, '0')
}

export async function POST() {
  const auth = await requireJefe()
  if ('error' in auth) return auth.error
  const { supabase, userId } = auth

  // Borrar códigos previos pendientes del mismo jefe — solo uno activo a la vez.
  await supabase
    .from('telegram_setup_codes')
    .delete()
    .eq('created_by', userId)
    .is('used_at', null)

  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString()

  // Tirar de nuevo si hay colisión (probabilidad: 1/1M, pero RLS responderá con 23505).
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateCode()
    const { error } = await supabase
      .from('telegram_setup_codes')
      .insert({ code, created_by: userId, expires_at: expiresAt })

    if (!error) {
      return Response.json({ code, expires_at: expiresAt })
    }
    // 23505 = unique violation → reintentar con otro código
    if (error.code !== '23505') {
      return Response.json({ error: error.message }, { status: 500 })
    }
  }

  return Response.json({ error: 'No se pudo generar código único' }, { status: 500 })
}
