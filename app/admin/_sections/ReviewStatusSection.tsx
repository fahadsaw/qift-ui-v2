'use client'

// Admin tab — surfaces the BLOCKING accountant + legal sign-offs that
// gate Stage 10 implementation. Read-only at this stage: items render
// from a static config (lib/reviewStatusMock.ts). No fetch, no
// mutations, no money side effects. The visible-mock-notice banner
// at the top of the section makes the "preview" status explicit so
// nobody mistakes this for a live workflow yet.
//
// FLAG GATING
// -----------
// The section's tab is only rendered when
// NEXT_PUBLIC_SHOW_REVIEW_STATUS=1 is set in the build environment
// (see admin/page.tsx for the gate). This keeps the surface out of
// production builds by default — operators only see it in
// dev / staging where they've explicitly opted in. The constant
// `REVIEW_STATUS_ENABLED` exported from this module is the single
// source of truth for that gate.

import { useI18n } from '@/lib/i18n'
import {
  REVIEW_GROUPS,
  type ReviewItem,
  type ReviewStatus,
  statusColor,
  statusLabelKey,
} from '@/lib/reviewStatusMock'

// Opt-in gate. Default OFF. The page's SECTIONS list only includes
// the review-status tab when this is true; the section component
// itself is harmless to render but the tab nav should not advertise
// a preview surface to every admin in production.
export const REVIEW_STATUS_ENABLED: boolean =
  process.env.NEXT_PUBLIC_SHOW_REVIEW_STATUS === '1'

export function ReviewStatusSection() {
  return (
    <div className="flex flex-col gap-5">
      <MockBanner />
      <Intro />
      {REVIEW_GROUPS.map((group) => (
        <Group key={group.labelKey}>
          <GroupHeading labelKey={group.labelKey} />
          <ul className="flex flex-col gap-2">
            {group.items.map((item) => (
              <ReviewRow key={item.id} item={item} />
            ))}
          </ul>
        </Group>
      ))}
    </div>
  )
}

function MockBanner() {
  const { t } = useI18n()
  return (
    <div
      role="status"
      className="rounded-2xl border px-4 py-3 text-xs"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card-soft)',
        color: 'var(--text-soft)',
      }}
    >
      {t('admin.review_mock_notice')}
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
      {t('admin.review_intro')}
    </p>
  )
}

function Group({ children }: { children: React.ReactNode }) {
  return <section className="flex flex-col gap-3">{children}</section>
}

function GroupHeading({ labelKey }: { labelKey: string }) {
  const { t } = useI18n()
  return (
    <h3
      className="text-sm font-semibold"
      style={{ color: 'var(--text)' }}
    >
      {t(labelKey)}
    </h3>
  )
}

function ReviewRow({ item }: { item: ReviewItem }) {
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
            className="text-sm font-medium"
            style={{ color: 'var(--text)' }}
          >
            {item.title}
          </div>
          <div
            className="mt-1 text-[0.72rem] leading-relaxed"
            style={{ color: 'var(--text-soft)' }}
          >
            {item.description}
          </div>
          <div
            className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.65rem]"
            style={{ color: 'var(--text-soft)' }}
          >
            <span>
              <span style={{ opacity: 0.7 }}>
                {t('admin.review_decision_id')}:{' '}
              </span>
              <span
                className="font-mono"
                style={{ color: 'var(--text)' }}
              >
                {item.decisionId}
              </span>
            </span>
            <span>
              <span style={{ opacity: 0.7 }}>
                {t('admin.review_blocks_stage')}:{' '}
              </span>
              <span style={{ color: 'var(--text)' }}>
                {item.blocksStage}
              </span>
            </span>
          </div>
        </div>
        <StatusBadge status={item.status} />
      </div>
    </li>
  )
}

function StatusBadge({ status }: { status: ReviewStatus }) {
  const { t } = useI18n()
  const colors = statusColor(status)
  return (
    <span
      className="shrink-0 rounded-full px-3 py-1 text-[0.65rem] font-semibold"
      style={{
        background: colors.bg,
        color: colors.fg,
      }}
    >
      {t(statusLabelKey(status))}
    </span>
  )
}
