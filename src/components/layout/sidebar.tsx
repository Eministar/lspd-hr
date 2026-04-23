'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Users, TrendingUp, TrendingDown, UserX, StickyNote, ScrollText,
  Shield, GraduationCap, UserCog, Settings, LogOut, Moon, Sun,
  Menu, X
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/context/theme-context'
import { useAuth } from '@/context/auth-context'
import Image from 'next/image'

const mainNav = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Officers', href: '/officers', icon: Users },
  { name: 'Beförderungen', href: '/promotions', icon: TrendingUp },
  { name: 'Degradierungen', href: '/demotions', icon: TrendingDown },
  { name: 'Kündigungen', href: '/terminations', icon: UserX },
  { name: 'Notizen', href: '/notes', icon: StickyNote },
  { name: 'Protokoll', href: '/logs', icon: ScrollText },
]

const adminNav = [
  { name: 'Ränge', href: '/admin/ranks', icon: Shield },
  { name: 'Ausbildungen', href: '/admin/trainings', icon: GraduationCap },
  { name: 'Benutzer', href: '/admin/users', icon: UserCog },
  { name: 'Einstellungen', href: '/admin/settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const { theme, toggleTheme } = useTheme()
  const { user, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'HR'

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  const NavLink = ({ item }: { item: typeof mainNav[0] }) => {
    const active = isActive(item.href)
    return (
      <Link
        href={item.href}
        onClick={() => setMobileOpen(false)}
        className={cn(
          'flex items-center gap-3 px-3 py-[9px] rounded-lg text-[13.5px] transition-colors duration-100',
          active
            ? 'bg-[#f5f5f5] dark:bg-[#1a1a1a] text-[#111] dark:text-white font-medium'
            : 'text-[#666] dark:text-[#888] hover:bg-[#f9f9f9] dark:hover:bg-[#151515] hover:text-[#111] dark:hover:text-[#ddd]'
        )}
      >
        <item.icon size={18} strokeWidth={1.75} />
        {item.name}
      </Link>
    )
  }

  const NavContent = () => (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="h-[42px] w-[42px] rounded-[10px] bg-[#111] dark:bg-white flex items-center justify-center overflow-hidden">
            <Image src="/shield.webp" alt="LSPD" width={28} height={28} className="invert dark:invert-0" />
          </div>
          <span className="text-[16px] font-semibold text-[#111] dark:text-white">LSPD HR</span>
        </div>
      </div>

      <nav className="flex-1 px-2 space-y-[2px] overflow-y-auto">
        {mainNav.map((item) => <NavLink key={item.href} item={item} />)}

        {isAdmin && (
          <>
            <div className="h-px bg-[#eee] dark:bg-[#1a1a1a] my-3 mx-2" />
            {adminNav.map((item) => <NavLink key={item.href} item={item} />)}
          </>
        )}
      </nav>

      <div className="px-2 pb-3 space-y-[2px]">
        <div className="h-px bg-[#eee] dark:bg-[#1a1a1a] mb-2 mx-2" />
        <button
          onClick={toggleTheme}
          className="flex items-center gap-3 w-full px-3 py-[9px] rounded-lg text-[13.5px] text-[#666] dark:text-[#888] hover:bg-[#f9f9f9] dark:hover:bg-[#151515] hover:text-[#111] dark:hover:text-[#ddd] transition-colors duration-100"
        >
          {theme === 'dark' ? <Sun size={18} strokeWidth={1.75} /> : <Moon size={18} strokeWidth={1.75} />}
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </button>

        {user && (
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="h-[28px] w-[28px] rounded-full bg-gradient-to-br from-[#e0e0e0] to-[#c0c0c0] dark:from-[#333] dark:to-[#222] flex items-center justify-center text-[11px] font-semibold text-[#666] dark:text-[#aaa]">
              {user.displayName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-[#111] dark:text-[#ddd] truncate leading-tight">{user.displayName}</p>
            </div>
            <button
              onClick={logout}
              className="p-1 rounded-md text-[#ccc] dark:text-[#555] hover:text-[#666] dark:hover:text-[#aaa] transition-colors"
              title="Abmelden"
            >
              <LogOut size={15} strokeWidth={1.75} />
            </button>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 p-2.5 rounded-xl bg-white dark:bg-[#111] shadow-sm"
      >
        <Menu size={18} className="text-[#666]" />
      </button>

      <aside className="hidden lg:flex lg:flex-col lg:w-[240px] lg:min-h-screen bg-[#fafafa] dark:bg-[#0a0a0a] border-r border-[#f0f0f0] dark:border-[#1a1a1a] fixed left-0 top-0 bottom-0 z-30">
        <NavContent />
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="lg:hidden fixed inset-0 bg-black/20 dark:bg-black/40 z-40"
            />
            <motion.aside
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ type: 'spring', damping: 30, stiffness: 400 }}
              className="lg:hidden fixed left-0 top-0 bottom-0 w-[240px] bg-[#fafafa] dark:bg-[#0a0a0a] border-r border-[#f0f0f0] dark:border-[#1a1a1a] z-50"
            >
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute top-4 right-3 p-1.5 rounded-md text-[#999] hover:text-[#666]"
              >
                <X size={16} />
              </button>
              <NavContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="hidden lg:block lg:w-[240px] lg:shrink-0" />
    </>
  )
}
