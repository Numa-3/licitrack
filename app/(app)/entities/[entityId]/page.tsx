import { getAuthUser } from '@/lib/supabase/server'
import EntityDetailClient from '@/components/features/EntityDetailClient'
import { notFound } from 'next/navigation'

export default async function EntityDetailPage({
  params,
}: {
  params: Promise<{ entityId: string }>
}) {
  const [{ entityId }, { supabase, userRole, userId }] = await Promise.all([
    params,
    getAuthUser(),
  ])

  const [{ data: entity }, { data: documents }, { data: contracts }] = await Promise.all([
    supabase
      .from('contracting_entities')
      .select('id, name, nit, address, city, contact_name, phone, email, notes, created_at, deleted_at')
      .eq('id', entityId)
      .is('deleted_at', null)
      .single(),
    supabase
      .from('entity_documents')
      .select('id, type, file_url, verified, verified_by, expires_at, notes, uploaded_by, created_at, profiles:profiles!entity_documents_uploaded_by_fkey ( name )')
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false }),
    supabase
      .from('contracts')
      .select('id, name, type, status, created_at, organizations ( name )')
      .eq('entity_id', entityId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ])

  if (!entity) notFound()

  return (
    <EntityDetailClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      entity={entity as any}
      documents={(documents || []) as any}
      contracts={(contracts || []) as any}
      userRole={userRole}
      currentUserId={userId}
    />
  )
}
