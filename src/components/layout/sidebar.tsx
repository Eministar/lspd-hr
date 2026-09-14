'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Users, ArrowUpDown, UserX, StickyNote, ScrollText, ChartNoAxesCombined,
  Shield, GraduationCap, UserCog, Settings, LogOut, Briefcase,
  Menu, X, KeyRound, Timer, Upload, CalendarDays, Download,
  ClipboardList, Megaphone, FileText, Gavel, Scale,
  History, DatabaseZap, Search, ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/context/auth-context'
import { hasPermission, type Permission } from '@/lib/permissions'
import Image from 'next/image'
import { useFetch } from '@/hooks/use-fetch'
import { unitIconComponent } from '@/components/units/unit-icon'
import type { NavigationUnit } from '@/lib/unit-navigation'

interface NavItem {
  name: string
  href: string
  icon: LucideIcon
  permission?: Permission
  color?: string
}

interface NavContentProps {
  pathname: string
  onNavigate: () => void
  user: { displayName: string; avatarUrl?: string | null; permissions?: string[] | null; groups?: { id: string; name: string }[] } | null
  logout: () => Promise<void>
}

const mainNav: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, permission: 'dashboard:view' },
  { name: 'Statistiken', href: '/statistics', icon: ChartNoAxesCombined, permission: 'dashboard:view' },
  { name: 'Ordnungen', href: '/ordnungen', icon: FileText },
  { name: 'Kalender', href: '/calendar', icon: CalendarDays, permission: 'calendar:view' },
  { name: 'Dienstzeiten', href: '/duty-times', icon: Timer, permission: 'duty-times:view' },
  { name: 'Streifenboard', href: '/patrol-board', icon: ClipboardList, permission: 'patrol-board:view' },
  { name: 'Officers', href: '/officers', icon: Users, permission: 'officers:view' },
  { name: 'Anzeigen', href: '/anzeigen', icon: Gavel, permission: 'reports:view' },
  { name: 'Up-/D-Rank-Listen', href: '/promotions', icon: ArrowUpDown, permission: 'rank-changes:view' },
  { name: 'Kündigungen', href: '/terminations', icon: UserX, permission: 'terminations:view' },
  // Ohne `permission`: Sanktionen sind für jeden eingeloggten Officer einsehbar.
  { name: 'Sanktionen', href: '/sanktionen', icon: Scale },
  { name: 'Notizen', href: '/notes', icon: StickyNote, permission: 'notes:view' },
  { name: 'Protokoll', href: '/logs', icon: ScrollText, permission: 'logs:view' },
]

const adminNav: NavItem[] = [
  { name: 'Ränge', href: '/admin/ranks', icon: Shield, permission: 'ranks:manage' },
  { name: 'Ausbildungen', href: '/admin/trainings', icon: GraduationCap, permission: 'trainings:manage' },
  { name: 'Units verwalten', href: '/admin/units', icon: Briefcase, permission: 'units:manage' },
  { name: 'Benutzer', href: '/admin/users', icon: UserCog, permission: 'users:manage' },
  { name: 'Benutzergruppen', href: '/admin/user-groups', icon: Users, permission: 'groups:manage' },
  { name: 'API-Tokens', href: '/admin/api-tokens', icon: KeyRound, permission: 'groups:manage' },
  { name: 'Exporte', href: '/exports', icon: Download, permission: 'exports:view' },
  { name: 'Update senden', href: '/admin/update-announcer', icon: Megaphone, permission: 'updates:send' },
  { name: 'Uploads', href: '/admin/uploads', icon: Upload, permission: 'settings:manage' },
  { name: 'Ausweich-Datenbank', href: '/admin/failover', icon: DatabaseZap, permission: 'settings:manage' },
  { name: 'Einstellungen', href: '/admin/settings', icon: Settings, permission: 'settings:manage' },
]

const accountNav: NavItem[] = [
  { name: 'Mein Konto', href: '/account', icon: KeyRound },
  { name: 'Build-Historie', href: '/releases', icon: History },
]

function isActivePath(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

function NavLink({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate: () => void }) {
  const active = isActivePath(pathname, item.href)
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      className={cn(
        'lspd-nav-link group/nav flex h-8 items-center gap-2.5 rounded-[7px] px-2.5 text-[13.5px] transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-gold/45',
        active ? 'bg-white/[0.08] font-medium text-label' : 'text-label-2 hover:bg-white/[0.04] hover:text-label'
      )}
    >
      <Icon
        size={17}
        strokeWidth={1.75}
        className={cn('shrink-0 transition-colors', active ? 'text-gold' : 'text-label-3 group-hover/nav:text-label-2')}
      />
      <span className="truncate">{item.name}</span>
    </Link>
  )
}

function NavGroup({ title, items, pathname, onNavigate, searching }: { title: string; items: NavItem[]; pathname: string; onNavigate: () => void; searching: boolean }) {
  const active = items.some(item => isActivePath(pathname, item.href))
  const [expanded, setExpanded] = useState(active)
  if (!items.length) return null
  const open = searching || expanded
  return (
    <section className="lspd-nav-group pt-3">
      <button
        type="button"
        aria-expanded={open}
        disabled={searching}
        onClick={() => setExpanded(!open)}
        className="group/head flex h-7 w-full items-center gap-1 rounded-[6px] px-2.5 text-[11.5px] font-semibold text-label-3 transition-colors hover:text-label-2 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-gold/45 disabled:cursor-default"
      >
        <span className="flex-1 truncate text-left">{title}</span>
        <ChevronRight
          size={13}
          strokeWidth={2.25}
          className={cn('shrink-0 opacity-60 transition-[rotate,opacity] duration-300 ease-apple group-hover/head:opacity-100', open && 'rotate-90')}
        />
      </button>
      {/* Ausklappen über grid-rows: flüssig ohne Höhenmessung. */}
      <div className={cn('grid transition-[grid-template-rows] duration-300 ease-apple', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="min-h-0 overflow-hidden" inert={!open}>
          <div className="space-y-px pb-1 pt-0.5">
            {items.map(item => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />)}
          </div>
        </div>
      </div>
    </section>
  )
}

function NavContent({ pathname, onNavigate, user, logout }: NavContentProps) {
  const { data: navigationUnits } = useFetch<NavigationUnit[]>(user ? '/api/navigation/units' : null)
  const unitNav: NavItem[] = (navigationUnits ?? []).map((unit) => ({
    name: unit.name,
    href: unit.href,
    icon: unitIconComponent(unit.icon),
    color: unit.color,
  }))
  const [query, setQuery] = useState('')
  const filter = (items: NavItem[]) => items.filter(item => (!item.permission || hasPermission(user, item.permission)) && item.name.toLocaleLowerCase('de').includes(query.trim().toLocaleLowerCase('de')))
  const dailyPaths = ['/', '/officers', '/duty-times', '/patrol-board', '/calendar']
  const primary = filter(mainNav.filter(item => dailyPaths.includes(item.href)))
  const groups = [
    { title: 'Personal & Vorgänge', items: filter(mainNav.filter(item => !dailyPaths.includes(item.href))) },
    { title: 'Units', items: filter(unitNav) },
    { title: 'Administration', items: filter(adminNav) },
    { title: 'Konto & Historie', items: filter(accountNav) },
  ]

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[60px] shrink-0 items-center px-4">
        <Link href="/" onClick={onNavigate} className="flex items-center gap-2.5 rounded-[8px] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-gold/45">
          <Image src="/shield.webp" alt="" width={30} height={30} priority />
          <div className="leading-tight">
            <span className="block text-[14px] font-semibold tracking-[-0.01em] text-label">LSPD</span>
            <span className="block text-[11.5px] text-label-3">Personal & Organisation</span>
          </div>
        </Link>
      </div>

      <div className="relative mx-3 mb-1.5 shrink-0">
        <Search size={14} strokeWidth={2} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-label-3" />
        <input
          aria-label="Navigation durchsuchen"
          placeholder="Seite finden …"
          value={query}
          onChange={event => setQuery(event.target.value)}
          className="h-8 w-full rounded-[8px] border border-transparent bg-white/[0.06] pl-8 pr-8 text-[13px] text-label outline-none transition-[background-color,border-color,box-shadow] duration-150 placeholder:text-label-3 focus:border-gold/60 focus:bg-white/[0.08] focus:ring-[3px] focus:ring-gold/20"
        />
        {query && (
          <button
            type="button"
            aria-label="Navigationssuche leeren"
            onClick={() => setQuery('')}
            className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-white/[0.16] text-label transition-colors hover:bg-white/[0.24]"
          >
            <X size={11} strokeWidth={2.5} />
          </button>
        )}
      </div>

      <nav aria-label="Hauptnavigation" className="flex-1 overflow-y-auto px-2.5 pb-4 lg:pb-[60px]">
        <div className="space-y-px pt-1.5">
          {primary.map(item => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />)}
        </div>
        {groups.map(group => (
          <NavGroup
            key={`${group.title}:${pathname}:${group.items.some(item => isActivePath(pathname, item.href))}`}
            {...group}
            pathname={pathname}
            onNavigate={onNavigate}
            searching={!!query.trim()}
          />
        ))}
        {primary.length === 0 && groups.every(group => group.items.length === 0) && (
          <p role="status" className="px-2.5 py-4 text-[12.5px] text-label-3">Keine Seite gefunden.</p>
        )}
      </nav>

      <div className="shrink-0 border-t border-line px-2.5 py-2.5">
        {user && (
          <div className="flex items-center gap-2.5 rounded-[8px] px-1.5 py-1">
            {user.avatarUrl ? (
              <span
                className="h-7 w-7 shrink-0 rounded-full bg-cover bg-center ring-1 ring-white/10"
                style={{ backgroundImage: `url(${user.avatarUrl})` }}
                aria-label={user.displayName}
              />
            ) : (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-4 text-[11px] font-semibold text-label">
                {user.displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-medium text-label">{user.displayName}</p>
              <p className="mt-0.5 truncate text-[11.5px] text-label-3">{user.groups?.[0]?.name ?? 'Mitglied'}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-label-3 transition-colors hover:bg-white/[0.06] hover:text-label"
              title="Abmelden"
              aria-label="Abmelden"
            >
              <LogOut size={15} strokeWidth={1.75} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  const closeMobile = () => setMobileOpen(false)

  useEffect(() => {
    if (!mobileOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mobileOpen])

  return (
    <>
      {/* Mobile Toolbar */}
      <div className="lspd-toolbar fixed inset-x-0 top-0 z-40 flex h-[52px] items-center justify-between px-2 lg:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-label-2 transition-colors hover:bg-white/[0.06] hover:text-label"
          aria-label="Menü öffnen"
        >
          <Menu size={20} strokeWidth={1.75} />
        </button>
        <div className="flex items-center gap-2">
          <Image src="/shield.webp" alt="LSPD" width={22} height={22} className="rounded-full" priority />
          <span className="text-[14px] font-semibold tracking-[-0.01em] text-label">LSPD Department</span>
        </div>
        <div className="w-9" aria-hidden />
      </div>

      <aside className="lspd-sidebar fixed inset-y-0 left-0 z-30 hidden border-r border-line lg:flex lg:w-[244px] lg:flex-col">
        <NavContent pathname={pathname} onNavigate={closeMobile} user={user} logout={logout} />
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0, transition: { type: 'spring', stiffness: 420, damping: 42 } }}
              exit={{ x: '-100%', transition: { duration: 0.2, ease: [0.32, 0.72, 0, 1] } }}
              className="lspd-sidebar fixed inset-y-0 left-0 z-50 w-[280px] max-w-[85vw] border-r border-line shadow-[var(--shadow-sheet)] lg:hidden"
            >
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Menü schließen"
                className="absolute right-3 top-4 flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.08] text-label-2 transition-colors hover:bg-white/[0.14] hover:text-label"
              >
                <X size={14} strokeWidth={2.25} />
              </button>
              <NavContent pathname={pathname} onNavigate={closeMobile} user={user} logout={logout} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="hidden lg:block lg:w-[244px] lg:shrink-0" />
    </>
  )
}
