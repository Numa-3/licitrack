import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import LogoutButton from '@/components/ui/LogoutButton'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/contracts/new', label: 'Nuevo Contrato', icon: '➕' },
  { href: '/shipments', label: 'Envíos', icon: '🚚' },
  { href: '/activity', label: 'Actividad', icon: '📋' },
  { href: '/organizations', label: 'Mis Empresas', icon: '🏢' },
  { href: '/suppliers', label: 'Proveedores', icon: '🤝' },
  { href: '/invoices', label: 'Facturas', icon: '🧾' },
]

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
      {/* Barra lateral */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shrink-0">
        {/* Logo */}
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-900">LiciTrack</h1>
          <p className="text-xs text-gray-500 mt-1">Gestión de licitaciones</p>
        </div>

        {/* Navegación */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors text-sm"
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Perfil y logout */}
        <div className="p-4 border-t border-gray-200 space-y-3">
          {profile && (
            <div>
              <p className="text-sm font-medium text-gray-900 truncate">{profile.name}</p>
              <p className="text-xs text-gray-500 capitalize">{profile.role}</p>
            </div>
          )}
          <LogoutButton />
          <p className="text-xs text-gray-400">Leticia, Amazonas</p>
        </div>
      </aside>

      {/* Contenido principal */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
