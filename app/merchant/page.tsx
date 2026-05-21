'use client'

// Public "Become a merchant" landing page.
//
// Until slice-1 this page hosted a self-contained merchant-
// application form that submitted to nothing (a `setTimeout(700)`
// faked a success state and dropped the data on the floor). That
// meant a real merchant filling it in believed their store had
// been registered when in fact no Store row existed in the DB.
// Closed beta cannot start with that gap open.
//
// A parallel cleanup on main (7b8f441 "retired merchant funnel as
// transparent redirect") replaced the form with a one-effect
// router.replace('/store-dashboard/new'). That fix closes the
// fake-success bug but loses three operational properties:
//   - new visitors see no "what is Qift for merchants" framing
//   - already-onboarded merchants get bounced into the onboarding
//     form when /merchant should send them to the dashboard
//   - unauthenticated visitors lose the explicit "create account
//     first" hand-off (the redirect target gates on auth via
//     login bounce, but the intent is opaque to the user)
//
// This file is the merge-resolved slice-1 version: the form is
// gone, the redirect contract is preserved (every CTA still
// terminates at the one real onboarding flow at
// /store-dashboard/new), AND the auth-aware funnel survives:
//
//   - Not logged in       → CTA into /register?next=/store-dashboard/new
//   - Logged in, no store → CTA into /store-dashboard/new
//   - Logged in, has store → CTA into /store-dashboard
//
// No form is rendered here anymore. Every actual store record is
// created via the one server-backed code path (POST /stores via
// app/store-dashboard/new/page.tsx → lib/storesApi.createStore),
// so we never lose a submission again.

import Link from 'next/link'
import { useEffect, useState } from 'react'
import Badge from '@/components/Badge'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import PrimaryButton from '@/components/PrimaryButton'
import { listMyStores, type ApiStore } from '@/lib/storesApi'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'

export default function MerchantPage() {
  const { t } = useI18n()
  const { accessToken, isAuthenticated } = useAuth()
  // null = still resolving (don't render a CTA yet);
  // [] = authed but no store; [...stores] = authed + at least one store.
  const [myStores, setMyStores] = useState<ApiStore[] | null>(null)

  useEffect(() => {
    // Wrap every state-setting branch in an async IIFE so the
    // lint rule (`react-hooks/set-state-in-effect`) is satisfied —
    // the same pattern used across /admin and /store-dashboard.
    let cancelled = false
    void (async () => {
      if (isAuthenticated !== true || !accessToken) {
        if (!cancelled) setMyStores([])
        return
      }
      const list = await listMyStores(accessToken)
      if (!cancelled) setMyStores(list)
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken, isAuthenticated])

  // CTA target derived from auth state. Three branches.
  //   - unauth          → register, with next=
  //   - auth + no store → direct into the 4-step form
  //   - auth + ≥1 store → dashboard (existing merchant lands here)
  // While the stores list is still in flight (myStores === null and
  // isAuthenticated === true), default to /store-dashboard/new — the
  // worst case is one extra redirect for an existing merchant, no
  // data is lost. Far better than rendering nothing.
  const cta = (() => {
    if (isAuthenticated !== true) {
      return {
        href: '/register?next=/store-dashboard/new',
        labelKey: 'merchant.cta_register',
      }
    }
    if (myStores && myStores.length > 0) {
      return {
        href: '/store-dashboard',
        labelKey: 'merchant.cta_open_dashboard',
      }
    }
    return {
      href: '/store-dashboard/new',
      labelKey: 'merchant.cta_start_application',
    }
  })()

  return (
    <PageContainer>
      <section className="pt-5">
        <PageHeading
          badge={<Badge>{t('merchant.badge')}</Badge>}
          line1={t('merchant.title_1')}
          gradient={t('merchant.title_2')}
          subtitle={t('merchant.landing_subtitle')}
          size="sm"
        />

        <div className="mt-6 flex flex-col gap-3">
          <PrimaryButton href={cta.href}>{t(cta.labelKey)}</PrimaryButton>

          {/* Secondary helper: an existing merchant who landed on
              /merchant by accident gets a clear "go to my dashboard"
              link even when the primary CTA already points there. We
              hide it once the primary CTA already routes to the
              dashboard to avoid duplication. */}
          {isAuthenticated === true &&
            myStores !== null &&
            myStores.length === 0 && (
              <Link
                href="/store-dashboard"
                className="self-center text-center text-[0.8rem]"
                style={{ color: 'var(--muted)' }}
              >
                {t('merchant.already_merchant_link')}
              </Link>
            )}

          {isAuthenticated !== true && (
            <p
              className="mt-1 text-center text-[0.8rem]"
              style={{ color: 'var(--muted)' }}
            >
              {t('merchant.have_account')}{' '}
              <Link
                href="/login?next=/store-dashboard/new"
                className="font-medium underline-offset-4 hover:underline"
                style={{ color: 'var(--ink)' }}
              >
                {t('merchant.login_link')}
              </Link>
            </p>
          )}
        </div>

        {/* Marketing-flavoured "what you get" list. Three short
            lines, scannable. The form that used to live here is
            gone — the real form is one tap away via the CTA above. */}
        <ul
          className="mt-8 flex flex-col gap-3 rounded-3xl border p-5 backdrop-blur-md"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--card)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <Bullet text={t('merchant.value_1')} />
          <Bullet text={t('merchant.value_2')} />
          <Bullet text={t('merchant.value_3')} />
        </ul>
      </section>
    </PageContainer>
  )
}

function Bullet({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        aria-hidden
        className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: 'var(--primary)' }}
      />
      <span className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>
        {text}
      </span>
    </li>
  )
}
