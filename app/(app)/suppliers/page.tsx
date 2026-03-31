import { getAuthUser } from '@/lib/supabase/server'
import SuppliersClient from '@/components/features/SuppliersClient'

export default async function SuppliersPage() {
  const { supabase, userRole, userId } = await getAuthUser()

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
      currentUserId={userId}
    />
  )
}
