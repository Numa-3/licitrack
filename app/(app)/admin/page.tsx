import { getAuthUser } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import AdminResetClient from '@/components/features/AdminResetClient'
import AdminUsersClient from '@/components/features/AdminUsersClient'

export default async function AdminPage() {
  const { userRole, userId } = await getAuthUser()

  if (userRole !== 'jefe') notFound()

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Administracion</h1>
      <p className="text-sm text-gray-500 mb-8">Herramientas de gestion y limpieza de datos</p>

      <div className="space-y-10">
        <AdminUsersClient currentUserId={userId} />

        <div className="border-t border-gray-200 pt-10">
          <AdminResetClient />
        </div>
      </div>
    </div>
  )
}
