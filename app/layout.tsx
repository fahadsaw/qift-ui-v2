import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { ThemeProvider, THEME_INIT_SCRIPT } from '@/lib/theme'
import { I18nProvider } from '@/lib/i18n'
import { ToastProvider } from '@/lib/toast'
import { SITE_ORIGIN } from '@/lib/siteOrigin'
import PageBackground from '@/components/PageBackground'
import AppShell from '@/components/AppShell'
import PushBootstrap from '@/components/PushBootstrap'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

// Rich app-wide metadata. The `metadataBase` resolves any relative
// URL we use elsewhere (OG image paths, canonical hrefs) against the
// production origin without forcing every page to repeat it. The OG
// + Twitter blocks make WhatsApp / iMessage / X previews look
// premium instead of falling back to the favicon + bare URL.
//
// Per-page metadata overrides this base: a `generateMetadata` export
// on /stores/[id] (for example) can specialize the title / image
// without touching the rest of the chain. SITE_ORIGIN comes from
// lib/siteOrigin so server-rendered metadata + client-side share
// links stay locked to the same value.

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: 'قِفت — Qift',
    template: '%s · قِفت',
  },
  description:
    'أرسل واستقبل الهدايا باسم المستخدم — تجربة إهداء بسيطة وأنيقة.',
  applicationName: 'Qift',
  keywords: [
    'qift',
    'قفت',
    'هدايا',
    'إهداء',
    'gifting',
    'gift',
    'Saudi Arabia',
  ],
  authors: [{ name: 'Qift' }],
  // Public marketing surfaces are indexable; robots.ts handles
  // per-path disallows for authenticated routes.
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'قِفت — Qift',
    description:
      'أرسل واستقبل الهدايا باسم المستخدم — تجربة إهداء بسيطة وأنيقة.',
    url: SITE_ORIGIN,
    siteName: 'Qift',
    locale: 'ar_SA',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'قِفت — Qift',
    description:
      'أرسل واستقبل الهدايا باسم المستخدم — تجربة إهداء بسيطة وأنيقة.',
  },
}

// Viewport / theme-color must live in a separate `viewport` export
// in Next.js 16 — the deprecation warning fires when these sit on
// `metadata` directly. The two theme-colors swap based on the
// browser's prefers-color-scheme so the URL bar feels continuous
// with the page surface in both light and dark modes.
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#7B5CF5' },
    { media: '(prefers-color-scheme: dark)', color: '#0F0B18' },
  ],
  // Don't let users zoom-disable themselves into a broken state on
  // mobile. We allow zoom up to 5x for accessibility — that's the
  // WCAG minimum and the WebView default.
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <ThemeProvider>
          <I18nProvider>
            <ToastProvider>
              <PageBackground />
              {/* AppShell (client) inspects the URL and renders the
                  right chrome — Consumer / Merchant / Admin — for the
                  active route. Pre-Phase-1 this layout hard-coded the
                  consumer chrome (Header + Footer + BottomNav) for
                  every route, leaking consumer surfaces into the
                  merchant + admin operating systems. See
                  components/AppShell.tsx for the dispatch logic. */}
              <AppShell>{children}</AppShell>
              {/* Silent service-worker auto-register for authenticated
                  viewers. Renders nothing; does not request permission. */}
              <PushBootstrap />
            </ToastProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
