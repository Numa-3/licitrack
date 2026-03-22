'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import LogoutButton from './LogoutButton'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/contracts/new', label: 'Nuevo Contrato', icon: '➕' },
  { href: '/shipments', label: 'Envíos', icon: '🚚' },
  { href: '/activity', label: 'Actividad', icon: '📋' },
  { href: '/organizations', label: 'Mis Empresas', icon: '🏢' },
  { href: '/suppliers', label: 'Proveedores', icon: '🤝' },
  { href: '/invoices', label: 'Facturas', icon: '🧾' },
]

type Props = {
  profile: { name: string; role: string } | null
}

export default function Sidebar({ profile }: Props) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  return (
    <>
      {/* Mobile header bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-gray-200 flex items-center px-4 z-50">
        <button onClick={() => setOpen(true)} className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-gray-900 ml-3">LiciTrack</h1>
      </div>

      {/* Mobile overlay */}
      {open && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-50" onClick={() => setOpen(false)}>
          <aside className="w-64 h-full bg-white flex flex-col" onClick={e => e.stopPropagation()}>
            <SidebarContent profile={profile} pathname={pathname} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 bg-white border-r border-gray-200 flex-col shrink-0">
        <SidebarContent profile={profile} pathname={pathname} />
      </aside>
    </>
  )
}

function SidebarContent({ profile, pathname, onNavigate }: {
  profile: { name: string; role: string } | null
  pathname: string
  onNavigate?: () => void
}) {
  return (
    <>
      {/* Logo */}
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900">LiciTrack</h1>
        <p className="text-xs text-gray-500 mt-1">Gestión de licitaciones</p>
      </div>

      {/* Navegación */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-gray-100 text-gray-900 font-medium'
                  : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
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
    </>
  )
}
