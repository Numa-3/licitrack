import { createServerSupabaseClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import AdminResetClient from '@/components/features/AdminResetClient'

export default async function AdminPage() {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) notFound()

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'jefe') notFound()

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Administracion</h1>
      <p className="text-sm text-gray-500 mb-8">Herramientas de gestion y limpieza de datos</p>

      <AdminResetClient />
    </div>
  )
}
