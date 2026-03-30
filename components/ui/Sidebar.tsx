'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import LogoutButton from './LogoutButton'
import {
  LayoutDashboard,
  ClipboardList,
  FileText,
  FilePlus,
  Truck,
  Activity,
  Building2,
  Users,
  Landmark,
  Receipt,
  Settings,
  Menu,
  type LucideIcon,
} from 'lucide-react'

// ── Navigation config ─────────────────────────────────────────
type NavSection = {
  label: string
  items: { href: string; label: string; icon: LucideIcon }[]
}

const navSections: NavSection[] = [
  {
    label: 'General',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/tasks', label: 'Apuntes', icon: ClipboardList },
    ],
  },
  {
    label: 'Operaciones',
    items: [
      { href: '/contracts', label: 'Contratos', icon: FileText },
      { href: '/contracts/new', label: 'Nuevo Contrato', icon: FilePlus },
      { href: '/shipments', label: 'Envios', icon: Truck },
      { href: '/invoices', label: 'Facturas', icon: Receipt },
    ],
  },
  {
    label: 'Directorio',
    items: [
      { href: '/organizations', label: 'Mis Empresas', icon: Building2 },
      { href: '/suppliers', label: 'Proveedores', icon: Users },
      { href: '/entities', label: 'Entidades', icon: Landmark },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { href: '/activity', label: 'Actividad', icon: Activity },
    ],
  },
]

type Props = {
  profile: { name: string; role: string } | null
}

// ── Sidebar ───────────────────────────────────────────────────
export default function Sidebar({ profile }: Props) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  return (
    <>
      {/* Mobile header bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-slate-900 flex items-center px-4 z-50">
        <button onClick={() => setOpen(true)} className="p-2 -ml-2 text-slate-400 hover:text-white rounded-lg transition-colors">
          <Menu size={22} />
        </button>
        <h1 className="text-lg font-bold text-white ml-3">LiciTrack</h1>
      </div>

      {/* Mobile overlay */}
      {open && (
        <div className="md:hidden fixed inset-0 bg-black/60 z-50" onClick={() => setOpen(false)}>
          <aside className="w-64 h-full bg-slate-900 flex flex-col" onClick={e => e.stopPropagation()}>
            <SidebarContent profile={profile} pathname={pathname} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 bg-slate-900 flex-col shrink-0">
        <SidebarContent profile={profile} pathname={pathname} />
      </aside>
    </>
  )
}

// ── Sidebar Content ───────────────────────────────────────────
function SidebarContent({ profile, pathname, onNavigate }: {
  profile: { name: string; role: string } | null
  pathname: string
  onNavigate?: () => void
}) {
  return (
    <>
      {/* Logo */}
      <div className="px-5 py-6">
        <h1 className="text-xl font-bold text-white tracking-tight">LiciTrack</h1>
        <p className="text-xs text-slate-500 mt-0.5">Gestion de licitaciones</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-6 overflow-y-auto">
        {navSections.map(section => (
          <div key={section.label}>
            <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map(item => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      isActive
                        ? 'bg-slate-800 text-white font-medium'
                        : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                    }`}
                  >
                    <Icon size={18} strokeWidth={isActive ? 2 : 1.5} />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}

        {/* Admin — jefe only */}
        {profile?.role === 'jefe' && (
          <div>
            <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Admin
            </p>
            <Link
              href="/admin"
              onClick={onNavigate}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                pathname === '/admin'
                  ? 'bg-slate-800 text-white font-medium'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <Settings size={18} strokeWidth={pathname === '/admin' ? 2 : 1.5} />
              <span>Administracion</span>
            </Link>
          </div>
        )}
      </nav>

      {/* Profile & logout */}
      <div className="p-4 border-t border-slate-800 space-y-3">
        {profile && (
          <div>
            <p className="text-sm font-medium text-slate-200 truncate">{profile.name}</p>
            <p className="text-xs text-slate-500 capitalize">{profile.role}</p>
          </div>
        )}
        <LogoutButton />
        <p className="text-[11px] text-slate-600">Leticia, Amazonas</p>
      </div>
    </>
  )
}
