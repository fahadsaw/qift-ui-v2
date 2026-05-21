'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { useI18n } from '@/lib/i18n'
import { useAuth } from '@/lib/auth'
import { roleOf } from '@/lib/roleHome'
import { listMyStores } from '@/lib/storesApi'

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
  // Merchant / admin specific glyphs. Kept in the same icon set so
  // a future role-driven nav swap is one lookup away. Sizes match
  // the existing user-side icons for visual consistency across the
  // role layouts.
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-[1.15rem] w-[1.15rem]">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  analytics: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-[1.15rem] w-[1.15rem]">
      <path d="M4 4v16h16" />
      <path d="M8 16l4-6 3 4 5-8" />
    </svg>
  ),
  // Merchant center-tab icon. Was a shopping-bag silhouette
  // (tapered body + arched handle) which, at the 26px raised-tile
  // size, read more like a trash-bin than a commerce surface and
  // gave the merchant nav a consumer-gifting flavour the
  // operating system doesn't want. Replaced with a Qift-branded
  // gift package: a clean rectangular box, a single ribbon
  // vertical, and a two-loop bow up top. The bow loops are the
  // signature Qift moment — they read instantly as "premium gift"
  // (matches Qift's brand voice) while the box body keeps the
  // icon operational + commerce-oriented (this IS the merchant's
  // queue of packages to fulfil). The strokeWidth + viewBox match
  // every other center icon so the visual weight is consistent
  // across role swaps.
  orders: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[1.6rem] w-[1.6rem]"
    >
      {/* Box body. Slightly inset from the viewBox edges so the
          bow up top has room to breathe inside the raised tile. */}
      <rect x="3.5" y="10" width="17" height="10" rx="1.4" />
      {/* Vertical ribbon down the centre of the box. */}
      <path d="M12 10v10" />
      {/* Horizontal ribbon band across the box, slightly above
          centre so the eye reads "lid → body" not "two halves". */}
      <path d="M3.5 13h17" />
      {/* Left bow loop. */}
      <path d="M12 10c-1.6-1.6-4-2.4-5.2-1.2-1.1 1.1-.1 2.5 5.2 1.2z" />
      {/* Right bow loop, mirrored. */}
      <path d="M12 10c1.6-1.6 4-2.4 5.2-1.2 1.1 1.1.1 2.5-5.2 1.2z" />
      {/* Bow knot — a tiny filled dot anchors the two loops and
          adds a subtle Qift-brand-dot accent. */}
      <circle cx="12" cy="10" r="0.9" fill="currentColor" fillOpacity="0.22" />
    </svg>
  ),
  products: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-[1.15rem] w-[1.15rem]">
      <path d="M21 16V8a2 2 0 00-1-1.7L13 2.5a2 2 0 00-2 0L4 6.3A2 2 0 003 8v8a2 2 0 001 1.7l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      <path d="M3.3 7l8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-[1.15rem] w-[1.15rem]">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2 21a7 7 0 0114 0" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16 21a5 5 0 016-3" />
    </svg>
  ),
  reports: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-[1.15rem] w-[1.15rem]">
      <path d="M5 3h11l4 4v14a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" />
      <path d="M14 3v5h5" />
      <path d="M8 13h8" />
      <path d="M8 17h6" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-[1.6rem] w-[1.6rem]">
      <path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
}

// Role-aware tab lists. Each role gets a five-tab layout with a
// raised center action that matches its primary job:
//   - user:   social/discovery — center = Stores funnel
//   - store:  operational — center = Orders queue (the merchant's
//             reason for opening the app)
//   - admin:  control center — center = Stores moderation (the
//             admin's most-common touch surface, alongside user
//             management)
//
// The user list is the original five-tab nav, kept verbatim so the
// social experience is unchanged. The two operational lists give
// merchants and admins their own first-class navigation instead of
// pretending they're regular users.
const TAB_LISTS: Record<'user' | 'store' | 'admin', Item[]> = {
  user: [
    { href: '/', key: 'nav.home', icon: ICONS.home },
    { href: '/search', key: 'nav.search', icon: ICONS.search },
    { href: '/stores', key: 'nav.stores', icon: ICONS.send, raised: true },
    { href: '/explore', key: 'nav.explore', icon: ICONS.explore },
    { href: '/profile', key: 'nav.account', icon: ICONS.profile },
  ],
  // Merchant Operating System nav. Five tabs, Orders raised as the
  // primary daily task. Storefront and Analytics get their own
  // first-class slots — Storefront is the merchant's public view
  // (jumps to the consumer-facing /stores/<theirStore>), Analytics
  // is the dedicated /store-dashboard/analytics page. Account
  // routes to the shared /settings (addresses, language, theme,
  // notifications — used by every role).
  //
  // The previous "Dashboard" tab was redundant with the raised
  // Orders tile (both pointed at /store-dashboard); we keep
  // /store-dashboard as the operational hub but enter it
  // through Orders. Removing the separate Dashboard tab makes
  // room for Analytics without a 6th slot.
  store: [
    { href: '/store-dashboard/products', key: 'nav.products', icon: ICONS.products },
    { href: '/stores', key: 'nav.storefront', icon: ICONS.stores },
    // Center: orders queue. The /store-dashboard root IS the
    // operations hub; the `#orders` fragment scrolls to the queue
    // section once the page mounts.
    {
      href: '/store-dashboard#orders',
      key: 'nav.orders',
      icon: ICONS.orders,
      raised: true,
    },
    {
      href: '/store-dashboard/analytics',
      key: 'nav.analytics',
      icon: ICONS.analytics,
    },
    { href: '/settings', key: 'nav.account', icon: ICONS.profile },
  ],
  admin: [
    { href: '/admin', key: 'nav.admin_overview', icon: ICONS.dashboard },
    { href: '/admin#users', key: 'nav.admin_users', icon: ICONS.users },
    // Center: stores moderation. /admin already has tabs; the
    // fragment activates the stores tab on mount via the existing
    // hash-routing in app/admin/page.tsx.
    {
      href: '/admin#stores',
      key: 'nav.admin_stores',
      icon: ICONS.shield,
      raised: true,
    },
    { href: '/admin#reports', key: 'nav.admin_reports', icon: ICONS.reports },
    { href: '/settings', key: 'nav.account', icon: ICONS.profile },
  ],
}

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useI18n()
  const { user, accessToken, isAuthenticated } = useAuth()

  // Phase-1 fix: the merchant "Storefront" tab used to hard-code
  // `/stores` (the consumer marketplace). That dropped a merchant
  // into the public browse list instead of their own storefront.
  // We resolve their primary store id once at mount and override
  // the Storefront tab's href to /stores/<id>. Pre-onboarding
  // merchants (no store yet) fall back to /store-dashboard/new so
  // the tab still has a useful destination during application
  // review.
  //
  // Approved stores are preferred; if every store is still pending
  // we pick the first one of any status so the tab still works
  // during review and the merchant can preview how their pending
  // storefront will appear.
  const [merchantStorefrontHref, setMerchantStorefrontHref] = useState<
    string | null
  >(null)
  const role = roleOf(user)
  useEffect(() => {
    // Async-IIFE pattern (see project lint rule
    // react-hooks/set-state-in-effect).
    let cancelled = false
    void (async () => {
      if (role !== 'store' || isAuthenticated !== true || !accessToken) {
        if (!cancelled) setMerchantStorefrontHref(null)
        return
      }
      const stores = await listMyStores(accessToken)
      if (cancelled) return
      const approved = stores.find((s) => s.status === 'approved')
      const target = approved?.id ?? stores[0]?.id
      setMerchantStorefrontHref(target ? `/stores/${target}` : '/store-dashboard/new')
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken, isAuthenticated, role])

  // Choose the tab layout that matches the viewer's role. Falls
  // back to the user list when the role is unknown / unset (pre-
  // hydration, logged-out, or a corrupted local snapshot).
  //
  //   user  → Home · Search · [Stores] · Explore · Account
  //   store → Dashboard · Products · [Orders] · Storefront · Account
  //   admin → Overview · Users · [Stores] · Reports · Account
  //
  // The raised tap-target on the user list ALWAYS opens the Stores
  // funnel, with smart routing on click:
  //   - sessionStorage(qift.stores.lastDetailHref) is valid →
  //     resume on the exact store the user was browsing before
  //     they took a Profile / Explore detour.
  //   - Otherwise → /stores list.
  // Smart-routing only fires for the user role; merchant and admin
  // raised tabs jump straight to their hub anchors.
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
  // Merge in the dynamic Storefront href (resolved above) for the
  // merchant role. Other roles' lists pass through unchanged.
  // We map the tab list each render rather than mutating the static
  // TAB_LISTS — the static map stays the single source of truth.
  const items: Item[] =
    role === 'store' && merchantStorefrontHref
      ? TAB_LISTS.store.map((it) =>
          it.key === 'nav.storefront'
            ? { ...it, href: merchantStorefrontHref }
            : it,
        )
      : TAB_LISTS[role]

  // Read the last-store breadcrumb at click time (not at render
  // time). sessionStorage isn't reactive — reading it on render
  // would only catch the value at first paint, missing later
  // writes from /stores/[id].
  //
  // Only the user role uses the resume-last-store breadcrumb;
  // merchant and admin raised tabs jump straight to their hub.
  const onRaisedClick = (e: React.MouseEvent) => {
    if (role !== 'user') return
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
    // Strip a fragment so /admin#users still highlights when the
    // user is on /admin (the fragment scrolls to the section but
    // doesn't change the route).
    const base = href.split('#')[0]
    if (base === '/') return pathname === '/'
    return pathname === base || pathname?.startsWith(base + '/')
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
