'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { useI18n } from '@/lib/i18n'

// sessionStorage key the /stores funnel uses to remember the last
// detail page the user was on. The raised "Stores" tab below reads
// this synchronously on tap so a user who took a Profile / Explore
// detour lands back on the exact store they were browsing — without
// relying on the /stores route's mount-effect (which can be skipped
// in some App Router cache scenarios).
const SS_KEY_LAST_DETAIL_HREF = 'qift.stores.lastDetailHref'

// Same path-shape gate used in /stores. Rejects protocol-relative,
// hash-only, query-only, and non-/stores/ values. Belt-and-braces:
// if the breadcrumb gets corrupted in storage we fall through to
// /stores instead of routing somewhere weird.
function isValidDetailHref(href: string | null): boolean {
  if (!href) return false
  if (href.startsWith('//')) return false
  if (!href.startsWith('/stores/')) return false
  const after = href.slice('/stores/'.length)
  if (after.length === 0) return false
  if (after.startsWith('?') || after.startsWith('#')) return false
  return true
}

type Item = {
  href: string
  key: string
  icon: ReactNode
  raised?: boolean
}

const ICONS = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-[1.15rem] w-[1.15rem]">
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-[1.15rem] w-[1.15rem]">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  ),
  explore: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-[1.15rem] w-[1.15rem]">
      <circle cx="12" cy="12" r="9" />
      <path d="M16 8l-2 6-6 2 2-6z" fill="currentColor" fillOpacity="0.18" />
    </svg>
  ),
  send: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-[1.6rem] w-[1.6rem]">
      <path d="M20 12v9H4v-9" />
      <path d="M2 7h20v5H2z" />
      <path d="M12 22V7" />
      <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z" />
      <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />
    </svg>
  ),
  stores: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-[1.15rem] w-[1.15rem]">
      <path d="M3 9l1.5-4.5a1 1 0 011-.7h13a1 1 0 011 .7L21 9" />
      <path d="M3 9h18" />
      <path d="M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9" />
    </svg>
  ),
  profile: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-[1.15rem] w-[1.15rem]">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0116 0" />
    </svg>
  ),
}

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useI18n()

  // Five-tab layout, raised centre = Stores (Qift's primary action).
  //
  //   Home  ·  Search  ·  [Stores — raised]  ·  Explore  ·  Account
  //
  // The raised tap-target ALWAYS opens the Stores funnel, with smart
  // routing on click:
  //   - sessionStorage(qift.stores.lastDetailHref) is valid →
  //     resume on the exact store the user was browsing before
  //     they took a Profile / Explore detour.
  //   - Otherwise → /stores list.
  //
  // We do this on the click side (not in /stores's mount effect)
  // because Next.js's App Router can keep the /stores route in
  // its cache between visits; the mount effect can be skipped in
  // cache-restore scenarios, leaving the user on the list when
  // they expected to resume. Deciding the destination at tap-time
  // bypasses that whole class of issues.
  //
  // The "back to all stores" button on /stores/[id] clears the
  // breadcrumb explicitly, so an intentional return to the list
  // doesn't bounce.
  const items: Item[] = [
    { href: '/', key: 'nav.home', icon: ICONS.home },
    { href: '/search', key: 'nav.search', icon: ICONS.search },
    { href: '/stores', key: 'nav.stores', icon: ICONS.send, raised: true },
    { href: '/explore', key: 'nav.explore', icon: ICONS.explore },
    { href: '/profile', key: 'nav.account', icon: ICONS.profile },
  ]

  // Read the last-store breadcrumb at click time (not at render
  // time). sessionStorage isn't reactive — reading it on render
  // would only catch the value at first paint, missing later
  // writes from /stores/[id].
  const onRaisedClick = (e: React.MouseEvent) => {
    if (typeof window === 'undefined') return
    let stored: string | null = null
    try {
      stored = window.sessionStorage.getItem(SS_KEY_LAST_DETAIL_HREF)
    } catch {
      // Private mode / storage disabled. Fall through to the
      // default href on the Link (`/stores`).
      return
    }
    if (!isValidDetailHref(stored)) return
    // Don't bounce to the same page the user is already on.
    if (stored === pathname || stored?.split('?')[0] === pathname) return
    e.preventDefault()
    router.push(stored as string)
  }

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname === href || pathname?.startsWith(href + '/')
  }

  return (
    <nav
      aria-label="primary"
      className="fixed inset-x-0 bottom-0 z-40 backdrop-blur-xl"
      style={{
        background:
          'linear-gradient(180deg, color-mix(in srgb, var(--bg-base) 50%, transparent) 0%, color-mix(in srgb, var(--bg-base) 92%, transparent) 100%)',
        borderTop: '1px solid var(--hairline)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* grid-cols-5 matches the 5-item layout exactly. The previous
          grid-cols-6 left an empty 6th cell on the trailing edge,
          which made the bar look right-shifted on mobile. items-end
          keeps the raised center button anchored to the same baseline
          as the flat tabs around it. */}
      <ul className="mx-auto grid w-full max-w-md grid-cols-5 items-end gap-1 px-2 pb-2 pt-2 sm:max-w-2xl">
        {items.map((it) => {
          const active = isActive(it.href)
          if (it.raised) {
            // Raised center CTA. Sits 28px above the bar's baseline
            // (`-mt-7`) so it reads as a separate primary surface.
            // 56px diameter is the iOS / Android standard tap target;
            // any smaller and it stops feeling premium on Retina.
            // The inner ring (white-12% inset) + outer two-stop
            // primary glow give it the "lifted" feel the spec calls
            // for without redesigning the rest of the bar.
            return (
              <li
                key={it.href}
                className="flex justify-center -mt-7"
              >
                <Link
                  href={it.href}
                  onClick={onRaisedClick}
                  aria-label={t(it.key)}
                  aria-current={active ? 'page' : undefined}
                  className="relative flex h-14 w-14 items-center justify-center rounded-full text-white transition-all duration-300 hover:-translate-y-1 active:scale-95"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                    boxShadow:
                      '0 18px 36px -10px rgba(123,92,245,0.55), 0 6px 14px -6px rgba(99,68,232,0.4), inset 0 1px 0 rgba(255,255,255,0.22), 0 0 0 4px var(--bg-base)',
                  }}
                >
                  {it.icon}
                </Link>
              </li>
            )
          }
          return (
            <li key={it.href} className="flex justify-center">
              <Link
                href={it.href}
                className="flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition-colors"
                style={{ color: active ? 'var(--primary)' : 'var(--muted)' }}
              >
                <span
                  className="transition-transform"
                  style={{ transform: active ? 'translateY(-1px)' : 'none' }}
                >
                  {it.icon}
                </span>
                <span
                  className="text-[0.6rem] tracking-tight"
                  style={{
                    color: active ? 'var(--ink)' : 'var(--muted)',
                    fontWeight: active ? 700 : 500,
                  }}
                >
                  {t(it.key)}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
