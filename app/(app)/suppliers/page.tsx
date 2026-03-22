import { createServerSupabaseClient } from '@/lib/supabase/server'
import SuppliersClient from '@/components/features/SuppliersClient'

export default async function SuppliersPage() {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Rol del usuario
  let userRole = 'operadora'
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profile) userRole = profile.role
  }

  // Proveedores activos con documentos (para badges de verificación)
  const { data: suppliers } = await supabase
    .from('suppliers')
    .select(`
      id, name, type, whatsapp, email, city, has_rut, has_chamber_cert,
      iva_exempt, bbva_registered, trusted, notes, created_at, deleted_at,
      supplier_documents ( type, verified, expires_at )
    `)
    .is('deleted_at', null)
    .order('name')

  return (
    <SuppliersClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      suppliers={(suppliers || []) as any}
      userRole={userRole}
      currentUserId={user?.id || ''}
    />
  )
}
