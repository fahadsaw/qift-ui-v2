'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import Badge from '@/components/Badge'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import Skeleton, { useSimulatedReady } from '@/components/Skeleton'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import { SEARCH_INDEX, type SearchResult } from '@/lib/sampleData'

type SearchType =
  | 'qift'
  | 'snapchat'
  | 'tiktok'
  | 'instagram'
  | 'x'
  | 'facebook'
  | 'youtube'
  | 'threads'
  | 'telegram'
  | 'phone'
  | 'email'

const TYPES: { id: SearchType; labelKey: string; phKey: string }[] = [
  { id: 'qift', labelKey: 'search.field_qift', phKey: 'search.ph_qift' },
  { id: 'snapchat', labelKey: 'search.field_snapchat', phKey: 'search.ph_snapchat' },
  { id: 'tiktok', labelKey: 'search.field_tiktok', phKey: 'search.ph_tiktok' },
  { id: 'instagram', labelKey: 'search.field_instagram', phKey: 'search.ph_instagram' },
  { id: 'x', labelKey: 'search.field_x', phKey: 'search.ph_x' },
  { id: 'facebook', labelKey: 'search.field_facebook', phKey: 'search.ph_facebook' },
  { id: 'youtube', labelKey: 'search.field_youtube', phKey: 'search.ph_youtube' },
  { id: 'threads', labelKey: 'search.field_threads', phKey: 'search.ph_threads' },
  { id: 'telegram', labelKey: 'search.field_telegram', phKey: 'search.ph_telegram' },
  { id: 'phone', labelKey: 'search.field_phone', phKey: 'search.ph_phone' },
  { id: 'email', labelKey: 'search.field_email', phKey: 'search.ph_email' },
]

const FIELD_LABELS: Record<SearchResult['matchedField'], string> = {
  qift: 'search.field_qift',
  snapchat: 'search.field_snapchat',
  tiktok: 'search.field_tiktok',
  instagram: 'search.field_instagram',
  phone: 'search.field_phone',
  email: 'search.field_email',
}

export default function SearchPage() {
  const { t } = useI18n()
  const toast = useToast()
  const ready = useSimulatedReady(450)
  const [type, setType] = useState<SearchType>('qift')
  const [q, setQ] = useState('')
  const [focused, setFocused] = useState(false)

  const activeType = TYPES.find((x) => x.id === type)!

  const results = useMemo(() => {
    const v = q.trim().toLowerCase()
    const pool = SEARCH_INDEX.filter((r) => {
      if (type === 'qift') return r.matchedField === 'qift'
      if (type === 'snapchat') return r.matchedField === 'snapchat'
      if (type === 'tiktok') return r.matchedField === 'tiktok'
      if (type === 'instagram') return r.matchedField === 'instagram'
      if (type === 'phone') return r.matchedField === 'phone'
      if (type === 'email') return r.matchedField === 'email'
      return true
    })
    if (!v) return pool
    return pool.filter(
      (r) =>
        r.username.toLowerCase().includes(v) ||
        r.matchedValue.toLowerCase().includes(v) ||
        r.name.toLowerCase().includes(v),
    )
  }, [q, type])

  if (!ready) return <SearchSkeleton />

  return (
    <PageContainer size="md">
      <section className="pt-5 qift-fade-in">
        <PageHeading
          badge={<Badge>{t('search.badge')}</Badge>}
          line1={t('search.title_1')}
          gradient={t('search.title_2')}
          subtitle={t('search.subtitle')}
          size="sm"
        />

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <span
              className="block text-[0.65rem] font-semibold tracking-[0.3em]"
              style={{ color: 'var(--muted)' }}
            >
              {t('search.type_label')}
            </span>
            <span
              className="text-[0.7rem] font-medium"
              style={{ color: 'var(--primary)' }}
            >
              {t('search.searching_by')}: {t(activeType.labelKey)}
            </span>
          </div>
          <div className="-mx-1 flex gap-2 overflow-x-auto pb-1">
            {TYPES.map((tp) => {
              const active = tp.id === type
              return (
                <button
                  key={tp.id}
                  type="button"
                  onClick={() => setType(tp.id)}
                  aria-pressed={active}
                  className="shrink-0 rounded-full border px-4 py-2 text-xs transition-all duration-300 active:scale-95"
                  style={{
                    borderColor: active ? 'transparent' : 'var(--border)',
                    background: active
                      ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)'
                      : 'var(--card-soft)',
                    color: active ? '#fff' : 'var(--text-soft)',
                    fontWeight: active ? 700 : 500,
                    boxShadow: active ? 'var(--shadow-soft)' : undefined,
                    transform: active ? 'scale(1.04)' : 'none',
                  }}
                >
                  {t(tp.labelKey)}
                </button>
              )
            })}
          </div>
        </div>

        <div
          className="mt-4 flex items-center overflow-hidden rounded-2xl border backdrop-blur-md transition-all"
          style={{
            borderColor: focused ? 'var(--input-border-focus)' : 'var(--border)',
            background: 'var(--card)',
            boxShadow: focused ? 'var(--input-shadow-focus)' : 'var(--input-shadow)',
          }}
        >
          <span className="ps-5" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" style={{ color: 'var(--muted-2)' }}>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </span>
          <input
            type={type === 'email' ? 'email' : type === 'phone' ? 'tel' : 'search'}
            inputMode={type === 'phone' ? 'tel' : undefined}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={t(activeType.phKey)}
            dir={type === 'phone' || type === 'email' ? 'ltr' : undefined}
            className="w-full bg-transparent px-4 py-[1rem] text-base font-medium focus:outline-none"
            style={{ color: 'var(--text)' }}
          />
        </div>

        <p
          className="mt-2 text-[0.7rem]"
          style={{ color: 'var(--muted-2)' }}
        >
          {t('search.tip')}
        </p>

        {results.length === 0 ? (
          <SearchEmptyState
            query={q.trim()}
            type={type}
            onInvite={(value) => {
              const link = `https://qift.app/invite?ref=${encodeURIComponent(value)}`
              try {
                navigator.clipboard?.writeText(link)
              } catch {
                // clipboard may be unavailable; toast still indicates intent
              }
              toast.show(t('toast.invite_ready'))
            }}
          />
        ) : (
          <ul className="mt-5 flex flex-col gap-2.5">
            {results.map((r) => (
              <li
                key={r.username + r.matchedField}
                className="flex items-center gap-3 rounded-3xl border p-4 backdrop-blur-md transition-all hover:-translate-y-0.5"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--card)',
                  boxShadow: 'var(--shadow-card)',
                }}
              >
                <div
                  aria-hidden
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-bold text-white"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
                  }}
                >
                  {r.name
                    .split(' ')
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join('')}
                </div>
                <div className="min-w-0 flex-1">
                  <h3
                    className="truncate text-sm font-bold"
                    style={{ color: 'var(--ink)' }}
                  >
                    {r.name}
                  </h3>
                  <p
                    className="truncate text-xs"
                    style={{ color: 'var(--muted)' }}
                  >
                    <span dir="ltr">@{r.username}</span>
                    <span className="mx-1.5 opacity-50">·</span>
                    {t(FIELD_LABELS[r.matchedField])}
                  </p>
                </div>
                <Link
                  href="/send"
                  className="shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold text-white transition-all hover:-translate-y-0.5"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                    boxShadow: 'var(--shadow-soft)',
                  }}
                >
                  {t('search.send')}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageContainer>
  )
}

function SearchSkeleton() {
  return (
    <PageContainer size="md">
      <section className="pt-5">
        <Skeleton className="h-7 w-20" rounded="full" />
        <Skeleton className="mt-4 h-9 w-2/5" />
        <Skeleton className="mt-2 h-9 w-3/5" />
        <Skeleton className="mt-3 h-4 w-3/4" />

        <Skeleton className="mt-5 h-3 w-20" />
        <div className="mt-2 -mx-1 flex gap-2 overflow-hidden pb-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24 shrink-0" rounded="full" />
          ))}
        </div>

        <Skeleton className="mt-4 h-14 w-full" rounded="2xl" />
        <Skeleton className="mt-2 h-3 w-44" />

        <ul className="mt-5 flex flex-col gap-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i}>
              <Skeleton className="h-16 w-full" rounded="3xl" />
            </li>
          ))}
        </ul>
      </section>
    </PageContainer>
  )
}

function SearchEmptyState({
  query,
  type,
  onInvite,
}: {
  query: string
  type: SearchType
  onInvite: (value: string) => void
}) {
  const { t } = useI18n()
  // Pick the best invite affordance label based on the search type.
  const inviteLabel =
    type === 'phone'
      ? t('search.invite_via_sms')
      : type === 'email'
        ? t('search.invite_via_email')
        : t('search.invite_share_link')

  const hasQuery = query.length > 0
  return (
    <div
      className="mt-5 flex flex-col items-center rounded-3xl border px-6 py-8 text-center backdrop-blur-md qift-fade-in sm:px-8 sm:py-9"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <span
        aria-hidden
        className="flex h-16 w-16 items-center justify-center rounded-2xl text-white"
        style={{
          background:
            'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
          boxShadow: 'var(--shadow-soft)',
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
          <path d="M11 8v3M11 14h.01" />
        </svg>
      </span>

      {hasQuery && (
        <span
          dir="ltr"
          className="mt-4 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.7rem] font-medium"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--surface-2)',
            color: 'var(--text-soft)',
          }}
        >
          {query}
        </span>
      )}

      <p
        className="mt-3 text-base font-bold tracking-tight"
        style={{ color: 'var(--ink)' }}
      >
        {hasQuery ? t('search.invite_title') : t('search.no_results')}
      </p>
      <p
        className="mt-1.5 max-w-xs text-xs leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        {hasQuery ? t('search.invite_body') : t('search.tip')}
      </p>

      {hasQuery && (
        <>
          <button
            type="button"
            onClick={() => onInvite(query)}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 active:scale-95"
            style={{
              background:
                'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M22 2L11 13" />
              <path d="M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
            {t('search.invite_cta')}
          </button>
          <p
            className="mt-3 text-[0.7rem]"
            style={{ color: 'var(--muted-2)' }}
          >
            {inviteLabel}
          </p>
        </>
      )}
    </div>
  )
}
