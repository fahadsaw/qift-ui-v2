'use client'

// App shell dispatcher — Phase-1 of the operational-UI cleanup.
//
// Before this slice, RootLayout (app/layout.tsx) hard-coded the
// consumer chrome (<Header>, <Footer>, <BottomNav>) for every page
// in the app. Merchants on /store-dashboard/* and admins on /admin/*
// inherited the consumer chrome verbatim — wishlist tabs in the
// BottomNav, marketing "Become a merchant" hooks in the Footer
// (for unauthenticated visitors), and a brand link that bounced
// them to the consumer home `/`. The audit report flagged this as
// the highest-severity surface leak for closed beta operability.
//
// This shell sits between RootLayout and the page's children. It
// inspects the URL via usePathname() and renders exactly one of
// three sibling shells — Consumer, Merchant, or Admin — each with
// its own purpose-built topbar + footer policy. The shells share
// the same BottomNav primitive but pass through different role
// hints so the tab list adapts automatically.
//
// Decision: URL prefix (NOT user role) drives the shell choice.
//   - A consumer URL-hopping to /store-dashboard/* would see the
//     MerchantShell, but the page itself will redirect them away
//     via the existing StoreGuard / useRoleGate pattern. Routing
//     the shell on URL keeps the chrome stable between the
//     pre-redirect render and the redirected destination.
//   - A merchant viewing /settings (cross-role) keeps the consumer
//     shell — `/settings` is a shared surface and the consumer
//     chrome's Header + Footer + BottomNav still apply (with the
//     merchant tab list courtesy of BottomNav's role awareness).
//
// Layout responsibility split:
//   RootLayout (server)  → providers + <html> + page-background
//   AppShell (client)    → chrome dispatch by URL prefix
//   *Shell  (client)     → topbar + main + (optional footer) + BottomNav
//   page.tsx             → page content
//
// PageBackground stays in RootLayout (unchanged) — it's a static
// visual asset, not chrome that needs role-awareness.

import { usePathname } from 'next/navigation'
import { useMemo, type ReactNode } from 'react'
import Header from './Header'
import Footer from './Footer'
import BottomNav from './BottomNav'
import MerchantTopbar from './MerchantTopbar'
import AdminTopbar from './AdminTopbar'

type ShellKind = 'consumer' | 'merchant' | 'admin'

// Resolve which shell applies to the given URL. Prefix match;
// nothing fancier needed. Exported for testing / future feature
// flags that might want to coerce a path into a specific shell
// (e.g. preview / staging override).
export function shellForPath(pathname: string | null | undefined): ShellKind {
  if (!pathname) return 'consumer'
  if (pathname.startsWith('/store-dashboard')) return 'merchant'
  if (pathname.startsWith('/admin')) return 'admin'
  return 'consumer'
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const kind = useMemo(() => shellForPath(pathname), [pathname])

  if (kind === 'merchant') {
    return (
      <>
        <div className="flex min-h-screen flex-col">
          <MerchantTopbar />
          <main className="flex-1 pb-28">{children}</main>
          {/* No consumer Footer in merchant mode. The operator's
              legal / contact links live under /settings. */}
        </div>
        <BottomNav />
      </>
    )
  }

  if (kind === 'admin') {
    return (
      <>
        <div className="flex min-h-screen flex-col">
          <AdminTopbar />
          <main className="flex-1 pb-28">{children}</main>
          {/* No consumer Footer in admin mode for the same reason
              as merchant mode — operators reach legal / contact
              via /settings. */}
        </div>
        <BottomNav />
      </>
    )
  }

  // Consumer shell — unchanged from pre-Phase-1 behaviour.
  return (
    <>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 pb-28">{children}</main>
        <Footer />
      </div>
      <BottomNav />
    </>
  )
}
