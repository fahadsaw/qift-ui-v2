import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { ThemeProvider, THEME_INIT_SCRIPT } from '@/lib/theme'
import { I18nProvider } from '@/lib/i18n'
import { ToastProvider } from '@/lib/toast'
import PageBackground from '@/components/PageBackground'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import BottomNav from '@/components/BottomNav'
import PushBootstrap from '@/components/PushBootstrap'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'قِفت — Qift',
  description:
    'أرسل واستقبل الهدايا باسم المستخدم — تجربة إهداء بسيطة وأنيقة.',
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
              <div className="flex min-h-screen flex-col">
                <Header />
                <main className="flex-1 pb-28">{children}</main>
                <Footer />
              </div>
              <BottomNav />
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
