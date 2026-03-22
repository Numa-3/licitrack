import { createServerSupabaseClient } from '@/lib/supabase/server'
import OrganizationsClient from '@/components/features/OrganizationsClient'

export default async function OrganizationsPage() {
  const supabase = await createServerSupabaseClient()

  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name, nit, invoice_email, notes, rut_url, chamber_cert_url')
    .order('name')

  return <OrganizationsClient initialOrgs={orgs || []} />
}
