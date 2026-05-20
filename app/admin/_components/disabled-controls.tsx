'use client'

// Shared disabled-control primitives for the admin preview surfaces.
//
// The admin financial-config + payout-reserve-overview sections are
// read-only previews — every interactive control is rendered as a
// disabled button. Centralising the visual treatment here means the
// "this isn't clickable" signal reads identically across every
// preview tab regardless of which one the operator is on.
//
// USAGE
// -----
// - DisabledEditButton — inline "Edit (preview, disabled)" pill on
//   per-row cards (rule rows, override rows, band rows). One label
//   so the meaning is uniform; the i18n key is fixed.
// - DisabledPillButton — panel-level button (e.g., "Add new rule",
//   "Approve payout", "Freeze merchant"). Caller supplies the
//   translation key. Two tones: 'primary' (still muted in practice
//   — we don't want anything to look clickable) and 'muted'.
//
// SAFETY
// ------
// Neither component accepts an `onClick`. `disabled` + `aria-disabled`
// are set on the underlying button. The tone toggle only affects
// background / colour, never the disabled posture.

import { useI18n } from '@/lib/i18n'

// Inline "Edit (preview, disabled)" pill — used in per-row contexts
// where the operator might expect a per-row edit affordance. The
// label is fixed so every preview surface uses the same copy.
export function DisabledEditButton() {
  const { t } = useI18n()
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title={t('admin.fincfg.edit_disabled')}
      className="cursor-not-allowed rounded-full border px-3 py-1 text-[0.6rem] font-semibold"
      style={{
        borderColor: 'var(--hairline, var(--border))',
        background: 'var(--card-soft)',
        color: 'var(--text-soft)',
        opacity: 0.7,
      }}
    >
      {t('admin.fincfg.edit_disabled')}
    </button>
  )
}

// Panel-level disabled button — caller supplies the translation key
// for the label. 'primary' tone uses a slightly tinted background;
// 'muted' is the default card-soft background. Either way the
// opacity drop signals the control is inert.
export function DisabledPillButton({
  labelKey,
  tone,
}: {
  labelKey: string
  tone: 'primary' | 'muted'
}) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      className="cursor-not-allowed rounded-full px-3 py-1 text-[0.65rem] font-semibold"
      style={{
        // Even 'primary' tone uses a soft palette — we don't want a
        // disabled button to look clickable.
        background:
          tone === 'primary'
            ? 'var(--primary-soft, var(--card-soft))'
            : 'var(--card-soft)',
        color:
          tone === 'primary'
            ? 'var(--primary-dark, var(--text-soft))'
            : 'var(--text-soft)',
        opacity: 0.65,
      }}
    >
      {t(labelKey)}
    </button>
  )
}
