'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Users, ArrowUpDown, UserX, StickyNote, ScrollText, ChartNoAxesCombined,
  Shield, GraduationCap, UserCog, Settings, LogOut, Briefcase,
  Menu, X, KeyRound, Timer, Upload, CalendarDays, Download,
  ClipboardList, Megaphone, FileText, Gavel,
  History, DatabaseZap, Search, ChevronDown } from 'lucide-react'
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
  { name: 'Sanktionen', href: '/sanktionen', icon: Gavel },
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
  return <Link href={item.href} aria-current={active ? 'page' : undefined} onClick={onNavigate}
    className={cn('lspd-nav-link flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors', active ? 'font-semibold text-[#e5c681]' : 'text-[#a8b8cb] hover:bg-white/[0.04] hover:text-white')}>
    <Icon size={17} strokeWidth={1.7} className="shrink-0" />
    <span className="truncate">{item.name}</span>
  </Link>
}

function NavGroup({ title, items, pathname, onNavigate, searching }: { title: string; items: NavItem[]; pathname: string; onNavigate: () => void; searching: boolean }) {
  const active = items.some(item => isActivePath(pathname, item.href))
  const [expanded, setExpanded] = useState(active)
  if (!items.length) return null
  const open = searching || expanded
  return <section className="lspd-nav-group">
    <button type="button" aria-expanded={open} disabled={searching} onClick={() => setExpanded(!open)} className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-[12px] font-medium text-[#91a4bc] hover:bg-white/[0.04] hover:text-white">
      {title}<ChevronDown size={14} className={cn('transition-transform duration-150', open && 'rotate-180')} />
    </button>
    {open && <div className="space-y-0.5 pb-2">{items.map(item => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />)}</div>}
  </section>
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
    <div className="flex flex-col h-full">
      <div className="px-5 py-6">
        <Link href="/" onClick={onNavigate} className="flex items-center gap-3">
          <Image src="/shield.webp" alt="" width={38} height={38} priority />
          <div><span className="block text-base font-semibold tracking-tight text-white">LSPD</span><span className="text-[11px] text-[#91a4bc]">Personal & Organisation</span></div>
        </Link>
      </div>
      <div className="relative mx-3 mb-4">
        <Search size={15} className="pointer-events-none absolute left-3 top-3 text-[#91a4bc]" />
        <input aria-label="Navigation durchsuchen" placeholder="Seite finden …" value={query} onChange={event => setQuery(event.target.value)} className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.03] pl-9 pr-8 text-[12px] text-white placeholder:text-[#91a4bc]" />
        {query && <button type="button" aria-label="Navigationssuche leeren" onClick={() => setQuery('')} className="absolute right-1 top-1 p-2 text-[#91a4bc]"><X size={14} /></button>}
      </div>
      <nav aria-label="Hauptnavigation" className="flex-1 overflow-y-auto px-3 lg:pb-12">
        <div className="space-y-1 pb-4">{primary.map(item => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />)}</div>
        {groups.map(group => <NavGroup key={`${group.title}:${pathname}:${group.items.some(item => isActivePath(pathname, item.href))}`} {...group} pathname={pathname} onNavigate={onNavigate} searching={!!query.trim()} />)}
        {primary.length === 0 && groups.every(group => group.items.length === 0) && <p role="status" className="px-3 py-4 text-xs text-[#91a4bc]">Keine Seite gefunden.</p>}
      </nav>

      <div className="px-2.5 pb-2.5 shrink-0">
        {user && (
          <div className="group/user relative flex items-center gap-2 px-2 py-1.5 rounded-md bg-[#0a1e38]/50 border border-white/[0.04] hover:border-[#d4af37]/20 transition-colors">
            {user.avatarUrl ? (
              <span
                className="h-7 w-7 shrink-0 rounded-full bg-cover bg-center shadow-[0_1px_3px_rgba(212,175,55,0.25)] ring-1 ring-[#d4af37]/25"
                style={{ backgroundImage: `url(${user.avatarUrl})` }}
                aria-label={user.displayName}
              />
            ) : (
              <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-[#d4af37] to-[#b89930] flex items-center justify-center text-[10px] font-bold text-[#071b33] shadow-[0_1px_3px_rgba(212,175,55,0.25)]">
                {user.displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[11.5px] font-medium text-white/90 truncate leading-tight">{user.displayName}</p>
              <p className="text-[9.5px] text-[#4a6585] truncate leading-tight mt-0.5">
                {user.groups?.[0]?.name ?? 'Mitglied'}
              </p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="p-1.5 rounded-md text-[#6b8299] hover:text-[#d4af37] hover:bg-[#0d2444] transition-all -mr-0.5"
              title="Abmelden"
            >
              <LogOut size={13} strokeWidth={1.75} />
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

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 h-12 flex items-center justify-between px-3 lspd-sidebar border-b border-[#d4af37]/15 backdrop-blur-md">
        <button
          onClick={() => setMobileOpen(true)}
          className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-[#d4af37] hover:bg-[#0d2444] transition-colors"
          aria-label="Menü öffnen"
        >
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2">
          <Image src="/shield.webp" alt="LSPD" width={22} height={22} className="rounded-full" priority />
          <span className="text-[13px] font-semibold text-white tracking-[-0.01em]">LSPD Department</span>
        </div>
        <div className="w-9" aria-hidden />
      </div>

      <aside className="hidden lg:flex lg:flex-col lg:w-[244px] lg:min-h-screen lspd-sidebar border-r border-[#d4af37]/10 fixed left-0 top-0 bottom-0 z-30">
        <NavContent pathname={pathname} onNavigate={closeMobile} user={user} logout={logout} />
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="lg:hidden fixed inset-0 bg-[#061426]/75 backdrop-blur-sm z-40"
            />
            <motion.aside
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="lg:hidden fixed left-0 top-0 bottom-0 w-[244px] lspd-sidebar border-r border-[#d4af37]/10 z-50 shadow-2xl"
            >
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Menü schließen"
                className="absolute top-4 right-3 p-1.5 rounded-md text-[#6b8299] hover:text-[#d4af37]"
              >
                <X size={16} />
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
