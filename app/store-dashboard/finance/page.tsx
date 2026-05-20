'use client'

// Merchant financial dashboard — Stage 10.6 preview surface.
//
// Renders the 15 dashboard fields specified in Financial Review Pack
// v1.1 § 9.6 against a static mock data module. No backend call, no
// real money, no mutations. The route exists only when both:
//   1. NEXT_PUBLIC_SHOW_MERCHANT_FINANCE=1 is set (build-time flag,
//      single source of truth in lib/merchantFinanceAccess.ts).
//   2. The viewing user has a merchant-side role
//      (canViewMerchantFinance — currently role === 'store'; will
//      narrow to merchant_owner / merchant_finance / merchant_
//      accountant_readonly once the fine-grained RBAC ships).
//
// With either condition unmet, the page redirects:
//   - flag off → /store-dashboard (the route is effectively hidden)
//   - flag on but role missing → /login?next=...
//   - flag on, authed, but wrong role → / (role-home redirect)
//
// PRIVACY POSTURE (FRP v1.1 § 9.6.2)
// ----------------------------------
// The dashboard renders the merchant's own data only. It does not
// expose:
//   - the numerical MerchantHealthScore (band name only)
//   - other merchants' data
//   - platform-wide aggregates
//   - a direct "withdraw now" button (merchants don't trigger
//     payouts; review-request path only — and that's mock-disabled
//     in this preview)
//
// MOCK DATA NOTICE
// ----------------
// A prominent banner at the top of the page declares "Preview only,
// mock data". The notice flips with the i18n toggle so Arabic
// reviewers see the same disclosure.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import Card from '@/components/Card'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import Skeleton, { useSimulatedReady } from '@/components/Skeleton'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import {
  canViewMerchantFinance,
  MERCHANT_FINANCE_ENABLED,
} from '@/lib/merchantFinanceAccess'
import {
  MERCHANT_FINANCE_MOCK,
  type ActiveHold,
  type PayoutHistoryEntry,
  type ReserveRelease,
  holdReasonLabelKey,
  payoutDelayLabelKey,
  payoutStatusColor,
  payoutStatusLabelKey,
} from '@/lib/merchantFinanceMock'

export default function MerchantFinancePage() {
  const { t, lang } = useI18n()
  const router = useRouter()
  const ready = useSimulatedReady(300)
  const { isAuthenticated, user } = useAuth()

  // Compute the view-permission boolean once. canViewMerchantFinance
  // accepts AuthUser | null | undefined and returns false safely for
  // every non-merchant case.
  const canView = canViewMerchantFinance(user)

  useEffect(() => {
    if (!ready) return

    // Flag off — route should not exist. Send the operator back to
    // their store dashboard with no auth flow detour.
    if (!MERCHANT_FINANCE_ENABLED) {
      router.replace('/store-dashboard')
      return
    }

    // Not signed in — send to login with returnTo so post-login
    // lands them back here (when the flag is on).
    if (isAuthenticated === false) {
      router.replace('/login?next=/store-dashboard/finance')
      return
    }

    // Signed in but wrong role — bounce to their role home (e.g.,
    // /admin for admins, / for regular users). Avoids them landing
    // on an empty page they have no access to.
    if (isAuthenticated && user && !canView) {
      router.replace('/')
    }
  }, [ready, isAuthenticated, user, canView, router])

  // While bouncing or hydrating, render the skeleton — same pattern
  // the /admin page uses to avoid flashing partial state.
  if (
    !ready ||
    !MERCHANT_FINANCE_ENABLED ||
    !isAuthenticated ||
    !canView
  ) {
    return (
      <PageContainer size="md">
        <section className="pt-5">
          <Skeleton className="h-9 w-2/5" />
          <Skeleton className="mt-3 h-32 w-full" />
        </section>
      </PageContainer>
    )
  }

  const data = MERCHANT_FINANCE_MOCK
  const { summary } = data

  // Currency formatter — uses the user's locale for digit grouping
  // but always renders the SAR symbol (mock is SAR-only). When real
  // multi-currency lands, this swap becomes data.summary.currency.
  const fmt = (n: number) =>
    `${n.toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${lang === 'ar' ? 'ر.س' : 'SAR'}`

  const fmtDate = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`)
    return d.toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <PageContainer size="md">
      <section className="pt-5 qift-fade-in">
        <PageHeading
          line1={t('merchant_finance.title_1')}
          gradient={t('merchant_finance.title_2')}
          subtitle={t('merchant_finance.subtitle')}
          size="sm"
        />

        <div className="mt-3">
          <Link
            href="/store-dashboard"
            className="text-[0.72rem] font-semibold underline-offset-4 hover:underline"
            style={{ color: 'var(--text-soft)' }}
          >
            ← {t('merchant_finance.back')}
          </Link>
        </div>

        {/* Mock/preview notice — first thing the merchant sees, in
            the same warm-amber treatment used by /payouts so the
            "this isn't authoritative yet" signal reads consistently
            across both surfaces. */}
        <p
          className="mt-3 rounded-2xl border px-3 py-2 text-[0.7rem] leading-relaxed"
          style={{
            borderColor:
              'color-mix(in srgb, #E89B3A 30%, var(--border))',
            background:
              'linear-gradient(135deg, rgba(232, 155, 58, 0.08) 0%, var(--card) 100%)',
            color: 'var(--text-soft)',
          }}
        >
          {t('merchant_finance.mock_notice')}
        </p>

        {/* === Headline: available balance + next payout ============
            The two numbers the merchant looks at first. Available
            balance is the "what I have right now" figure; next
            payout is the "when do I get it" figure. */}
        <Card className="mt-4">
          <div
            className="text-[0.62rem] font-bold uppercase tracking-[0.18em]"
            style={{ color: 'var(--muted)' }}
          >
            {t(summary.periodLabelKey)}
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-3">
            <div className="min-w-[10rem]">
              <div
                className="text-[0.62rem] font-bold uppercase tracking-[0.18em]"
                style={{ color: 'var(--muted)' }}
              >
                {t('merchant_finance.available_balance')}
              </div>
              <div
                className="mt-1 text-2xl font-extrabold tabular-nums"
                style={{ color: 'var(--primary)' }}
              >
                {fmt(summary.availableBalance)}
              </div>
            </div>
            <div className="min-w-[10rem]">
              <div
                className="text-[0.62rem] font-bold uppercase tracking-[0.18em]"
                style={{ color: 'var(--muted)' }}
              >
                {t('merchant_finance.next_payout')}
              </div>
              <div
                className="mt-1 text-base font-bold tabular-nums"
                style={{ color: 'var(--ink, var(--text))' }}
              >
                {fmt(summary.nextPayout.estimatedAmount)}
              </div>
              <div
                className="text-[0.7rem]"
                style={{ color: 'var(--text-soft)' }}
              >
                {t('merchant_finance.next_payout_on')}{' '}
                {fmtDate(summary.nextPayout.estimatedDate)}
              </div>
            </div>
          </div>
        </Card>

        {/* === Period totals — gross / fees / VAT / shipping ========
            The four-up grid of period aggregates. Together they
            reconcile to the merchant's bank deposits + their VAT
            filings + their fee expense line. */}
        <section className="mt-5">
          <h2
            className="mb-2 text-[0.7rem] font-bold uppercase tracking-[0.2em]"
            style={{ color: 'var(--muted)' }}
          >
            {t(summary.periodLabelKey)}
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <MetricTile
              labelKey="merchant_finance.gross_sales"
              value={fmt(summary.grossSales)}
              tone="default"
            />
            <MetricTile
              labelKey="merchant_finance.qift_fees"
              value={`− ${fmt(summary.qiftFees)}`}
              tone="default"
            />
            <MetricTile
              labelKey="merchant_finance.vat"
              value={fmt(summary.vat)}
              tone="default"
            />
            <MetricTile
              labelKey="merchant_finance.shipping_fees"
              value={fmt(summary.shippingFees)}
              tone="default"
            />
          </div>
        </section>

        {/* === Reserve summary + release schedule ===================
            Reserve withheld (this period) + current reserve balance
            (running total) + the upcoming release schedule. The
            release schedule lives directly under the summary numbers
            so the merchant can scan "what's coming back to me, when". */}
        <section className="mt-5">
          <h2
            className="mb-2 text-[0.7rem] font-bold uppercase tracking-[0.2em]"
            style={{ color: 'var(--muted)' }}
          >
            {t('merchant_finance.reserve_releases_title')}
          </h2>
          <p
            className="mb-2 text-[0.72rem] leading-relaxed"
            style={{ color: 'var(--text-soft)' }}
          >
            {t('merchant_finance.reserve_releases_subtitle')}
          </p>
          <Card>
            <div className="grid grid-cols-2 gap-2">
              <MetricTile
                labelKey="merchant_finance.reserve_withheld"
                value={fmt(summary.reserveWithheld)}
                tone="default"
              />
              <MetricTile
                labelKey="merchant_finance.reserve_current_balance"
                value={fmt(summary.reserveCurrentBalance)}
                tone="default"
              />
            </div>

            {/* Pending balance — the "not yet eligible" portion.
                Distinct from reserve (which is held against future
                chargebacks) — pending is "in dispute window or
                otherwise not yet releasable". */}
            <div className="mt-3 grid grid-cols-1 gap-2">
              <MetricTile
                labelKey="merchant_finance.pending_balance"
                value={fmt(summary.pendingBalance)}
                tone="muted"
              />
            </div>

            {data.reserveReleases.length === 0 ? (
              <p
                className="mt-4 text-[0.72rem]"
                style={{ color: 'var(--text-soft)' }}
              >
                {t('merchant_finance.reserve_releases_empty')}
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {data.reserveReleases.map((r) => (
                  <ReserveReleaseRow
                    key={r.id}
                    release={r}
                    fmt={fmt}
                    fmtDate={fmtDate}
                  />
                ))}
              </ul>
            )}
          </Card>
        </section>

        {/* === Active holds + reasons ================================
            Per FRP § 9.6.1 row 12-13: every active hold listed with
            reason + expected resolution date. Empty state when no
            holds — most merchants most of the time. */}
        <section className="mt-5">
          <h2
            className="mb-2 text-[0.7rem] font-bold uppercase tracking-[0.2em]"
            style={{ color: 'var(--muted)' }}
          >
            {t('merchant_finance.holds_title')}
          </h2>
          {data.activeHolds.length === 0 ? (
            <Card>
              <p
                className="text-[0.72rem]"
                style={{ color: 'var(--text-soft)' }}
              >
                {t('merchant_finance.holds_empty')}
              </p>
            </Card>
          ) : (
            <>
              <p
                className="mb-2 text-[0.72rem] leading-relaxed"
                style={{ color: 'var(--text-soft)' }}
              >
                {t('merchant_finance.holds_subtitle')}
              </p>
              <ul className="flex flex-col gap-2">
                {data.activeHolds.map((h) => (
                  <HoldRow
                    key={h.id}
                    hold={h}
                    fmt={fmt}
                    fmtDate={fmtDate}
                  />
                ))}
              </ul>
            </>
          )}
        </section>

        {/* === Payout delay reasons =================================
            Per FRP § 9.6.1 row 14: when the next payout estimate is
            later than the standard cadence would suggest, this
            section explains why. Empty list → happy path; just a
            brief "no delays" callout. */}
        <section className="mt-5">
          <h2
            className="mb-2 text-[0.7rem] font-bold uppercase tracking-[0.2em]"
            style={{ color: 'var(--muted)' }}
          >
            {t('merchant_finance.delays_title')}
          </h2>
          <Card>
            {data.payoutDelays.length === 0 ? (
              <p
                className="text-[0.72rem]"
                style={{ color: 'var(--text-soft)' }}
              >
                {t('merchant_finance.delays_empty')}
              </p>
            ) : (
              <ul className="flex flex-col gap-2 text-[0.72rem]">
                {data.payoutDelays.map((d, i) => (
                  <li
                    key={`${d.reason}-${i}`}
                    style={{ color: 'var(--text)' }}
                  >
                    <span style={{ color: 'var(--text)' }}>
                      {t(payoutDelayLabelKey(d.reason))}
                    </span>
                    {d.detail && (
                      <span
                        className="ms-2"
                        style={{ color: 'var(--text-soft)' }}
                      >
                        — {d.detail}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        {/* === Payout history =======================================
            Past payouts sorted newest-first. Each row: date, amount,
            bank account last4, status badge, reference. The merchant
            should be able to scan this against their bank statement
            and find the corresponding settled rows. */}
        <section className="mt-5">
          <h2
            className="mb-2 text-[0.7rem] font-bold uppercase tracking-[0.2em]"
            style={{ color: 'var(--muted)' }}
          >
            {t('merchant_finance.payout_history_title')}
          </h2>
          {data.payoutHistory.length === 0 ? (
            <Card>
              <p
                className="text-[0.72rem]"
                style={{ color: 'var(--text-soft)' }}
              >
                {t('merchant_finance.payout_history_empty')}
              </p>
            </Card>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.payoutHistory.map((p) => (
                <PayoutHistoryRow
                  key={p.id}
                  entry={p}
                  fmt={fmt}
                  fmtDate={fmtDate}
                />
              ))}
            </ul>
          )}
        </section>

        {/* === Reserve band educational copy ========================
            The merchant sees their band name + a short explanation
            of what the band means / how to progress. The numerical
            health score is NEVER shown (FRP v1.1 § 9.6.2). */}
        <section className="mt-5">
          <h2
            className="mb-2 text-[0.7rem] font-bold uppercase tracking-[0.2em]"
            style={{ color: 'var(--muted)' }}
          >
            {t('merchant_finance.band_title')}
          </h2>
          <Card>
            <div
              className="text-sm font-semibold"
              style={{ color: 'var(--text)' }}
            >
              {t(data.reserveBand.labelKey)}
            </div>
            <p
              className="mt-1 text-[0.72rem] leading-relaxed"
              style={{ color: 'var(--text-soft)' }}
            >
              {t(data.reserveBand.explainerKey)}
            </p>
          </Card>
        </section>

        {/* === Review / escalation request (DISABLED in preview) ====
            Per FRP v1.1 § 9.6.1 row 15 the dashboard exposes a path
            to request a payout review. In the preview the button is
            disabled with a hint explaining why — operators see the
            shape of the future flow without anything actually firing
            against support today. */}
        <section className="mt-5 mb-8">
          <h2
            className="mb-2 text-[0.7rem] font-bold uppercase tracking-[0.2em]"
            style={{ color: 'var(--muted)' }}
          >
            {t('merchant_finance.review_title')}
          </h2>
          <Card>
            <p
              className="text-[0.72rem] leading-relaxed"
              style={{ color: 'var(--text-soft)' }}
            >
              {t('merchant_finance.review_subtitle')}
            </p>
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="mt-3 cursor-not-allowed rounded-full border px-4 py-2 text-xs"
              style={{
                borderColor: 'var(--hairline, var(--border))',
                background: 'var(--card-soft)',
                color: 'var(--text-soft)',
                opacity: 0.7,
              }}
            >
              {t('merchant_finance.review_button')}
            </button>
            <p
              className="mt-2 text-[0.65rem]"
              style={{ color: 'var(--text-soft)' }}
            >
              {t('merchant_finance.review_disabled_hint')}
            </p>
          </Card>
        </section>
      </section>
    </PageContainer>
  )
}

// --------------------------------------------------------------------
// Sub-components — kept in the same file because they're consumed
// only by this page and never deserve their own modules. Each one
// is small, single-purpose, and refactor-friendly if the operator
// later wants to extract.
// --------------------------------------------------------------------

function MetricTile({
  labelKey,
  value,
  tone,
}: {
  labelKey: string
  value: string
  tone: 'default' | 'muted'
}) {
  const { t } = useI18n()
  return (
    <div
      className="rounded-2xl border p-3"
      style={{
        borderColor: 'var(--hairline, var(--border))',
        background: tone === 'muted' ? 'var(--card-soft)' : 'var(--card)',
      }}
    >
      <div
        className="text-[0.6rem] font-bold uppercase tracking-[0.16em]"
        style={{ color: 'var(--muted)' }}
      >
        {t(labelKey)}
      </div>
      <div
        className="mt-1 text-base font-bold tabular-nums"
        style={{ color: 'var(--text)' }}
      >
        {value}
      </div>
    </div>
  )
}

function ReserveReleaseRow({
  release,
  fmt,
  fmtDate,
}: {
  release: ReserveRelease
  fmt: (n: number) => string
  fmtDate: (iso: string) => string
}) {
  return (
    <li
      className="flex items-center justify-between rounded-xl px-3 py-2 text-[0.72rem]"
      style={{
        background: 'var(--card-soft)',
      }}
    >
      <span style={{ color: 'var(--text-soft)' }}>
        {fmtDate(release.date)}
      </span>
      <span
        className="tabular-nums font-semibold"
        style={{ color: 'var(--text)' }}
      >
        {fmt(release.amount)}
      </span>
    </li>
  )
}

function HoldRow({
  hold,
  fmt,
  fmtDate,
}: {
  hold: ActiveHold
  fmt: (n: number) => string
  fmtDate: (iso: string) => string
}) {
  const { t } = useI18n()
  return (
    <li
      className="rounded-2xl border p-3 text-[0.72rem]"
      style={{
        borderColor: 'var(--hairline, var(--border))',
        background: 'var(--card)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div
            className="font-semibold"
            style={{ color: 'var(--text)' }}
          >
            {t(holdReasonLabelKey(hold.reason))}
          </div>
          <div
            className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[0.65rem]"
            style={{ color: 'var(--text-soft)' }}
          >
            <span>
              {t('merchant_finance.hold_placed_at')}: {fmtDate(hold.placedAt)}
            </span>
            {hold.expectedResolutionDate && (
              <span>
                {t('merchant_finance.hold_expected_resolution')}:{' '}
                {fmtDate(hold.expectedResolutionDate)}
              </span>
            )}
          </div>
        </div>
        <span
          className="shrink-0 tabular-nums font-semibold"
          style={{ color: 'var(--text)' }}
        >
          {fmt(hold.amount)}
        </span>
      </div>
    </li>
  )
}

function PayoutHistoryRow({
  entry,
  fmt,
  fmtDate,
}: {
  entry: PayoutHistoryEntry
  fmt: (n: number) => string
  fmtDate: (iso: string) => string
}) {
  const { t } = useI18n()
  const colors = payoutStatusColor(entry.status)
  return (
    <li
      className="rounded-2xl border p-3 text-[0.72rem]"
      style={{
        borderColor: 'var(--hairline, var(--border))',
        background: 'var(--card)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div
            className="font-semibold"
            style={{ color: 'var(--text)' }}
          >
            {fmtDate(entry.date)}
          </div>
          <div
            className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[0.65rem]"
            style={{ color: 'var(--text-soft)' }}
          >
            <span>
              {t('merchant_finance.payout_account_last4')} •••• {entry.bankAccountLast4}
            </span>
            <span>
              {t('merchant_finance.payout_reference')}:{' '}
              <span
                className="font-mono"
                style={{ color: 'var(--text)' }}
              >
                {entry.reference}
              </span>
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className="tabular-nums font-bold"
            style={{ color: 'var(--text)' }}
          >
            {fmt(entry.amount)}
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[0.6rem] font-semibold"
            style={{
              background: colors.bg,
              color: colors.fg,
            }}
          >
            {t(payoutStatusLabelKey(entry.status))}
          </span>
        </div>
      </div>
    </li>
  )
}
