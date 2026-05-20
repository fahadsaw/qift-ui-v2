'use client'

// Stage 7 — dedicated notification preferences page.
//
// The full preferences surface previously lived as an inline section
// inside /settings (the `<NotificationPreferencesSection />` card).
// Stage 7 promotes it to a dedicated route so:
//   - The bell on /notifications can deep-link straight to it
//     ("manage notifications").
//   - The settings home doesn't accumulate every long-form preference
//     into one scroll.
//   - Initial-load failure surfaces as an explicit retry tile (the
//     embedded mode swallows errors silently so /settings isn't
//     wholesale broken by one card; the dedicated page is THIS
//     surface, so failure must be visible).
//
// Everything substantive — categories, mandatory locks, quiet hours,
// digest cadence, optimistic patch with rollback — lives inside the
// shared `<NotificationPreferencesSection>` component. This page is
// the chrome: header, back-nav, error escalation, auth gate.
//
// REAL-API ONLY:
//   GET    /notifications/categories            (JWT)
//   GET    /users/me/notification-preferences   (JWT)
//   PATCH  /users/me/notification-preferences   (JWT)
//
// No mocks. Unauthenticated visitors are redirected to /login; an
// initial-load failure renders the retry tile (no fabricated
// preferences data).

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Badge from '@/components/Badge'
import NotificationPreferencesSection from '@/components/NotificationPreferencesSection'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import Skeleton, { useSimulatedReady } from '@/components/Skeleton'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'

export default function NotificationSettingsPage() {
  const { t } = useI18n()
  const router = useRouter()
  const { isAuthenticated } = useAuth()
  // Small simulated-ready beat so the auth check has a frame to
  // resolve from localStorage before we route. Matches the rest of
  // the authenticated /settings flow.
  const ready = useSimulatedReady(400)

  useEffect(() => {
    if (ready && !isAuthenticated) {
      router.replace('/login')
    }
  }, [ready, isAuthenticated, router])

  // While auth resolves, render the skeleton so we don't flash an
  // unauthenticated empty frame. Once we know the user is signed
  // out, the redirect effect fires; we keep showing the skeleton
  // until the route swap completes.
  if (!ready || !isAuthenticated) {
    return (
      <PageContainer>
        <section className="pt-5">
          <Skeleton className="h-7 w-24" rounded="full" />
          <Skeleton className="mt-4 h-10 w-2/3" />
          <Skeleton className="mt-3 h-4 w-1/2" />
          <Skeleton className="mt-8 h-48 w-full" rounded="3xl" />
        </section>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <section className="pt-5 qift-fade-in">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Badge>{t('settings.notifications.badge')}</Badge>
          <Link
            href="/settings"
            aria-label={t('nav.back')}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[0.7rem] font-medium backdrop-blur-md transition-all hover:-translate-y-0.5 active:scale-95"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card-soft)',
              color: 'var(--text-soft)',
            }}
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5 rtl:-scale-x-100"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            {t('settings.notifications.back_to_settings')}
          </Link>
        </div>

        <PageHeading
          line1={t('settings.notifications.heading_line1')}
          gradient={t('settings.notifications.heading_line2')}
          subtitle={t('settings.notifications.heading_subtitle')}
          size="sm"
        />

        <div className="mt-8">
          {/* The host page (this route) IS the preferences surface,
              so we pass errorMode='visible' to surface the retry
              tile on initial-load failure. We hide the section's
              inline header — PageHeading above already provides
              the page-level title block, and a duplicate would
              read as visual noise. */}
          <NotificationPreferencesSection
            showHeader={false}
            errorMode="visible"
          />
        </div>
      </section>
    </PageContainer>
  )
}
