'use client'

// Shared atoms used across multiple admin sections (empty states,
// the page skeleton, the top-of-page KPI strip, and reusable
// badges). Lives in `_components/` (underscore prefix per Next.js
// convention to exclude from route resolution) so it stays scoped
// to /admin without polluting the global components/ folder.

import Skeleton from '@/components/Skeleton'
import PageContainer from '@/components/PageContainer'
import { useI18n } from '@/lib/i18n'

export function Empty({ messageKey }: { messageKey: string }) {
  const { t } = useI18n()
  return (
    <div
      className="rounded-2xl border p-5 text-center text-xs"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card-soft)',
        color: 'var(--text-soft)',
      }}
    >
      {t(messageKey)}
    </div>
  )
}

export function AdminSkeleton() {
  return (
    <PageContainer size="md">
      <section className="pt-5">
        <Skeleton className="h-7 w-20" rounded="full" />
        <Skeleton className="mt-4 h-9 w-2/5" />
        <Skeleton className="mt-2 h-9 w-3/5" />
        <Skeleton className="mt-3 h-4 w-3/4" />
        <div className="mt-5 -mx-1 flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-20 shrink-0" rounded="full" />
          ))}
        </div>
        <ul className="mt-5 flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i}>
              <Skeleton className="h-20 w-full" rounded="2xl" />
            </li>
          ))}
        </ul>
      </section>
    </PageContainer>
  )
}

// Top-of-page operational summary. Reads the /admin/system counts;
// five tiles so the admin opens the page and immediately sees the
// work that needs attention (open reports, pending stores)
// alongside the passive totals (users, stores, gifts).
export function AdminOpsSummary({
  counts,
}: {
  counts: {
    users: number
    stores: number
    pendingStores: number
    gifts: number
    openReports: number
  }
}) {
  return (
    <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
      <AdminKpiTile
        labelKey="admin.kpi_open_reports"
        value={counts.openReports}
        accent="warn"
        emphasised={counts.openReports > 0}
      />
      <AdminKpiTile
        labelKey="admin.kpi_pending_stores"
        value={counts.pendingStores}
        accent="warn"
        emphasised={counts.pendingStores > 0}
      />
      <AdminKpiTile
        labelKey="admin.kpi_users"
        value={counts.users}
        accent="info"
      />
      <AdminKpiTile
        labelKey="admin.kpi_stores"
        value={counts.stores}
        accent="info"
      />
      <AdminKpiTile
        labelKey="admin.kpi_gifts"
        value={counts.gifts}
        accent="ok"
      />
    </div>
  )
}

export function AdminKpiTile({
  labelKey,
  value,
  accent,
  emphasised,
}: {
  labelKey: string
  value: number
  accent: 'warn' | 'info' | 'ok'
  emphasised?: boolean
}) {
  const { t } = useI18n()
  const tone = {
    warn: { dot: '#E89B3A', glow: 'rgba(232, 155, 58, 0.18)' },
    info: {
      dot: 'var(--primary)',
      glow: 'color-mix(in srgb, var(--primary) 18%, transparent)',
    },
    ok: { dot: '#3FA46A', glow: 'rgba(63, 164, 106, 0.16)' },
  }[accent]
  return (
    <div
      className="relative overflow-hidden rounded-2xl border p-3.5 backdrop-blur-md"
      style={{
        borderColor: emphasised
          ? `color-mix(in srgb, ${tone.dot} 50%, var(--border))`
          : 'var(--border)',
        background: emphasised
          ? `linear-gradient(135deg, ${tone.glow} 0%, var(--card) 65%)`
          : 'var(--card)',
        boxShadow: emphasised
          ? `0 12px 28px -16px ${tone.glow}`
          : 'var(--shadow-soft)',
      }}
    >
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: tone.dot }}
        />
        <span
          className="text-[0.65rem] font-semibold uppercase tracking-[0.14em]"
          style={{ color: 'var(--muted)' }}
        >
          {t(labelKey)}
        </span>
      </div>
      <p
        className="mt-2 text-[1.45rem] font-extrabold leading-none tracking-tight"
        style={{ color: 'var(--ink)' }}
      >
        {value}
      </p>
    </div>
  )
}

export function RoleBadge({ role }: { role: string }) {
  const { t } = useI18n()
  const color =
    role === 'admin'
      ? '#D55B6E'
      : role === 'store'
        ? '#3FA46A'
        : 'var(--muted)'
  return (
    <span
      className="shrink-0 rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold tracking-wider"
      style={{
        borderColor: 'var(--border)',
        color,
        background: 'var(--card-soft)',
      }}
    >
      {t(`admin.role_${role}`) || role}
    </span>
  )
}

export function StoreStatusBadge({ status }: { status: string }) {
  const { t } = useI18n()
  const color =
    status === 'approved'
      ? '#3FA46A'
      : status === 'pending'
        ? '#E89B3A'
        : status === 'suspended'
          ? '#D55B6E'
          : 'var(--muted)'
  return (
    <span
      className="shrink-0 rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold tracking-wider"
      style={{
        borderColor: 'var(--border)',
        color,
        background: 'var(--card-soft)',
      }}
    >
      {t(`admin.store_status_${status}`) || status}
    </span>
  )
}
