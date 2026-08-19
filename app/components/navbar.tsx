'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '../../lib/supabase/client'

const NAV_LINKS = [
  { href: '/analiz', label: 'Analiz' },
  { href: '/sicak',  label: 'Sıcak' },
  { href: '/takip',  label: 'Takip' },
]

// ─── Logo mark ────────────────────────────────────────────────────────────────

function LogoMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect width="20" height="20" rx="5" fill="#2563eb" />
      {/* Location pin */}
      <path
        d="M10 4C8.07 4 6.5 5.57 6.5 7.5c0 3.04 3.5 7.5 3.5 7.5s3.5-4.46 3.5-7.5C13.5 5.57 11.93 4 10 4z"
        fill="white"
      />
      <circle cx="10" cy="7.5" r="1.4" fill="#2563eb" />
    </svg>
  )
}

// ─── Navbar ───────────────────────────────────────────────────────────────────

export function Navbar({ showCta = false }: { showCta?: boolean }) {
  const [email, setEmail]               = useState<string | null>(null)
  const [notifCount, setNotifCount]     = useState(0)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const router   = useRouter()
  const pathname = usePathname()
  const menuRef    = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null)
    })
    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!email) { setNotifCount(0); return }
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false)
      .then(({ count }) => setNotifCount(count ?? 0))
  }, [email]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown on outside click or Escape; return focus to trigger on close
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setUserMenuOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  // Focus first menu item when dropdown opens
  useEffect(() => {
    if (userMenuOpen) {
      requestAnimationFrame(() => {
        const first = dropdownRef.current?.querySelector<HTMLElement>('[role="menuitem"]')
        first?.focus()
      })
    }
  }, [userMenuOpen])

  async function handleSignOut() {
    await supabase.auth.signOut()
    setEmail(null)
    setUserMenuOpen(false)
    router.push('/')
  }

  // Keyboard navigation inside the dropdown
  function handleDropdownKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      dropdownRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
    )
    const idx = items.indexOf(document.activeElement as HTMLElement)

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        items[Math.min(idx + 1, items.length - 1)]?.focus()
        break
      case 'ArrowUp':
        e.preventDefault()
        if (idx <= 0) {
          setUserMenuOpen(false)
          triggerRef.current?.focus()
        } else {
          items[idx - 1]?.focus()
        }
        break
      case 'Home':
        e.preventDefault()
        items[0]?.focus()
        break
      case 'End':
        e.preventDefault()
        items[items.length - 1]?.focus()
        break
      case 'Tab':
        setUserMenuOpen(false)
        break
    }
  }

  // Open dropdown with arrow key when trigger is focused
  function handleTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setUserMenuOpen(true)
    }
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-14 bg-[#111115]/90 backdrop-blur-md border-b border-white/[0.10] flex items-center px-6 gap-6">

      {/* Logo */}
      <Link href="/" className="flex items-center gap-2.5 shrink-0">
        <LogoMark />
        <span className="text-white font-bold text-sm tracking-tight">Leadbulucu</span>
      </Link>

      {/* Primary nav — logged-in only, desktop */}
      {email && (
        <div className="hidden md:flex items-center gap-1 flex-1">
          {NAV_LINKS.map(l => {
            const active = pathname === l.href || pathname.startsWith(l.href + '/')
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  active
                    ? 'text-white bg-white/[0.08]'
                    : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05]'
                }`}
              >
                {l.label}
                {l.href === '/takip' && notifCount > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-3.5 h-3.5 bg-red-500 text-white text-[8px] font-black rounded-full leading-none">
                    {notifCount > 9 ? '9+' : notifCount}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      )}

      {/* Spacer when no primary nav */}
      {!email && <div className="flex-1" />}

      {/* Right side */}
      <div className="flex items-center gap-2 ml-auto">

        {!email && (
          <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full px-2 py-0.5 font-medium">
            Erken Erişim
          </span>
        )}

        {email ? (
          <>
            {/* Mobile: bell link */}
            <Link
              href="/takip"
              aria-label="Bildirimler"
              className="relative md:hidden w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.08] transition-colors text-sm"
            >
              🔔
              {notifCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center bg-red-500 text-white text-[9px] font-black rounded-full">
                  {notifCount > 9 ? '9+' : notifCount}
                </span>
              )}
            </Link>

            {/* User menu */}
            <div ref={menuRef} className="relative">
              <button
                ref={triggerRef}
                onClick={() => setUserMenuOpen(v => !v)}
                onKeyDown={handleTriggerKeyDown}
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] transition-colors text-xs text-zinc-400 hover:text-white"
              >
                <span className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                  {email[0].toUpperCase()}
                </span>
                <span className="hidden sm:block max-w-[120px] truncate">{email}</span>
                <span className={`text-[10px] transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`}>▾</span>
              </button>

              {userMenuOpen && (
                <div
                  ref={dropdownRef}
                  role="menu"
                  onKeyDown={handleDropdownKeyDown}
                  className="absolute right-0 top-full mt-1.5 w-48 bg-[#1c1c22] border border-white/[0.12] rounded-xl shadow-2xl overflow-hidden z-50"
                >
                  {/* Mobile nav links in dropdown */}
                  <div className="md:hidden border-b border-white/[0.08]">
                    {NAV_LINKS.map(l => (
                      <Link
                        key={l.href}
                        href={l.href}
                        role="menuitem"
                        tabIndex={-1}
                        onClick={() => setUserMenuOpen(false)}
                        className={`block px-4 py-2.5 text-sm transition-colors focus:outline-none focus:bg-white/[0.07] ${
                          pathname === l.href
                            ? 'text-white bg-white/[0.06]'
                            : 'text-zinc-300 hover:bg-white/[0.07] hover:text-white'
                        }`}
                      >
                        {l.label}
                      </Link>
                    ))}
                  </div>

                  {/* Ekip */}
                  <Link
                    href="/ekip"
                    role="menuitem"
                    tabIndex={-1}
                    onClick={() => setUserMenuOpen(false)}
                    className="block px-4 py-2.5 text-sm text-zinc-300 hover:bg-white/[0.07] hover:text-white transition-colors focus:outline-none focus:bg-white/[0.07]"
                  >
                    Ekip
                  </Link>

                  <div className="border-t border-white/[0.08]" />

                  <button
                    role="menuitem"
                    tabIndex={-1}
                    onClick={handleSignOut}
                    className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors focus:outline-none focus:bg-red-500/10"
                  >
                    Çıkış Yap
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {showCta && (
              <Link
                href="/analiz"
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg px-4 py-1.5 transition-colors"
              >
                Uygulamayı Aç
              </Link>
            )}
            <Link
              href="/giris"
              className="border border-white/[0.15] text-zinc-400 hover:text-white hover:border-white/30 text-xs font-semibold rounded-lg px-3 py-1.5 transition-colors"
            >
              Giriş Yap
            </Link>
          </>
        )}
      </div>
    </nav>
  )
}
