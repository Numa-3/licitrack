'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import LogoutButton from './LogoutButton'
import NotificationPanel from '@/components/features/NotificationPanel'
import {
  LayoutDashboard,
  ClipboardList,
  FileText,
  FilePlus,
  Truck,
  Activity,
  Eye,
  Building2,
  Users,
  Landmark,
  Receipt,
  Radar,
  Calendar,
  Settings,
  Menu,
  ChevronRight,
  Bell,
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
    label: 'SECOP',
    items: [
      { href: '/secop/radar', label: 'Radar', icon: Radar },
      { href: '/secop/seguimiento', label: 'Seguimiento', icon: Eye },
      { href: '/secop/calendario', label: 'Calendario', icon: Calendar },
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

function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

// ── Sidebar ───────────────────────────────────────────────────
export default function Sidebar({ profile }: Props) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  return (
    <>
      {/* Mobile header bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 flex items-center px-4 z-50 border-b"
        style={{ backgroundColor: '#111216', borderColor: '#2A2B30' }}>
        <button onClick={() => setOpen(true)} className="p-2 -ml-2 text-slate-400 hover:text-white rounded-lg transition-colors">
          <Menu size={22} />
        </button>
        <div className="flex items-center ml-3 gap-2">
          <div className="w-5 h-5 rounded bg-indigo-500 text-white flex items-center justify-center font-bold text-[10px]">L</div>
          <h1 className="text-sm font-semibold text-white">LiciTrack</h1>
        </div>
      </div>

      {/* Mobile overlay */}
      {open && (
        <div className="md:hidden fixed inset-0 bg-black/60 z-50" onClick={() => setOpen(false)}>
          <aside className="w-[260px] h-full flex flex-col" style={{ backgroundColor: '#111216' }} onClick={e => e.stopPropagation()}>
            <SidebarContent profile={profile} pathname={pathname} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[260px] flex-col shrink-0 border-r"
        style={{ backgroundColor: '#111216', borderColor: '#2A2B30' }}>
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
      {/* Workspace header */}
      <div className="h-14 flex items-center px-4 border-b shrink-0 gap-3"
        style={{ borderColor: '#2A2B30' }}>
        <div className="w-6 h-6 rounded bg-indigo-500 text-white flex items-center justify-center font-bold text-xs shrink-0">
          L
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white leading-none">LiciTrack</p>
          <p className="text-[11px] mt-0.5 truncate" style={{ color: '#6B7280' }}>Leticia, Amazonas</p>
        </div>
        <ChevronRight size={14} className="text-slate-600 shrink-0" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#374151 transparent' }}>
        {navSections.map(section => (
          <div key={section.label}>
            <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#4B5563' }}>
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map(item => {
                const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'))
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={`relative flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                      isActive
                        ? 'text-white font-medium'
                        : 'hover:text-slate-200'
                    }`}
                    style={{
                      backgroundColor: isActive ? '#24252A' : undefined,
                      color: isActive ? '#fff' : '#9CA3AF',
                    }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = '#1E1F24' }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = '' }}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[3px] bg-indigo-500 rounded-r-full"
                        style={{ boxShadow: '0 0 8px rgba(99,102,241,0.6)' }} />
                    )}
                    <Icon size={16} strokeWidth={isActive ? 2 : 1.5} className={isActive ? 'text-indigo-400' : ''} />
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
            <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#4B5563' }}>
              Admin
            </p>
            <Link
              href="/admin"
              onClick={onNavigate}
              className="relative flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors"
              style={{
                backgroundColor: pathname === '/admin' ? '#24252A' : undefined,
                color: pathname === '/admin' ? '#fff' : '#9CA3AF',
              }}
              onMouseEnter={e => { if (pathname !== '/admin') (e.currentTarget as HTMLElement).style.backgroundColor = '#1E1F24' }}
              onMouseLeave={e => { if (pathname !== '/admin') (e.currentTarget as HTMLElement).style.backgroundColor = '' }}
            >
              {pathname === '/admin' && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[3px] bg-indigo-500 rounded-r-full"
                  style={{ boxShadow: '0 0 8px rgba(99,102,241,0.6)' }} />
              )}
              <Settings size={16} strokeWidth={pathname === '/admin' ? 2 : 1.5} className={pathname === '/admin' ? 'text-indigo-400' : ''} />
              <span>Administracion</span>
            </Link>
          </div>
        )}
      </nav>

      {/* Notification Bell */}
      <NotificationBell />

      {/* Profile & logout */}
      <div className="p-3 border-t shrink-0" style={{ borderColor: '#2A2B30' }}>
        {profile && (
          <div className="flex items-center gap-3 px-2 py-2 rounded-md mb-2"
            style={{ backgroundColor: 'transparent' }}>
            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
              {getInitials(profile.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{profile.name}</p>
              <p className="text-xs capitalize truncate" style={{ color: '#6B7280' }}>{profile.role}</p>
            </div>
          </div>
        )}
        <LogoutButton />
      </div>
    </>
  )
}

// ── Notification Bell ─────────────────────────────────────────
function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0)
  const [showPanel, setShowPanel] = useState(false)

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?unread_only=true&limit=0')
      if (res.ok) {
        const json = await res.json()
        setUnreadCount(json.unread_count || 0)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchCount()
    const interval = setInterval(fetchCount, 60_000)
    return () => clearInterval(interval)
  }, [fetchCount])

  return (
    <>
      <div className="px-3 pb-1 border-t pt-2" style={{ borderColor: '#2A2B30' }}>
        <button
          onClick={() => setShowPanel(true)}
          className="relative flex items-center gap-2.5 w-full px-3 py-1.5 rounded-md text-sm transition-colors"
          style={{ color: '#9CA3AF' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1E1F24')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
        >
          <Bell size={16} strokeWidth={1.5} />
          <span>Notificaciones</span>
          {unreadCount > 0 && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>
      <NotificationPanel
        open={showPanel}
        onClose={() => setShowPanel(false)}
        onCountChange={setUnreadCount}
      />
    </>
  )
}
