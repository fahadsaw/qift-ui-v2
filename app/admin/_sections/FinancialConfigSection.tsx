'use client'

// Admin tab — surfaces the platform financial-rule configuration
// as a read-only preview. Three panels: Fee rules (FRP v1.1 § 5 +
// § 17.1), Shipping rules (§ 6 + § 17.2 + § 17.11), Reserve bands
// + per-merchant overrides + monitoring recommendations (§ 8 +
// §§ 4.7-4.46).
//
// SAFETY POSTURE
// --------------
// Every interactive control (Edit / Add / Accept-recommendation /
// Reject-recommendation) is rendered as a disabled <button>, with
// aria-disabled="true" + a tooltip / hint copy explaining the
// preview status. The section is a SHOWCASE of the future config
// surface; it does not call any backend, mutate any state, or run
// any side effect.
//
// FLAG GATING
// -----------
// The section's tab is only rendered when
// NEXT_PUBLIC_SHOW_FINANCIAL_CONFIG=1 is set in the build env. See
// admin/page.tsx for the gate. The constant
// `FINANCIAL_CONFIG_ENABLED` exported from this module is the
// single source of truth.
//
// Per FRP § 5.4 + § 8.2.1 + § 17.10 + § 19, any real edit will
// require MFA + dual-control where applicable + structured reason
// + append-only audit-log entry + new versioned rule + snapshot on
// applied orders. A prominent "Future real-edit requirements" card
// at the top of the section makes those constraints visible to
// every operator reading the preview.

import Card from '@/components/Card'
import { useI18n } from '@/lib/i18n'
import {
  configStatusColor,
  configStatusLabelKey,
  feeBearerLabelKey,
  feeScopeLabelKey,
  FINANCIAL_CONFIG_MOCK,
  funderLabelKey,
  recommendationConfidenceLabelKey,
  reserveBandLabelKey,
  shippingScopeLabelKey,
  type ConfigStatus,
  type FeeRule,
  type ReserveBand,
  type ReserveOverride,
  type ReserveRecommendation,
  type ShippingRule,
} from '@/lib/financialConfigMock'
import {
  DisabledEditButton,
  DisabledPillButton,
} from '../_components/disabled-controls'

// Opt-in build-time flag. Default OFF. The admin page's SECTIONS
// list only includes the financial-config tab when this is true;
// the section component itself is harmless to render but the tab
// nav should not advertise a preview surface to every admin in
// production.
export const FINANCIAL_CONFIG_ENABLED: boolean =
  process.env.NEXT_PUBLIC_SHOW_FINANCIAL_CONFIG === '1'

export function FinancialConfigSection() {
  return (
    <div className="flex flex-col gap-5">
      <MockBanner />
      <Intro />
      <FutureEditRequirements />
      <FeeRulesPanel />
      <ShippingRulesPanel />
      <ReservePanel />
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
        // Warm-amber treatment matching /payouts + /merchant-finance
        // mock-notice patterns so the "preview" signal reads
        // consistently across the whole UI.
        borderColor:
          'color-mix(in srgb, #E89B3A 30%, var(--border))',
        background:
          'linear-gradient(135deg, rgba(232, 155, 58, 0.08) 0%, var(--card) 100%)',
        color: 'var(--text-soft)',
      }}
    >
      {t('admin.fincfg.mock_notice')}
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
      {t('admin.fincfg.intro')}
    </p>
  )
}

// --- "Future real-edit requirements" block ---------------------
//
// The five controls every future edit will pass through. Surfacing
// them up front sets reviewer expectations + documents the design
// intent for anyone reading the preview without the engineering
// docs at hand.

function FutureEditRequirements() {
  const { t } = useI18n()
  const requirements: { glyph: string; key: string }[] = [
    { glyph: '⊕', key: 'admin.fincfg.future_edits_mfa' },
    { glyph: '⊞', key: 'admin.fincfg.future_edits_dual_approval' },
    { glyph: '⊟', key: 'admin.fincfg.future_edits_audit_log' },
    { glyph: '↺', key: 'admin.fincfg.future_edits_versioning' },
    { glyph: '◌', key: 'admin.fincfg.future_edits_snapshot' },
  ]
  return (
    <Card>
      <div
        className="text-sm font-semibold"
        style={{ color: 'var(--text)' }}
      >
        {t('admin.fincfg.future_edits_title')}
      </div>
      <p
        className="mt-1 text-[0.72rem] leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        {t('admin.fincfg.future_edits_intro')}
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

// --- Fee rules panel -------------------------------------------

function FeeRulesPanel() {
  return (
    <Panel
      titleKey="admin.fincfg.fee.panel_title"
      subtitleKey="admin.fincfg.fee.panel_subtitle"
      addButtonKey="admin.fincfg.add_rule_disabled"
    >
      <ul className="flex flex-col gap-2">
        {FINANCIAL_CONFIG_MOCK.feeRules.map((rule) => (
          <FeeRuleCard key={rule.id} rule={rule} />
        ))}
      </ul>
    </Panel>
  )
}

function FeeRuleCard({ rule }: { rule: FeeRule }) {
  const { t } = useI18n()
  return (
    <li
      className="rounded-2xl border p-4"
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
            {t(rule.nameKey)}
          </div>
          {rule.scopeDetail && (
            <div
              className="mt-0.5 font-mono text-[0.65rem]"
              style={{ color: 'var(--text-soft)' }}
            >
              {rule.scopeDetail}
            </div>
          )}
          {rule.noteKey && (
            <p
              className="mt-1.5 text-[0.72rem] leading-relaxed"
              style={{ color: 'var(--text-soft)' }}
            >
              {t(rule.noteKey)}
            </p>
          )}
          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.65rem]">
            <PairItem
              labelKey="admin.fincfg.fee.formula_label"
              value={rule.formula}
            />
            <PairItem
              labelKey="admin.fincfg.fee.bearer_label"
              value={t(feeBearerLabelKey(rule.bearerModel))}
            />
            <PairItem
              labelKey="admin.fincfg.fee.funder_label"
              value={t(funderLabelKey(rule.funder))}
            />
            <PairItem
              labelKey="admin.fincfg.fee.scope_label"
              value={t(feeScopeLabelKey(rule.scope))}
            />
            {rule.effectiveFrom && (
              <PairItem
                labelKey="admin.fincfg.fee.effective_from"
                value={`${rule.effectiveFrom}${
                  rule.effectiveTo
                    ? ` (${t('admin.fincfg.fee.effective_to')} ${rule.effectiveTo})`
                    : ''
                }`}
              />
            )}
          </dl>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <StatusBadge status={rule.status} />
          <DisabledEditButton />
        </div>
      </div>
    </li>
  )
}

// --- Shipping rules panel --------------------------------------

function ShippingRulesPanel() {
  return (
    <Panel
      titleKey="admin.fincfg.ship.panel_title"
      subtitleKey="admin.fincfg.ship.panel_subtitle"
      addButtonKey="admin.fincfg.add_rule_disabled"
    >
      <ul className="flex flex-col gap-2">
        {FINANCIAL_CONFIG_MOCK.shippingRules.map((rule) => (
          <ShippingRuleCard key={rule.id} rule={rule} />
        ))}
      </ul>
    </Panel>
  )
}

function ShippingRuleCard({ rule }: { rule: ShippingRule }) {
  const { t } = useI18n()
  return (
    <li
      className="rounded-2xl border p-4"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        // Future-only rules render at reduced opacity so the
        // operator sees them as deferred (Stage 13+ posture).
        opacity: rule.isFuture ? 0.6 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div
            className="text-sm font-semibold"
            style={{ color: 'var(--text)' }}
          >
            {t(rule.nameKey)}
          </div>
          {rule.scopeDetail && (
            <div
              className="mt-0.5 font-mono text-[0.65rem]"
              style={{ color: 'var(--text-soft)' }}
            >
              {rule.scopeDetail}
            </div>
          )}
          {rule.noteKey && (
            <p
              className="mt-1.5 text-[0.72rem] leading-relaxed"
              style={{ color: 'var(--text-soft)' }}
            >
              {t(rule.noteKey)}
            </p>
          )}
          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.65rem]">
            <PairItem
              labelKey="admin.fincfg.ship.formula_label"
              value={rule.formula}
            />
            <PairItem
              labelKey="admin.fincfg.ship.funder_label"
              value={t(funderLabelKey(rule.funder))}
            />
            <PairItem
              labelKey="admin.fincfg.ship.scope_label"
              value={t(shippingScopeLabelKey(rule.scope))}
            />
            {rule.effectiveFrom && (
              <PairItem
                labelKey="admin.fincfg.fee.effective_from"
                value={`${rule.effectiveFrom}${
                  rule.effectiveTo
                    ? ` (${t('admin.fincfg.fee.effective_to')} ${rule.effectiveTo})`
                    : ''
                }`}
              />
            )}
          </dl>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <StatusBadge status={rule.status} />
          <DisabledEditButton />
        </div>
      </div>
    </li>
  )
}

// --- Reserve panel ---------------------------------------------

function ReservePanel() {
  return (
    <Panel
      titleKey="admin.fincfg.reserve.panel_title"
      subtitleKey="admin.fincfg.reserve.panel_subtitle"
      addButtonKey="admin.fincfg.add_rule_disabled"
    >
      <SubsectionHeading
        labelKey="admin.fincfg.reserve.bands_section"
      />
      <ul className="flex flex-col gap-2">
        {FINANCIAL_CONFIG_MOCK.reserveBands.map((band) => (
          <ReserveBandCard key={band.code} band={band} />
        ))}
      </ul>

      <SubsectionHeading
        labelKey="admin.fincfg.reserve.overrides_section"
      />
      <ul className="flex flex-col gap-2">
        {FINANCIAL_CONFIG_MOCK.reserveOverrides.map((ov) => (
          <ReserveOverrideCard key={ov.id} override={ov} />
        ))}
      </ul>

      <SubsectionHeading
        labelKey="admin.fincfg.reserve.recommendations_section"
      />
      <ul className="flex flex-col gap-2">
        {FINANCIAL_CONFIG_MOCK.reserveRecommendations.map((rec) => (
          <ReserveRecommendationCard key={rec.id} rec={rec} />
        ))}
      </ul>
    </Panel>
  )
}

function ReserveBandCard({ band }: { band: ReserveBand }) {
  const { t } = useI18n()
  return (
    <li
      className="rounded-2xl border p-4"
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
            {t(band.labelKey)}
          </div>
          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.65rem]">
            <PairItem
              labelKey="admin.fincfg.reserve.reserve_percent"
              value={band.reservePercent}
            />
            <PairItem
              labelKey="admin.fincfg.reserve.hold_period"
              value={band.holdPeriod}
            />
          </dl>
          <p
            className="mt-2 text-[0.72rem] leading-relaxed"
            style={{ color: 'var(--text-soft)' }}
          >
            <span style={{ opacity: 0.7 }}>
              {t('admin.fincfg.reserve.eligibility')}:{' '}
            </span>
            {t(band.eligibilityKey)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <StatusBadge status={band.status} />
          <DisabledEditButton />
        </div>
      </div>
    </li>
  )
}

function ReserveOverrideCard({ override }: { override: ReserveOverride }) {
  const { t } = useI18n()
  return (
    <li
      className="rounded-2xl border p-4"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div
            className="font-mono text-[0.78rem] font-semibold"
            style={{ color: 'var(--text)' }}
          >
            {override.merchantId}
          </div>
          <div
            className="mt-0.5 text-[0.7rem]"
            style={{ color: 'var(--text-soft)' }}
          >
            {t(reserveBandLabelKey(override.baseBand))} →{' '}
            <strong style={{ color: 'var(--text)' }}>
              {override.overrideReservePercent}
            </strong>{' '}
            / {override.overrideHoldPeriod}
          </div>
          <p
            className="mt-2 text-[0.72rem] leading-relaxed"
            style={{ color: 'var(--text-soft)' }}
          >
            {t(override.reasonKey)}
          </p>
          <div
            className="mt-1 text-[0.65rem]"
            style={{ color: 'var(--text-soft)' }}
          >
            {t('admin.fincfg.reserve.cosigned_by')}:{' '}
            <span
              className="font-mono"
              style={{ color: 'var(--text)' }}
            >
              {override.cosignedBy}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <DisabledEditButton />
        </div>
      </div>
    </li>
  )
}

function ReserveRecommendationCard({
  rec,
}: {
  rec: ReserveRecommendation
}) {
  const { t } = useI18n()
  const directionKey =
    rec.direction === 'loosen'
      ? 'admin.fincfg.reserve.rec_direction_loosen'
      : 'admin.fincfg.reserve.rec_direction_tighten'
  return (
    <li
      className="rounded-2xl border p-4"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div
            className="font-mono text-[0.72rem]"
            style={{ color: 'var(--text-soft)' }}
          >
            {rec.merchantId}
          </div>
          <div
            className="mt-0.5 text-sm font-semibold"
            style={{ color: 'var(--text)' }}
          >
            {t(directionKey)}
          </div>
          <p
            className="mt-1 text-[0.72rem] leading-relaxed"
            style={{ color: 'var(--text-soft)' }}
          >
            {t(rec.rationaleKey)}
          </p>
          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.65rem]">
            <PairItem
              labelKey="admin.fincfg.reserve.rec_current"
              value={t(reserveBandLabelKey(rec.currentBand))}
            />
            <PairItem
              labelKey="admin.fincfg.reserve.rec_proposed"
              value={t(reserveBandLabelKey(rec.proposedBand))}
            />
            <PairItem
              labelKey="admin.fincfg.reserve.rec_confidence"
              value={t(recommendationConfidenceLabelKey(rec.confidence))}
            />
          </dl>
          {/* Disabled accept/reject buttons. Per FRP § 8.5.3 the
              real flow requires MFA + 2-of-2 cosign per the
              direction (loosen needs payout_approver co-sign;
              tighten can be unilateral with 24h auto-rollback). */}
          <div className="mt-3 flex flex-wrap gap-2">
            <DisabledPillButton
              labelKey="admin.fincfg.reserve.rec_accept_disabled"
              tone="primary"
            />
            <DisabledPillButton
              labelKey="admin.fincfg.reserve.rec_reject_disabled"
              tone="muted"
            />
          </div>
        </div>
      </div>
    </li>
  )
}

// --- Shared primitives -----------------------------------------

function Panel({
  titleKey,
  subtitleKey,
  addButtonKey,
  children,
}: {
  titleKey: string
  subtitleKey: string
  addButtonKey: string
  children: React.ReactNode
}) {
  const { t } = useI18n()
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
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
        <DisabledPillButton labelKey={addButtonKey} tone="muted" />
      </div>
      {children}
    </section>
  )
}

function SubsectionHeading({ labelKey }: { labelKey: string }) {
  const { t } = useI18n()
  return (
    <h4
      className="mt-4 text-[0.65rem] font-bold uppercase tracking-[0.16em]"
      style={{ color: 'var(--muted, var(--text-soft))' }}
    >
      {t(labelKey)}
    </h4>
  )
}

function PairItem({
  labelKey,
  value,
}: {
  labelKey: string
  value: string
}) {
  const { t } = useI18n()
  return (
    <span style={{ color: 'var(--text-soft)' }}>
      <span style={{ opacity: 0.7 }}>{t(labelKey)}: </span>
      <span style={{ color: 'var(--text)' }}>{value}</span>
    </span>
  )
}

function StatusBadge({ status }: { status: ConfigStatus }) {
  const { t } = useI18n()
  const colors = configStatusColor(status)
  return (
    <span
      className="shrink-0 rounded-full px-3 py-1 text-[0.6rem] font-semibold"
      style={{
        background: colors.bg,
        color: colors.fg,
      }}
    >
      {t(configStatusLabelKey(status))}
    </span>
  )
}

// DisabledEditButton + DisabledPillButton extracted to
// `../_components/disabled-controls.tsx` so the
// PayoutReserveOverviewSection (and any future admin preview
// surface) can share the exact same disabled posture without
// duplicating the markup.
