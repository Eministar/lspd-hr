'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Users, TrendingUp, TrendingDown, UserX, StickyNote, ScrollText,
  Shield, GraduationCap, UserCog, Settings, LogOut, ListChecks, Briefcase,
  Menu, X, Archive, KeyRound, Timer, Upload, CalendarDays, ClipboardCheck, Download,
  ClipboardList, Megaphone, FileText, Search, BookOpen, Heart, Sparkles, ArrowDownToLine,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { APP_VERSION_LABEL, releaseBuildShort } from '@/lib/release'
import { GITHUB_REPO_URL } from '@/lib/site'
import { useAuth } from '@/context/auth-context'
import { hasAnyPermission, hasPermission, type Permission } from '@/lib/permissions'
import Image from 'next/image'

interface NavItem {
  name: string
  href: string
  icon: LucideIcon
  permission?: Permission
}

interface NavContentProps {
  pathname: string
  onNavigate: () => void
  user: { displayName: string; avatarUrl?: string | null; permissions?: string[] | null; groups?: { id: string; name: string }[] } | null
  logout: () => Promise<void>
}

const mainNav: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, permission: 'dashboard:view' },
  { name: 'Dienstordnung', href: '/dienstordnung', icon: FileText },
  { name: 'Kalender', href: '/calendar', icon: CalendarDays, permission: 'calendar:view' },
  { name: 'Dienstzeiten', href: '/duty-times', icon: Timer, permission: 'duty-times:view' },
  { name: 'Streifenboard', href: '/patrol-board', icon: ClipboardList, permission: 'patrol-board:view' },
  { name: 'Officers', href: '/officers', icon: Users, permission: 'officers:view' },
  { name: 'Gekündigte Officers', href: '/terminated-officers', icon: Archive, permission: 'officers:view' },
  { name: 'Beförderungen', href: '/promotions', icon: TrendingUp, permission: 'rank-changes:view' },
  { name: 'Degradierungen', href: '/demotions', icon: TrendingDown, permission: 'rank-changes:view' },
  { name: 'Kündigungen', href: '/terminations', icon: UserX, permission: 'terminations:view' },
  { name: 'Probezeiten', href: '/probations', icon: ClipboardCheck, permission: 'probations:view' },
  { name: 'Notizen', href: '/notes', icon: StickyNote, permission: 'notes:view' },
  { name: 'Protokoll', href: '/logs', icon: ScrollText, permission: 'logs:view' },
]

const tasksNav: NavItem[] = [
  { name: 'Academy', href: '/academy', icon: ListChecks, permission: 'academy:view' },
  { name: 'HR Abteilung', href: '/hr', icon: Briefcase, permission: 'hr:view' },
  { name: 'S.R.U.', href: '/sru', icon: Shield, permission: 'sru:view' },
  { name: 'Detective Unit', href: '/detective', icon: Search, permission: 'detective:view' },
]

const adminNav: NavItem[] = [
  { name: 'Ränge', href: '/admin/ranks', icon: Shield, permission: 'ranks:manage' },
  { name: 'Ausbildungen', href: '/admin/trainings', icon: GraduationCap, permission: 'trainings:manage' },
  { name: 'Units', href: '/admin/units', icon: Briefcase, permission: 'units:manage' },
  { name: 'Benutzer', href: '/admin/users', icon: UserCog, permission: 'users:manage' },
  { name: 'Benutzergruppen', href: '/admin/user-groups', icon: Users, permission: 'groups:manage' },
  { name: 'API-Tokens', href: '/admin/api-tokens', icon: KeyRound, permission: 'groups:manage' },
  { name: 'Exporte', href: '/exports', icon: Download, permission: 'exports:view' },
  { name: 'System-Update', href: '/admin/update', icon: ArrowDownToLine, permission: 'users:manage' },
  { name: 'Update senden', href: '/admin/update-announcer', icon: Megaphone, permission: 'updates:send' },
  { name: 'Uploads', href: '/admin/uploads', icon: Upload, permission: 'settings:manage' },
  { name: 'Einstellungen', href: '/admin/settings', icon: Settings, permission: 'settings:manage' },
]

const developerNav: NavItem[] = [
  { name: 'API-Dokumentation', href: '/docs', icon: BookOpen },
]

const accountNav: NavItem[] = [
  { name: 'Mein Konto', href: '/account', icon: KeyRound },
]

function GitHubLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  )
}

function isActivePath(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname.startsWith(href)
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 mb-1.5 mt-1 text-[9.5px] font-bold text-[#4a6585] uppercase tracking-[0.16em] flex items-center gap-1.5">
      <span className="h-px flex-1 bg-gradient-to-r from-[#18385f]/60 to-transparent" />
      <span>{children}</span>
      <span className="h-px flex-1 bg-gradient-to-l from-[#18385f]/60 to-transparent" />
    </p>
  )
}

function SectionDivider() {
  return <div className="my-3 mx-3 h-px bg-gradient-to-r from-transparent via-[#d4af37]/10 to-transparent" />
}

function NavLink({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate: () => void }) {
  const active = isActivePath(pathname, item.href)
  const Icon = item.icon

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        'group relative flex items-center gap-3 px-3 py-[9px] rounded-lg text-[13.5px] transition-all duration-200 overflow-hidden',
        active
          ? 'bg-gradient-to-r from-[#d4af37] to-[#c9a52f] text-[#071b33] font-semibold shadow-[0_2px_8px_rgba(212,175,55,0.25)]'
          : 'text-[#8ea4bd] hover:bg-[#0d2444] hover:text-[#edf4fb] hover:translate-x-0.5'
      )}
    >
      {!active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-0 rounded-r-full bg-[#d4af37] transition-all duration-300 group-hover:h-[14px]" />
      )}
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[20px] rounded-r-full bg-[#f0d060] shadow-[0_0_8px_rgba(240,208,96,0.6)]" />
      )}
      <Icon size={18} strokeWidth={active ? 2.25 : 1.75} className={cn('shrink-0 transition-transform duration-200', !active && 'group-hover:scale-110')} />
      <span className="truncate">{item.name}</span>
      {active && (
        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#071b33]/40" />
      )}
    </Link>
  )
}

function NavContent({ pathname, onNavigate, user, logout }: NavContentProps) {
  // API-Dokumentation ist für alle authentifizierten User sichtbar — daher
  // zeigen wir den Admin-Block immer, sobald irgendein Admin-Bereich freigeschaltet
  // ist. Die einzelnen Items werden unten weiter gefiltert.
  const showAdmin = hasAnyPermission(user, [
    'ranks:manage',
    'trainings:manage',
    'units:manage',
    'users:manage',
    'groups:manage',
    'exports:view',
    'updates:send',
    'settings:manage',
  ])

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className="relative h-[52px] w-[52px] rounded-[13px] bg-gradient-to-br from-[#0a2040] to-[#071833] border border-[#d4af37]/30 flex items-center justify-center overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(212,175,55,0.08)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.12),transparent_70%)]" />
            <Image src="/shield.webp" alt="LSPD" width={46} height={46} className="rounded-full relative" priority />
          </div>
          <div className="min-w-0">
            <span className="block text-[15px] font-semibold text-white leading-tight tracking-[-0.01em]">LSPD</span>
            <span className="block text-[10.5px] font-semibold text-[#d4af37]/80 tracking-[0.14em] uppercase mt-0.5">Department</span>
          </div>
        </div>
        <div className="relative mt-4 h-px bg-gradient-to-r from-transparent via-[#d4af37]/25 to-transparent">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-[#d4af37] shadow-[0_0_6px_rgba(212,175,55,0.6)]" />
        </div>
      </div>

      <nav className="flex-1 px-2.5 space-y-[2px] overflow-y-auto">
        <SectionLabel>Navigation</SectionLabel>
        {mainNav
          .filter((item) => !item.permission || hasPermission(user, item.permission))
          .map((item) => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />)}

        {hasAnyPermission(user, ['academy:view', 'hr:view', 'sru:view', 'detective:view']) && (
          <>
            <SectionDivider />
            <SectionLabel>Aufgaben</SectionLabel>
            {tasksNav
              .filter((item) => !item.permission || hasPermission(user, item.permission))
              .map((item) => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />)}
          </>
        )}

        {showAdmin && (
          <>
            <SectionDivider />
            <SectionLabel>Administration</SectionLabel>
            {adminNav
              .filter((item) => !item.permission || hasPermission(user, item.permission))
              .map((item) => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />)}
          </>
        )}

        <SectionDivider />
        <SectionLabel>Entwickler</SectionLabel>
        {developerNav.map((item) => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />)}

        <SectionDivider />
        <SectionLabel>Konto</SectionLabel>
        {accountNav.map((item) => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />)}
      </nav>

      {/* Credits Footer — Coded by Eministar */}
      <div className="px-3 pt-2 pb-1.5 shrink-0">
        <div className="relative overflow-hidden rounded-[10px] bg-gradient-to-br from-[#0a1e38]/80 via-[#0a1e38]/60 to-[#0a1e38]/80 border border-[#d4af37]/15 px-3 py-2.5 group">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(212,175,55,0.08),transparent_60%)] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <a
            href="https://eministar.dev"
            target="_blank"
            rel="noopener noreferrer"
            onClick={onNavigate}
            className="relative flex items-center gap-2 cursor-pointer"
            title="eministar.dev öffnen"
          >
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-[6px] bg-gradient-to-br from-[#d4af37] to-[#b89930] text-[#071b33] shadow-[0_1px_3px_rgba(212,175,55,0.3)] group-hover:scale-110 transition-transform duration-300">
              <Heart size={11} strokeWidth={2.5} fill="#071b33" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-[0.14em] text-[#7c93af] font-semibold leading-none mb-1">Coded with</p>
              <p className="text-[12.5px] font-semibold text-white leading-none truncate">
                by <span className="bg-gradient-to-r from-[#d4af37] via-[#f0d060] to-[#d4af37] bg-clip-text text-transparent group-hover:from-[#f0d060] group-hover:via-[#d4af37] group-hover:to-[#f0d060] transition-all">Eministar</span>
              </p>
            </div>
            <Sparkles size={11} className="text-[#d4af37]/50 group-hover:text-[#d4af37] group-hover:rotate-12 transition-all duration-300" />
          </a>
          <div className="relative mt-2 pt-2 border-t border-[#d4af37]/10 flex items-center justify-between text-[9px] leading-none">
            <span className="font-semibold text-[#9f8b42]" title="Version">{APP_VERSION_LABEL}</span>
            <span className="font-mono text-[#4f6680]" title="Build">{releaseBuildShort()}</span>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onNavigate}
              title="Repository"
              className="inline-flex items-center gap-1 text-[#5f7691] transition-colors hover:text-[#d4af37]"
            >
              <GitHubLogo className="h-2.5 w-2.5 shrink-0" />
              <span>GitHub</span>
            </a>
          </div>
        </div>
      </div>

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
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 h-12 flex items-center justify-between px-3 sidebar-gradient border-b border-[#d4af37]/15 backdrop-blur-md">
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

      <aside className="hidden lg:flex lg:flex-col lg:w-[244px] lg:min-h-screen sidebar-gradient border-r border-[#d4af37]/10 fixed left-0 top-0 bottom-0 z-30">
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
              transition={{ type: 'spring', damping: 30, stiffness: 400 }}
              className="lg:hidden fixed left-0 top-0 bottom-0 w-[244px] sidebar-gradient border-r border-[#d4af37]/10 z-50 shadow-2xl"
            >
              <button
                onClick={() => setMobileOpen(false)}
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
