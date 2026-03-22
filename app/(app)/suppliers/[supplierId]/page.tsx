import { createServerSupabaseClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import SupplierDetailClient from '@/components/features/SupplierDetailClient'

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ supplierId: string }>
}) {
  const { supplierId } = await params
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

  // Obtener proveedor
  const { data: supplier } = await supabase
    .from('suppliers')
    .select('id, name, type, whatsapp, email, city, has_rut, has_chamber_cert, iva_exempt, bbva_registered, trusted, notes, created_at, deleted_at')
    .eq('id', supplierId)
    .is('deleted_at', null)
    .single()

  if (!supplier) notFound()

  // Documentos del proveedor con quien lo subió
  const { data: documents } = await supabase
    .from('supplier_documents')
    .select(`
      id, type, file_url, verified, verified_by, expires_at, notes, uploaded_by, created_at,
      profiles!supplier_documents_uploaded_by_fkey ( name )
    `)
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false })

  return (
    <SupplierDetailClient
      supplier={supplier}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      documents={(documents || []) as any}
      userRole={userRole}
      currentUserId={user?.id || ''}
    />
  )
}
