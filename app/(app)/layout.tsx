import { createServerSupabaseClient } from '@/lib/supabase/server'
import Sidebar from '@/components/ui/Sidebar'
import ConnectionBanner from '@/components/ui/ConnectionBanner'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabaseClient()

  // Obtiene el usuario autenticado
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Obtiene el perfil con nombre y rol
  let profile: { name: string; role: string } | null = null
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('name, role')
      .eq('id', user.id)
      .single()
    profile = data
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <ConnectionBanner />
      <Sidebar profile={profile} />

      {/* Contenido principal */}
      <main className="flex-1 overflow-auto pt-14 md:pt-0">
        {children}
      </main>
    </div>
  )
}
