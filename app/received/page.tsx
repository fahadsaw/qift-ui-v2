'use client'

import { useState } from 'react'
import Badge from '@/components/Badge'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import PrimaryButton from '@/components/PrimaryButton'
import { useI18n } from '@/lib/i18n'

type Status = 'new' | 'accepted' | 'rejected'

type Gift = {
  id: string
  fromName: string
  fromUsername: string
  giftName: string
  message?: string
  date: string
  status: Status
}

const SAMPLE: Gift[] = [
  {
    id: 'g1',
    fromName: 'سارة المطيري',
    fromUsername: 'sarah',
    giftName: 'باقة ورد جوري',
    message: 'كل عام وأنتِ بخير',
    date: '٢٠٢٦/٠٤/٢٠',
    status: 'new',
  },
  {
    id: 'g2',
    fromName: 'فهد الدوسري',
    fromUsername: 'fahad',
    giftName: 'كتاب: الرحلة',
    date: '٢٠٢٦/٠٤/١٨',
    status: 'new',
  },
  {
    id: 'g3',
    fromName: 'هدى العتيبي',
    fromUsername: 'huda',
    giftName: 'بطاقة هدية',
    date: '٢٠٢٦/٠٤/١٢',
    status: 'accepted',
  },
]

export default function ReceivedPage() {
  const { t } = useI18n()
  const [gifts, setGifts] = useState<Gift[]>(SAMPLE)

  const update = (id: string, status: Status) =>
    setGifts((list) =>
      list.map((g) => (g.id === id ? { ...g, status } : g)),
    )

  const isEmpty = gifts.length === 0

  return (
    <PageContainer>
      <section className="pt-5">
        <PageHeading
          badge={<Badge>{t('received.badge')}</Badge>}
          line1={t('received.title_1')}
          gradient={t('received.title_2')}
          subtitle={t('received.subtitle')}
        />

        {isEmpty ? (
          <EmptyState />
        ) : (
          <ul className="mt-7 flex flex-col gap-3">
            {gifts.map((g) => (
              <GiftCard
                key={g.id}
                gift={g}
                onAccept={() => update(g.id, 'accepted')}
                onReject={() => update(g.id, 'rejected')}
              />
            ))}
          </ul>
        )}
      </section>
    </PageContainer>
  )
}

function EmptyState() {
  const { t } = useI18n()
  return (
    <div
      className="mt-8 flex flex-col items-center rounded-3xl border p-10 text-center backdrop-blur-md"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <span
        aria-hidden
        className="flex h-16 w-16 items-center justify-center rounded-2xl border"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--surface-2)',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-7 w-7"
          style={{ color: 'var(--primary)' }}
        >
          <path d="M20 12v9H4v-9" />
          <path d="M2 7h20v5H2z" />
          <path d="M12 22V7" />
          <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z" />
          <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />
        </svg>
      </span>
      <h3
        className="mt-5 text-lg font-bold tracking-tight"
        style={{ color: 'var(--ink)' }}
      >
        {t('received.empty_title')}
      </h3>
      <p
        className="mt-2 max-w-xs text-sm leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        {t('received.empty_body')}
      </p>
      <div className="mt-6 w-full max-w-xs">
        <PrimaryButton href="/stores">
          {t('received.empty_cta')}
        </PrimaryButton>
      </div>
    </div>
  )
}

function GiftCard({
  gift,
  onAccept,
  onReject,
}: {
  gift: Gift
  onAccept: () => void
  onReject: () => void
}) {
  const { t } = useI18n()
  const statusKey = `received.status_${gift.status}` as const
  const statusColor =
    gift.status === 'accepted'
      ? '#3FA46A'
      : gift.status === 'rejected'
      ? '#D55B6E'
      : 'var(--primary)'

  return (
    <li
      className="rounded-3xl border p-5 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--surface-2)',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
              style={{ color: 'var(--primary)' }}
            >
              <path d="M20 12v9H4v-9" />
              <path d="M2 7h20v5H2z" />
              <path d="M12 22V7" />
            </svg>
          </span>
          <div>
            <h3
              className="text-[0.95rem] font-bold tracking-tight"
              style={{ color: 'var(--ink)' }}
            >
              {gift.giftName}
            </h3>
            <p
              className="mt-0.5 text-xs"
              style={{ color: 'var(--muted)' }}
            >
              {t('received.from')} {gift.fromName}
              <span className="mx-1.5 opacity-50">·</span>
              <span dir="ltr" className="opacity-80">
                @{gift.fromUsername}
              </span>
              <span className="mx-1.5 opacity-50">·</span>
              {gift.date}
            </p>
            {gift.message && (
              <p
                className="mt-2 text-sm leading-relaxed"
                style={{ color: 'var(--text-soft)' }}
              >
                “{gift.message}”
              </p>
            )}
          </div>
        </div>
        <span
          className="shrink-0 rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold tracking-wider"
          style={{
            borderColor: 'var(--border)',
            color: statusColor,
            background: 'var(--card-soft)',
          }}
        >
          {t(statusKey)}
        </span>
      </div>

      {gift.status === 'new' && (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onAccept}
            className="flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all hover:-translate-y-0.5"
            style={{
              borderColor: 'transparent',
              color: '#fff',
              background:
                'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            {t('received.accept')}
          </button>
          <button
            type="button"
            onClick={onReject}
            className="flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--text-soft)',
              background: 'var(--card)',
            }}
          >
            {t('received.reject')}
          </button>
        </div>
      )}
    </li>
  )
}
