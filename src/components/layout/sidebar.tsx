'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Users, TrendingUp, TrendingDown, UserX, StickyNote, ScrollText,
  Shield, GraduationCap, UserCog, Settings, LogOut, ListChecks, Briefcase,
  Menu, X, ExternalLink, Archive, KeyRound,
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
  user: { displayName: string; permissions?: string[] | null } | null
  logout: () => Promise<void>
}

const mainNav: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Mein Konto', href: '/account', icon: KeyRound },
  { name: 'Officers', href: '/officers', icon: Users },
  { name: 'Gekündigte Officers', href: '/terminated-officers', icon: Archive },
  { name: 'Beförderungen', href: '/promotions', icon: TrendingUp },
  { name: 'Degradierungen', href: '/demotions', icon: TrendingDown },
  { name: 'Kündigungen', href: '/terminations', icon: UserX },
  { name: 'Notizen', href: '/notes', icon: StickyNote },
  { name: 'Protokoll', href: '/logs', icon: ScrollText },
]

const tasksNav: NavItem[] = [
  { name: 'Academy', href: '/academy', icon: ListChecks },
  { name: 'HR Abteilung', href: '/hr', icon: Briefcase },
  { name: 'SRU', href: '/sru', icon: Shield },
]

const adminNav: NavItem[] = [
  { name: 'Ränge', href: '/admin/ranks', icon: Shield, permission: 'ranks:manage' },
  { name: 'Ausbildungen', href: '/admin/trainings', icon: GraduationCap, permission: 'trainings:manage' },
  { name: 'Units', href: '/admin/units', icon: Briefcase, permission: 'units:manage' },
  { name: 'Benutzer', href: '/admin/users', icon: UserCog, permission: 'users:manage' },
  { name: 'Benutzergruppen', href: '/admin/user-groups', icon: Users, permission: 'groups:manage' },
  { name: 'Einstellungen', href: '/admin/settings', icon: Settings, permission: 'settings:manage' },
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

function NavLink({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate: () => void }) {
  const active = isActivePath(pathname, item.href)
  const Icon = item.icon

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        'group relative flex items-center gap-3 px-3 py-[9px] rounded-lg text-[13.5px] transition-all duration-150',
        active
          ? 'bg-gradient-to-r from-[#d4af37] to-[#c9a52f] text-[#071b33] font-semibold shadow-[0_2px_8px_rgba(212,175,55,0.25)]'
          : 'text-[#8ea4bd] hover:bg-[#0d2444] hover:text-[#d4d4d4]'
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[18px] rounded-r-full bg-[#f0d060]" />
      )}
      <Icon size={18} strokeWidth={active ? 2 : 1.75} />
      {item.name}
    </Link>
  )
}

function NavContent({ pathname, onNavigate, user, logout }: NavContentProps) {
  const showAdmin = hasAnyPermission(user, [
    'ranks:manage',
    'trainings:manage',
    'units:manage',
    'users:manage',
    'groups:manage',
    'settings:manage',
  ])

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-5 pb-5">
        <div className="flex items-center gap-3">
          <div className="h-[52px] w-[52px] rounded-[13px] bg-gradient-to-br from-[#0a2040] to-[#071833] border border-[#d4af37]/30 flex items-center justify-center overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(212,175,55,0.08)]">
            <Image src="/shield.webp" alt="LSPD" width={46} height={46} className="rounded-full" priority />
          </div>
          <div>
            <span className="block text-[15px] font-semibold text-white leading-tight tracking-[-0.01em]">LSPD HR</span>
            <span className="block text-[10.5px] font-semibold text-[#d4af37]/80 tracking-[0.1em] uppercase mt-0.5">Department</span>
          </div>
        </div>
        <div className="gold-line mt-4" />
      </div>

      <nav className="flex-1 px-2.5 space-y-[2px] overflow-y-auto">
        <p className="px-3 mb-1.5 text-[10px] font-semibold text-[#4a6585] uppercase tracking-[0.1em]">Navigation</p>
        {mainNav.map((item) => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />)}

        <div className="gold-line my-3 mx-2" />
        <p className="px-3 mb-1.5 text-[10px] font-semibold text-[#4a6585] uppercase tracking-[0.1em]">Aufgaben</p>
        {tasksNav.map((item) => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />)}

        {showAdmin && (
          <>
            <div className="gold-line my-3 mx-2" />
            <p className="px-3 mb-1.5 text-[10px] font-semibold text-[#4a6585] uppercase tracking-[0.1em]">Administration</p>
            {adminNav
              .filter((item) => !item.permission || hasPermission(user, item.permission))
              .map((item) => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />)}
          </>
        )}
      </nav>

      <div className="px-2.5 pt-1 pb-1.5 shrink-0 space-y-1.5">
        <div className="gold-line mb-2 mx-2 opacity-70" />

        <div className="flex flex-wrap items-center justify-center gap-1 px-1">
          <span className="inline-flex items-center rounded border border-[#d4af37]/28 bg-[#07182e]/70 px-[5px] py-[1px] text-[9px] font-semibold tracking-tight text-[#c9b068] shadow-[inset_0_1px_0_rgba(212,175,55,0.06)]">
            {APP_VERSION_LABEL}
          </span>
          <span
            className="inline-flex items-center gap-0.5 rounded border border-[#234568]/70 bg-[#0a1a33]/55 px-[5px] py-[1px] font-mono text-[9px] text-[#5c7490] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
            title="Build / Commit"
          >
            <span className="text-[7px] font-sans font-medium text-[#4a6585]">build</span>
            {releaseBuildShort()}
          </span>
        </div>

        <a
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onNavigate}
          title="Repository"
          className={cn(
            'flex items-center justify-center gap-1 rounded-md border border-[#234568]/50 bg-[#0a1a33]/35 py-[3px] text-[9px] font-medium text-[#6b8299] transition-colors',
            'hover:border-[#d4af37]/30 hover:text-[#b8c5d4] hover:bg-[#0d2444]/60'
          )}
        >
          <GitHubLogo className="h-3 w-3 shrink-0 text-[#b0b8c2]" />
          <span>GitHub</span>
          <ExternalLink size={8} className="opacity-45 shrink-0" />
        </a>

        <p className="px-1 text-center text-[8px] leading-tight text-[#4a6585]/95">
          <span className="text-[#d4af37]/55">&lt;3</span> Eministar
        </p>
      </div>

      <div className="px-2.5 pb-2.5 shrink-0">
        <div className="gold-line mb-2 mx-2" />
        {user && (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-[#0a1e38]/50 border border-white/[0.04]">
            <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-[#d4af37] to-[#b89930] flex items-center justify-center text-[10px] font-bold text-[#071b33] shadow-[0_1px_3px_rgba(212,175,55,0.25)]">
              {user.displayName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11.5px] font-medium text-white/90 truncate leading-tight">{user.displayName}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="p-1 rounded-md text-[#6b8299] hover:text-[#d4af37] transition-colors -mr-0.5"
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
          <span className="text-[13px] font-semibold text-white tracking-[-0.01em]">LSPD HR</span>
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
