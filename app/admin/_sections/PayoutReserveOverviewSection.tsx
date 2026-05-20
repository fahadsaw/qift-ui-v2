'use client'

// Admin tab — cross-merchant operator overview of payouts, reserves,
// and risk/ops indicators. Read-only preview surfaced from static
// mock data; every action button (Approve / Reject / Release hold /
// Freeze merchant / Accept recommendation / Export real report /
// Manual reconcile / Escalate to legal) is rendered disabled.
//
// Complements the merchant-facing financial dashboard at
// /store-dashboard/finance (item 1) — same substrate, different
// lens. This view aggregates across merchants for ops.
//
// FLAG GATING
// -----------
// Section's tab is only rendered when
// NEXT_PUBLIC_SHOW_PAYOUT_RESERVE_OVERVIEW=1 is set. See
// admin/page.tsx for the gate. The constant
// `PAYOUT_RESERVE_OVERVIEW_ENABLED` exported here is the single
// source of truth.

import Card from '@/components/Card'
import { useI18n } from '@/lib/i18n'
import {
  approvalStateColor,
  approvalStateLabelKey,
  delayCategoryLabelKey,
  failureKindColor,
  failureKindLabelKey,
  PAYOUT_RESERVE_OVERVIEW_MOCK,
  payoutHoldKindLabelKey,
  priorityColor,
  priorityLabelKey,
  reconciliationStateColor,
  reconciliationStateLabelKey,
  reserveBandLabelKeyAdmin,
  reserveHoldTypeLabelKey,
  type ActivePayoutHold,
  type ActiveReserveHold,
  type BatchStatusCount,
  type DelayCategoryCount,
  type FailedPayoutExample,
  type MerchantHighReserve,
  type MerchantNeedingReview,
  type MerchantPendingPayout,
  type ReserveByBandRow,
  type ReserveDepletion,
  type StalePayoutCase,
  type UpcomingPayoutBatch,
  type UpcomingReserveReleaseRow,
} from '@/lib/payoutReserveOverviewMock'
import {
  DisabledEditButton,
  DisabledPillButton,
} from '../_components/disabled-controls'

export const PAYOUT_RESERVE_OVERVIEW_ENABLED: boolean =
  process.env.NEXT_PUBLIC_SHOW_PAYOUT_RESERVE_OVERVIEW === '1'

export function PayoutReserveOverviewSection() {
  return (
    <div className="flex flex-col gap-5">
      <MockBanner />
      <Intro />
      <FutureActionRequirements />
      <PayoutOverviewPanel />
      <ReserveOverviewPanel />
      <RiskIndicatorsPanel />
    </div>
  )
}

// --- Top-of-section banners ------------------------------------

function MockBanner() {
  const { t } = useI18n()
  return (
    <div
      role="status"
      className="rounded-2xl border px-4 py-3 text-xs"
      style={{
        borderColor:
          'color-mix(in srgb, #E89B3A 30%, var(--border))',
        background:
          'linear-gradient(135deg, rgba(232, 155, 58, 0.08) 0%, var(--card) 100%)',
        color: 'var(--text-soft)',
      }}
    >
      {t('admin.pro.mock_notice')}
    </div>
  )
}

function Intro() {
  const { t } = useI18n()
  return (
    <p
      className="text-[0.78rem] leading-relaxed"
      style={{ color: 'var(--text-soft)' }}
    >
      {t('admin.pro.intro')}
    </p>
  )
}

function FutureActionRequirements() {
  const { t } = useI18n()
  // Seven controls every future real financial action will pass
  // through. Same glyph convention as the FinancialConfig section
  // so the "preview" surfaces look like a family.
  const requirements: { glyph: string; key: string }[] = [
    { glyph: '⊕', key: 'admin.pro.future_actions_mfa' },
    { glyph: '⊞', key: 'admin.pro.future_actions_dual_approval' },
    { glyph: '⫶', key: 'admin.pro.future_actions_sod' },
    { glyph: '⊟', key: 'admin.pro.future_actions_audit' },
    { glyph: '◌', key: 'admin.pro.future_actions_snapshots' },
    { glyph: '≡', key: 'admin.pro.future_actions_recon_before_dispatch' },
    { glyph: '✓', key: 'admin.pro.future_actions_bank_confirm' },
  ]
  return (
    <Card>
      <div
        className="text-sm font-semibold"
        style={{ color: 'var(--text)' }}
      >
        {t('admin.pro.future_actions_title')}
      </div>
      <p
        className="mt-1 text-[0.72rem] leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        {t('admin.pro.future_actions_intro')}
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {requirements.map((r) => (
          <li
            key={r.key}
            className="flex items-start gap-2 text-[0.72rem] leading-relaxed"
            style={{ color: 'var(--text)' }}
          >
            <span
              aria-hidden
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[0.65rem] font-bold"
              style={{
                background: 'var(--card-soft)',
                color: 'var(--primary)',
              }}
            >
              {r.glyph}
            </span>
            <span>{t(r.key)}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ===============================================================
// PAYOUT OVERVIEW PANEL
// ===============================================================

function PayoutOverviewPanel() {
  return (
    <Panel
      titleKey="admin.pro.payout.panel_title"
      subtitleKey="admin.pro.payout.panel_subtitle"
    >
      <UpcomingBatchCard
        batch={PAYOUT_RESERVE_OVERVIEW_MOCK.payout.upcomingBatch}
      />

      <Subsection titleKey="admin.pro.payout.batches_title" subtitleKey="admin.pro.payout.batches_subtitle">
        <BatchesByStatusGrid
          rows={PAYOUT_RESERVE_OVERVIEW_MOCK.payout.batchesByStatus}
        />
      </Subsection>

      <Subsection titleKey="admin.pro.payout.pending_merchants_title" subtitleKey="admin.pro.payout.pending_merchants_subtitle">
        <ul className="flex flex-col gap-2">
          {PAYOUT_RESERVE_OVERVIEW_MOCK.payout.merchantsPending.map((m) => (
            <MerchantPendingRow key={m.merchantId} merchant={m} />
          ))}
        </ul>
      </Subsection>

      <Subsection titleKey="admin.pro.payout.holds_title" subtitleKey="admin.pro.payout.holds_subtitle">
        <ul className="flex flex-col gap-2">
          {PAYOUT_RESERVE_OVERVIEW_MOCK.payout.activeHolds.map((h) => (
            <PayoutHoldRow key={h.id} hold={h} />
          ))}
        </ul>
      </Subsection>

      <Subsection titleKey="admin.pro.payout.delays_title" subtitleKey="admin.pro.payout.delays_subtitle">
        <ul className="flex flex-col gap-2">
          {PAYOUT_RESERVE_OVERVIEW_MOCK.payout.delayCounts.map((d) => (
            <DelayCountRow key={d.category} delay={d} />
          ))}
        </ul>
      </Subsection>

      <Subsection titleKey="admin.pro.payout.failures_title" subtitleKey="admin.pro.payout.failures_subtitle">
        <ul className="flex flex-col gap-2">
          {PAYOUT_RESERVE_OVERVIEW_MOCK.payout.failedPayouts.map((f) => (
            <FailedPayoutRow key={f.id} failure={f} />
          ))}
        </ul>
      </Subsection>
    </Panel>
  )
}

function UpcomingBatchCard({ batch }: { batch: UpcomingPayoutBatch }) {
  const { t } = useI18n()
  const colors = approvalStateColor(batch.state)
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div
            className="text-[0.65rem] font-bold uppercase tracking-[0.18em]"
            style={{ color: 'var(--muted, var(--text-soft))' }}
          >
            {t('admin.pro.payout.upcoming_title')}
          </div>
          <div
            className="mt-1 font-mono text-[0.65rem]"
            style={{ color: 'var(--text-soft)' }}
          >
            {batch.id}
          </div>
        </div>
        <span
          className="shrink-0 rounded-full px-3 py-1 text-[0.6rem] font-semibold"
          style={{ background: colors.bg, color: colors.fg }}
        >
          {t(approvalStateLabelKey(batch.state))}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[0.7rem]">
        <Pair labelKey="admin.pro.payout.scheduled_for" value={batch.scheduledFor} />
        <Pair labelKey="admin.pro.payout.cadence" value={batch.cadenceTag} />
        <Pair
          labelKey="admin.pro.payout.merchant_count"
          value={String(batch.merchantCount)}
        />
        <Pair
          labelKey="admin.pro.payout.payout_count"
          value={String(batch.payoutCount)}
        />
        <Pair
          labelKey="admin.pro.payout.proposed_total"
          value={fmtSar(batch.proposedTotal)}
          strong
        />
      </dl>

      <div
        className="mt-3 rounded-xl p-2 text-[0.65rem]"
        style={{ background: 'var(--card-soft)' }}
      >
        <div
          className="mb-1 font-semibold"
          style={{ color: 'var(--text)' }}
        >
          {t('admin.pro.payout.approval_chain')}
        </div>
        <Pair
          labelKey="admin.pro.payout.submitted_by"
          value={batch.submittedBy ?? '—'}
        />
        <Pair
          labelKey="admin.pro.payout.approver_1"
          value={batch.approver1 ?? t('admin.pro.payout.pending_human')}
        />
        <Pair
          labelKey="admin.pro.payout.approver_2"
          value={batch.approver2 ?? t('admin.pro.payout.pending_human')}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <DisabledPillButton labelKey="admin.pro.payout.approve_disabled" tone="primary" />
        <DisabledPillButton labelKey="admin.pro.payout.reject_disabled" tone="muted" />
      </div>
    </Card>
  )
}

function BatchesByStatusGrid({
  rows,
}: {
  rows: BatchStatusCount[]
}) {
  const { t } = useI18n()
  return (
    <ul className="grid grid-cols-2 gap-2">
      {rows.map((r) => {
        const colors = approvalStateColor(r.state)
        return (
          <li
            key={r.state}
            className="rounded-2xl border p-3"
            style={{
              borderColor: 'var(--hairline, var(--border))',
              background: 'var(--card)',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className="rounded-full px-2 py-0.5 text-[0.6rem] font-semibold"
                style={{ background: colors.bg, color: colors.fg }}
              >
                {t(approvalStateLabelKey(r.state))}
              </span>
              <span
                className="font-bold tabular-nums"
                style={{ color: 'var(--text)' }}
              >
                {r.batchCount}
              </span>
            </div>
            <div
              className="mt-1 text-[0.65rem] tabular-nums"
              style={{ color: 'var(--text-soft)' }}
            >
              {fmtSar(r.totalAmount)}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function MerchantPendingRow({
  merchant,
}: {
  merchant: MerchantPendingPayout
}) {
  const { t } = useI18n()
  return (
    <li
      className="rounded-2xl border p-3 text-[0.72rem]"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div
            className="text-sm font-semibold"
            style={{ color: 'var(--text)' }}
          >
            {merchant.merchantDisplay}
          </div>
          <div
            className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-[0.65rem]"
            style={{ color: 'var(--text-soft)' }}
          >
            <span className="font-mono">{merchant.merchantId}</span>
            <span>{t(reserveBandLabelKeyAdmin(merchant.band))}</span>
            <span>
              {merchant.allocationCount}{' '}
              <span style={{ opacity: 0.6 }}>allocations</span>
            </span>
          </div>
        </div>
        <span
          className="shrink-0 tabular-nums font-semibold"
          style={{ color: 'var(--text)' }}
        >
          {fmtSar(merchant.netPayable)}
        </span>
      </div>
    </li>
  )
}

function PayoutHoldRow({ hold }: { hold: ActivePayoutHold }) {
  const { t } = useI18n()
  return (
    <li
      className="rounded-2xl border p-3 text-[0.72rem]"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div
            className="text-sm font-semibold"
            style={{ color: 'var(--text)' }}
          >
            {hold.merchantDisplay}
          </div>
          <div
            className="mt-0.5 font-mono text-[0.65rem]"
            style={{ color: 'var(--text-soft)' }}
          >
            {hold.merchantId}
          </div>
          <div
            className="mt-1 text-[0.7rem] font-semibold"
            style={{ color: 'var(--warning, #b35900)' }}
          >
            {t(payoutHoldKindLabelKey(hold.kind))}
          </div>
          <div
            className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[0.6rem]"
            style={{ color: 'var(--text-soft)' }}
          >
            <span>
              {t('admin.pro.payout.hold_placed_at')}: {hold.placedAt}
            </span>
            <span>
              {t('admin.pro.payout.hold_placed_by')}:{' '}
              <span className="font-mono">{hold.placedBy}</span>
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className="tabular-nums font-semibold"
            style={{ color: 'var(--text)' }}
          >
            {fmtSar(hold.amount)}
          </span>
          <div className="flex flex-col gap-1">
            <DisabledPillButton
              labelKey="admin.pro.payout.hold_release_disabled"
              tone="primary"
            />
            <DisabledPillButton
              labelKey="admin.pro.payout.hold_freeze_merchant_disabled"
              tone="muted"
            />
          </div>
        </div>
      </div>
    </li>
  )
}

function DelayCountRow({ delay }: { delay: DelayCategoryCount }) {
  const { t } = useI18n()
  return (
    <li
      className="flex items-center justify-between rounded-xl px-3 py-2 text-[0.72rem]"
      style={{ background: 'var(--card-soft)' }}
    >
      <span style={{ color: 'var(--text)' }}>
        {t(delayCategoryLabelKey(delay.category))}
      </span>
      <span
        className="tabular-nums font-bold"
        style={{ color: 'var(--text)' }}
      >
        {delay.merchantCount}
      </span>
    </li>
  )
}

function FailedPayoutRow({ failure }: { failure: FailedPayoutExample }) {
  const { t } = useI18n()
  const kindColors = failureKindColor(failure.kind)
  return (
    <li
      className="rounded-2xl border p-3 text-[0.72rem]"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div
            className="text-sm font-semibold"
            style={{ color: 'var(--text)' }}
          >
            {failure.merchantDisplay}
          </div>
          <div
            className="mt-0.5 font-mono text-[0.65rem]"
            style={{ color: 'var(--text-soft)' }}
          >
            {failure.merchantId} • {failure.id}
          </div>
          <div
            className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[0.6rem]"
            style={{ color: 'var(--text-soft)' }}
          >
            <span>
              {t('admin.pro.payout.failure_reason_code')}:{' '}
              <span
                className="font-mono"
                style={{ color: 'var(--text)' }}
              >
                {failure.reasonCode}
              </span>
            </span>
            <span>{failure.failedAt}</span>
            <span>
              {failure.autoRetry
                ? t('admin.pro.payout.failure_auto_retry_yes')
                : t('admin.pro.payout.failure_auto_retry_no')}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[0.6rem] font-semibold"
            style={{ background: kindColors.bg, color: kindColors.fg }}
          >
            {t(failureKindLabelKey(failure.kind))}
          </span>
          <span
            className="tabular-nums font-semibold"
            style={{ color: 'var(--text)' }}
          >
            {fmtSar(failure.amount)}
          </span>
          <DisabledPillButton
            labelKey="admin.pro.payout.failure_reconcile_disabled"
            tone="muted"
          />
        </div>
      </div>
    </li>
  )
}

// ===============================================================
// RESERVE OVERVIEW PANEL
// ===============================================================

function ReserveOverviewPanel() {
  return (
    <Panel
      titleKey="admin.pro.reserve.panel_title"
      subtitleKey="admin.pro.reserve.panel_subtitle"
    >
      <ReserveTotalsCard />

      <Subsection titleKey="admin.pro.reserve.by_band_title" subtitleKey="admin.pro.reserve.by_band_subtitle">
        <ul className="flex flex-col gap-2">
          {PAYOUT_RESERVE_OVERVIEW_MOCK.reserve.byBand.map((row) => (
            <ReserveByBandRowCard key={row.band} row={row} />
          ))}
        </ul>
      </Subsection>

      <Subsection titleKey="admin.pro.reserve.high_exposure_title" subtitleKey="admin.pro.reserve.high_exposure_subtitle">
        <ul className="flex flex-col gap-2">
          {PAYOUT_RESERVE_OVERVIEW_MOCK.reserve.highExposure.map((m) => (
            <HighReserveRow key={m.merchantId} merchant={m} />
          ))}
        </ul>
      </Subsection>

      <Subsection titleKey="admin.pro.reserve.releases_title" subtitleKey="admin.pro.reserve.releases_subtitle">
        <ul className="flex flex-col gap-2">
          {PAYOUT_RESERVE_OVERVIEW_MOCK.reserve.upcomingReleases.map((r) => (
            <UpcomingReleaseRow key={r.id} release={r} />
          ))}
        </ul>
      </Subsection>

      <Subsection titleKey="admin.pro.reserve.holds_title" subtitleKey="admin.pro.reserve.holds_subtitle">
        <ul className="flex flex-col gap-2">
          {PAYOUT_RESERVE_OVERVIEW_MOCK.reserve.activeHolds.map((h) => (
            <ReserveHoldRow key={h.id} hold={h} />
          ))}
        </ul>
      </Subsection>

      <Subsection titleKey="admin.pro.reserve.depletions_title" subtitleKey="admin.pro.reserve.depletions_subtitle">
        <ul className="flex flex-col gap-2">
          {PAYOUT_RESERVE_OVERVIEW_MOCK.reserve.depletions.map((d) => (
            <DepletionRow key={d.merchantId} depletion={d} />
          ))}
        </ul>
      </Subsection>

      <RecQueueCard />
    </Panel>
  )
}

function ReserveTotalsCard() {
  const { t } = useI18n()
  const totals = PAYOUT_RESERVE_OVERVIEW_MOCK.reserve.totals
  return (
    <Card>
      <div
        className="text-[0.65rem] font-bold uppercase tracking-[0.18em]"
        style={{ color: 'var(--muted, var(--text-soft))' }}
      >
        {t('admin.pro.reserve.totals_title')}
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <div
            className="text-[0.6rem] font-bold uppercase tracking-[0.16em]"
            style={{ color: 'var(--muted)' }}
          >
            {t('admin.pro.reserve.total_balance')}
          </div>
          <div
            className="mt-1 text-xl font-extrabold tabular-nums"
            style={{ color: 'var(--primary)' }}
          >
            {fmtSar(totals.currentBalance)}
          </div>
        </div>
        <div>
          <div
            className="text-[0.6rem] font-bold uppercase tracking-[0.16em]"
            style={{ color: 'var(--muted)' }}
          >
            {t('admin.pro.reserve.total_merchants')}
          </div>
          <div
            className="mt-1 text-base font-bold tabular-nums"
            style={{ color: 'var(--text)' }}
          >
            {totals.merchantCount}
          </div>
        </div>
      </div>
    </Card>
  )
}

function ReserveByBandRowCard({ row }: { row: ReserveByBandRow }) {
  const { t } = useI18n()
  return (
    <li
      className="rounded-2xl border p-3 text-[0.72rem]"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div
            className="text-sm font-semibold"
            style={{ color: 'var(--text)' }}
          >
            {t(reserveBandLabelKeyAdmin(row.band))}
          </div>
          <div
            className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[0.65rem]"
            style={{ color: 'var(--text-soft)' }}
          >
            <span>
              <span style={{ opacity: 0.7 }}>
                {t('admin.pro.reserve.band_merchants')}:{' '}
              </span>
              <span style={{ color: 'var(--text)' }}>
                {row.merchantCount}
              </span>
            </span>
          </div>
        </div>
        <span
          className="shrink-0 tabular-nums font-semibold"
          style={{ color: 'var(--text)' }}
        >
          {fmtSar(row.totalReserve)}
        </span>
      </div>
    </li>
  )
}

function HighReserveRow({ merchant }: { merchant: MerchantHighReserve }) {
  const { t } = useI18n()
  return (
    <li
      className="rounded-2xl border p-3 text-[0.72rem]"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div
            className="text-sm font-semibold"
            style={{ color: 'var(--text)' }}
          >
            {merchant.merchantDisplay}
          </div>
          <div
            className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-[0.65rem]"
            style={{ color: 'var(--text-soft)' }}
          >
            <span className="font-mono">{merchant.merchantId}</span>
            <span>{t(reserveBandLabelKeyAdmin(merchant.band))}</span>
            <span>
              <span style={{ opacity: 0.7 }}>
                {t('admin.pro.reserve.coverage_days')}:{' '}
              </span>
              <span style={{ color: 'var(--text)' }}>
                {merchant.coverageDays}
              </span>
            </span>
          </div>
        </div>
        <span
          className="shrink-0 tabular-nums font-semibold"
          style={{ color: 'var(--text)' }}
        >
          {fmtSar(merchant.reserveHeld)}
        </span>
      </div>
    </li>
  )
}

function UpcomingReleaseRow({
  release,
}: {
  release: UpcomingReserveReleaseRow
}) {
  return (
    <li
      className="flex items-center justify-between rounded-xl px-3 py-2 text-[0.72rem]"
      style={{ background: 'var(--card-soft)' }}
    >
      <span style={{ color: 'var(--text-soft)' }}>{release.date}</span>
      <span
        className="text-[0.65rem]"
        style={{ color: 'var(--text-soft)' }}
      >
        {release.merchantCount}{' '}
        <span style={{ opacity: 0.7 }}>merchants</span>
      </span>
      <span
        className="tabular-nums font-semibold"
        style={{ color: 'var(--text)' }}
      >
        {fmtSar(release.totalAmount)}
      </span>
    </li>
  )
}

function ReserveHoldRow({ hold }: { hold: ActiveReserveHold }) {
  const { t } = useI18n()
  return (
    <li
      className="rounded-2xl border p-3 text-[0.72rem]"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div
            className="text-sm font-semibold"
            style={{ color: 'var(--text)' }}
          >
            {hold.merchantDisplay}
          </div>
          <div
            className="mt-0.5 font-mono text-[0.65rem]"
            style={{ color: 'var(--text-soft)' }}
          >
            {hold.merchantId}
          </div>
          <div
            className="mt-1 text-[0.7rem] font-semibold"
            style={{ color: 'var(--text)' }}
          >
            {t(reserveHoldTypeLabelKey(hold.type))}
          </div>
          <div
            className="mt-1 text-[0.6rem]"
            style={{ color: 'var(--text-soft)' }}
          >
            {hold.placedAt}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className="tabular-nums font-semibold"
            style={{ color: 'var(--text)' }}
          >
            {fmtSar(hold.amount)}
          </span>
          <DisabledPillButton
            labelKey="admin.pro.reserve.hold_release_disabled"
            tone="muted"
          />
        </div>
      </div>
    </li>
  )
}

function DepletionRow({ depletion }: { depletion: ReserveDepletion }) {
  const { t } = useI18n()
  return (
    <li
      className="rounded-2xl border p-3 text-[0.72rem]"
      style={{
        borderColor:
          'color-mix(in srgb, var(--danger, #b03030) 25%, var(--border))',
        background: 'var(--card)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div
            className="text-sm font-semibold"
            style={{ color: 'var(--text)' }}
          >
            {depletion.merchantDisplay}
          </div>
          <div
            className="mt-0.5 font-mono text-[0.65rem]"
            style={{ color: 'var(--text-soft)' }}
          >
            {depletion.merchantId}
          </div>
          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.65rem]">
            <Pair
              labelKey="admin.pro.reserve.depletion_balance"
              value={fmtSar(depletion.reserveBalance)}
            />
            <Pair
              labelKey="admin.pro.reserve.depletion_obligations"
              value={fmtSar(depletion.pendingObligations)}
            />
            <Pair
              labelKey="admin.pro.reserve.depletion_shortfall"
              value={fmtSar(depletion.netShortfall)}
              strong
            />
          </dl>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[0.6rem] font-semibold"
            style={{
              background: 'var(--danger-soft, #fde7e7)',
              color: 'var(--danger, #b03030)',
            }}
          >
            {t(
              depletion.state === 'depleted'
                ? 'admin.pro.reserve.depletion_state_depleted'
                : 'admin.pro.reserve.depletion_state_under_recovery',
            )}
          </span>
          <DisabledPillButton
            labelKey="admin.pro.reserve.escalate_disabled"
            tone="muted"
          />
        </div>
      </div>
    </li>
  )
}

function RecQueueCard() {
  const { t } = useI18n()
  const q = PAYOUT_RESERVE_OVERVIEW_MOCK.reserve.recommendationQueue
  return (
    <Card>
      <div
        className="text-sm font-semibold"
        style={{ color: 'var(--text)' }}
      >
        {t('admin.pro.reserve.recqueue_title')}
      </div>
      <p
        className="mt-1 text-[0.7rem] leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        {t('admin.pro.reserve.recqueue_subtitle')}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[0.7rem]">
        <Pair
          labelKey="admin.pro.reserve.recqueue_loosen"
          value={String(q.pendingLoosen)}
        />
        <Pair
          labelKey="admin.pro.reserve.recqueue_tighten"
          value={String(q.pendingTighten)}
        />
        <Pair
          labelKey="admin.pro.reserve.recqueue_total"
          value={String(q.totalQueued)}
          strong
        />
        <Pair
          labelKey="admin.pro.reserve.recqueue_awaiting_days"
          value={String(q.awaitingReviewDays)}
        />
      </dl>
      <div className="mt-3">
        <DisabledPillButton
          labelKey="admin.pro.reserve.recqueue_open_disabled"
          tone="primary"
        />
      </div>
    </Card>
  )
}

// ===============================================================
// RISK / OPS INDICATORS PANEL
// ===============================================================

function RiskIndicatorsPanel() {
  return (
    <Panel
      titleKey="admin.pro.risk.panel_title"
      subtitleKey="admin.pro.risk.panel_subtitle"
    >
      <Subsection titleKey="admin.pro.risk.review_title" subtitleKey="admin.pro.risk.review_subtitle">
        <ul className="flex flex-col gap-2">
          {PAYOUT_RESERVE_OVERVIEW_MOCK.risk.merchantsNeedingReview.map((m) => (
            <ReviewRow key={m.merchantId} merchant={m} />
          ))}
        </ul>
      </Subsection>

      <ExposureCard />
      <ReconciliationCard />

      <Subsection titleKey="admin.pro.risk.stale_title" subtitleKey="admin.pro.risk.stale_subtitle">
        <ul className="flex flex-col gap-2">
          {PAYOUT_RESERVE_OVERVIEW_MOCK.risk.stalePayouts.map((c) => (
            <StalePayoutRow key={c.id} stale={c} />
          ))}
        </ul>
      </Subsection>
    </Panel>
  )
}

function ReviewRow({ merchant }: { merchant: MerchantNeedingReview }) {
  const { t } = useI18n()
  const colors = priorityColor(merchant.priority)
  return (
    <li
      className="rounded-2xl border p-3 text-[0.72rem]"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div
            className="text-sm font-semibold"
            style={{ color: 'var(--text)' }}
          >
            {merchant.merchantDisplay}
          </div>
          <div
            className="mt-0.5 font-mono text-[0.65rem]"
            style={{ color: 'var(--text-soft)' }}
          >
            {merchant.merchantId}
          </div>
          <p
            className="mt-1 text-[0.7rem] leading-relaxed"
            style={{ color: 'var(--text-soft)' }}
          >
            {t(merchant.reasonKey)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[0.6rem] font-semibold"
            style={{ background: colors.bg, color: colors.fg }}
          >
            {t(priorityLabelKey(merchant.priority))}
          </span>
          <DisabledEditButton />
        </div>
      </div>
    </li>
  )
}

function ExposureCard() {
  const { t } = useI18n()
  const e = PAYOUT_RESERVE_OVERVIEW_MOCK.risk.exposure
  const rows: { labelKey: string; amount: number; count: number }[] = [
    {
      labelKey: 'admin.pro.risk.exposure_chargeback',
      amount: e.chargebackPending,
      count: e.chargebackMerchantCount,
    },
    {
      labelKey: 'admin.pro.risk.exposure_refund',
      amount: e.refundPending,
      count: e.refundMerchantCount,
    },
    {
      labelKey: 'admin.pro.risk.exposure_dispute',
      amount: e.disputePending,
      count: e.disputeMerchantCount,
    },
  ]
  return (
    <Card>
      <div
        className="text-sm font-semibold"
        style={{ color: 'var(--text)' }}
      >
        {t('admin.pro.risk.exposure_title')}
      </div>
      <p
        className="mt-1 text-[0.7rem] leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        {t('admin.pro.risk.exposure_subtitle')}
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {rows.map((row) => (
          <li
            key={row.labelKey}
            className="flex items-center justify-between rounded-xl px-3 py-2 text-[0.72rem]"
            style={{ background: 'var(--card-soft)' }}
          >
            <div className="min-w-0 flex-1">
              <div style={{ color: 'var(--text)' }}>{t(row.labelKey)}</div>
              <div
                className="text-[0.6rem]"
                style={{ color: 'var(--text-soft)' }}
              >
                {t('admin.pro.risk.exposure_merchant_count_short')}{' '}
                {row.count} {t('admin.pro.risk.exposure_merchants')}
              </div>
            </div>
            <span
              className="tabular-nums font-semibold"
              style={{ color: 'var(--text)' }}
            >
              {fmtSar(row.amount)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function ReconciliationCard() {
  const { t } = useI18n()
  const r = PAYOUT_RESERVE_OVERVIEW_MOCK.risk.reconciliation
  const colors = reconciliationStateColor(r.state)
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div
            className="text-sm font-semibold"
            style={{ color: 'var(--text)' }}
          >
            {t('admin.pro.risk.recon_title')}
          </div>
          <p
            className="mt-1 text-[0.7rem] leading-relaxed"
            style={{ color: 'var(--text-soft)' }}
          >
            {t('admin.pro.risk.recon_subtitle')}
          </p>
        </div>
        <span
          className="shrink-0 rounded-full px-3 py-1 text-[0.6rem] font-semibold"
          style={{ background: colors.bg, color: colors.fg }}
        >
          {t(reconciliationStateLabelKey(r.state))}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[0.7rem]">
        <Pair
          labelKey="admin.pro.risk.recon_last_clean"
          value={r.lastCleanRunAt}
        />
        <Pair
          labelKey="admin.pro.risk.recon_last_drift"
          value={r.lastDriftDetectedAt ?? t('admin.pro.risk.recon_none')}
        />
        <Pair
          labelKey="admin.pro.risk.recon_drift_count"
          value={String(r.currentDriftCount)}
        />
      </dl>
      <div className="mt-3">
        <DisabledPillButton
          labelKey="admin.pro.risk.recon_export_disabled"
          tone="muted"
        />
      </div>
    </Card>
  )
}

function StalePayoutRow({ stale }: { stale: StalePayoutCase }) {
  const { t } = useI18n()
  return (
    <li
      className="rounded-2xl border p-3 text-[0.72rem]"
      style={{
        borderColor:
          'color-mix(in srgb, var(--warning, #b35900) 30%, var(--border))',
        background: 'var(--card)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div
            className="text-sm font-semibold"
            style={{ color: 'var(--text)' }}
          >
            {stale.merchantDisplay}
          </div>
          <div
            className="mt-0.5 font-mono text-[0.65rem]"
            style={{ color: 'var(--text-soft)' }}
          >
            {stale.merchantId} • {stale.id}
          </div>
          <p
            className="mt-1 text-[0.7rem]"
            style={{ color: 'var(--text-soft)' }}
          >
            {t(stale.awaitingKey)}
          </p>
          <div
            className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[0.6rem]"
            style={{ color: 'var(--text-soft)' }}
          >
            <span>
              {t('admin.pro.risk.stale_age_days')}: {stale.ageDays}
            </span>
            <span>{stale.stuckSinceDate}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className="tabular-nums font-semibold"
            style={{ color: 'var(--text)' }}
          >
            {fmtSar(stale.amount)}
          </span>
          <DisabledPillButton
            labelKey="admin.pro.risk.stale_reconcile_disabled"
            tone="muted"
          />
        </div>
      </div>
    </li>
  )
}

// ===============================================================
// Shared primitives
// ===============================================================

function Panel({
  titleKey,
  subtitleKey,
  children,
}: {
  titleKey: string
  subtitleKey: string
  children: React.ReactNode
}) {
  const { t } = useI18n()
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3
          className="text-sm font-semibold"
          style={{ color: 'var(--text)' }}
        >
          {t(titleKey)}
        </h3>
        <p
          className="mt-0.5 text-[0.72rem] leading-relaxed"
          style={{ color: 'var(--text-soft)' }}
        >
          {t(subtitleKey)}
        </p>
      </div>
      {children}
    </section>
  )
}

function Subsection({
  titleKey,
  subtitleKey,
  children,
}: {
  titleKey: string
  subtitleKey?: string
  children: React.ReactNode
}) {
  const { t } = useI18n()
  return (
    <div className="mt-3 flex flex-col gap-2">
      <h4
        className="text-[0.65rem] font-bold uppercase tracking-[0.16em]"
        style={{ color: 'var(--muted, var(--text-soft))' }}
      >
        {t(titleKey)}
      </h4>
      {subtitleKey && (
        <p
          className="text-[0.7rem] leading-relaxed"
          style={{ color: 'var(--text-soft)' }}
        >
          {t(subtitleKey)}
        </p>
      )}
      {children}
    </div>
  )
}

function Pair({
  labelKey,
  value,
  strong,
}: {
  labelKey: string
  value: string
  strong?: boolean
}) {
  const { t } = useI18n()
  return (
    <span style={{ color: 'var(--text-soft)' }}>
      <span style={{ opacity: 0.7 }}>{t(labelKey)}: </span>
      <span
        className="tabular-nums"
        style={{
          color: 'var(--text)',
          fontWeight: strong ? 700 : 500,
        }}
      >
        {value}
      </span>
    </span>
  )
}

// Numeric formatter. SAR-only at launch (FRP § 7.2 says other GCC
// markets are schema-ready + disabled). Uses Arabic digit grouping
// when the active locale is Arabic.
function fmtSar(n: number): string {
  // The Intl.NumberFormat locale will be applied by useI18n elsewhere
  // when callers wrap; for the cross-cutting helper we keep it
  // simple — modern browsers render Arabic-Indic digits when the
  // <html lang> is set to 'ar' regardless of the locale arg.
  const formatted = n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${formatted} SAR`
}
