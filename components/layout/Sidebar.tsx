'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, BookOpen, Users, GraduationCap, LogOut, FileText, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { signOut } from 'next-auth/react'
import Image from 'next/image'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: CalendarDays },
  { href: '/classes',   label: 'Classes',   icon: BookOpen },
  { href: '/staff',     label: 'Staff',      icon: Users },
  { href: '/students',  label: 'Students',  icon: GraduationCap },
  { href: '/invoicing', label: 'Invoicing', icon: FileText },
  { href: '/finance',   label: 'Finance',   icon: TrendingUp },
]

interface SidebarProps {
  user?: { name?: string | null; email?: string | null; image?: string | null }
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="flex w-56 flex-col bg-gradient-to-b from-[#002F67] to-[#011f42] px-3 py-6">
      {/* Logo */}
      <div className="mb-8 px-3">
        <span className="text-lg font-bold tracking-tight text-white">EXL OS</span>
        <p className="text-xs text-blue-200/70">Tutoring Centre</p>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
              pathname === href || pathname.startsWith(href + '/')
                ? 'bg-white/15 text-white shadow-sm'
                : 'text-blue-200/80 hover:bg-white/10 hover:text-white'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>

      {/* User + sign-out — pushed to bottom */}
      {user && (
        <div className="mt-auto pt-4 border-t border-white/10">
          <div className="flex items-center gap-2 px-3 py-2">
            {user.image ? (
              <Image
                src={user.image}
                alt={user.name ?? 'Admin'}
                width={28}
                height={28}
                className="rounded-full ring-2 ring-white/20"
              />
            ) : (
              <div className="h-7 w-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-medium text-white">
                {(user.name ?? user.email ?? 'A')[0].toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-white">{user.name ?? 'Admin'}</p>
              {user.email && (
                <p className="truncate text-[10px] text-blue-200/60">{user.email}</p>
              )}
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="flex-shrink-0 rounded p-1 text-blue-200/60 hover:text-white hover:bg-white/10 transition-colors"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
