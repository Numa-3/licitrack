import { getAuthUser } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import SupplierDetailClient from '@/components/features/SupplierDetailClient'

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ supplierId: string }>
}) {
  const [{ supplierId }, { supabase, userRole, userId }] = await Promise.all([
    params,
    getAuthUser(),
  ])

  const [{ data: supplier }, { data: documents }] = await Promise.all([
    supabase
      .from('suppliers')
      .select('id, name, type, whatsapp, email, city, has_rut, has_chamber_cert, iva_exempt, bbva_registered, trusted, notes, created_at, deleted_at')
      .eq('id', supplierId)
      .is('deleted_at', null)
      .single(),
    supabase
      .from('supplier_documents')
      .select(`
        id, type, file_url, verified, verified_by, expires_at, notes, uploaded_by, created_at,
        profiles!supplier_documents_uploaded_by_fkey ( name )
      `)
      .eq('supplier_id', supplierId)
      .order('created_at', { ascending: false }),
  ])

  if (!supplier) notFound()

  return (
    <SupplierDetailClient
      supplier={supplier}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      documents={(documents || []) as any}
      userRole={userRole}
      currentUserId={userId}
    />
  )
}
