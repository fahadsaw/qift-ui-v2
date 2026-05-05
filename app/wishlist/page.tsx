'use client'

import Link from 'next/link'
import { useState } from 'react'
import Badge from '@/components/Badge'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import { WISHES, type Wish } from '@/lib/sampleData'

export default function WishlistPage() {
  const { t } = useI18n()
  const toast = useToast()
  const [items, setItems] = useState<Wish[]>(WISHES)
  const [draft, setDraft] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')

  const add = () => {
    const title = draft.trim()
    if (!title) return
    setItems((list) => [
      { id: `w_${Date.now()}`, title, visibility },
      ...list,
    ])
    setDraft('')
    toast.show(t('toast.wish_added'))
  }

  const remove = (id: string) =>
    setItems((list) => list.filter((w) => w.id !== id))

  const toggleVisibility = (id: string) =>
    setItems((list) =>
      list.map((w) =>
        w.id === id
          ? {
              ...w,
              visibility: w.visibility === 'public' ? 'private' : 'public',
            }
          : w,
      ),
    )

  return (
    <PageContainer size="md">
      <section className="pt-5 qift-fade-in">
        <PageHeading
          badge={<Badge>{t('wishlist.badge')}</Badge>}
          line1={t('wishlist.title_1')}
          gradient={t('wishlist.title_2')}
          subtitle={t('wishlist.subtitle')}
          size="sm"
        />

        <form
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
          className="mt-6 flex flex-col gap-2 rounded-3xl border p-3 backdrop-blur-md sm:flex-row"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--card)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('wishlist.add_placeholder')}
            className="flex-1 bg-transparent px-3 py-3 text-base font-medium focus:outline-none"
            style={{ color: 'var(--text)' }}
          />
          <div
            className="flex items-center overflow-hidden rounded-xl border p-1"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--surface-2)',
            }}
          >
            {(['public', 'private'] as const).map((v) => {
              const active = visibility === v
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVisibility(v)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
                  style={{
                    background: active ? 'var(--surface)' : 'transparent',
                    color: active ? 'var(--ink)' : 'var(--text-soft)',
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  {t(`wishlist.${v}`)}
                </button>
              )
            })}
          </div>
          <button
            type="submit"
            disabled={!draft.trim()}
            className="rounded-xl px-5 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            style={{
              background:
                'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            {t('wishlist.add')}
          </button>
        </form>

        {items.length === 0 ? (
          <div
            className="qift-fade-in mt-6 flex flex-col items-center rounded-3xl border p-8 text-center backdrop-blur-md"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            {/* Heart-with-sparkle illustration. Bobs gently to lift the
                empty state out of "missing data" territory and into
                "intentional moment". qift-bob respects
                prefers-reduced-motion. */}
            <span
              aria-hidden
              className="qift-bob flex h-16 w-16 items-center justify-center rounded-2xl text-white"
              style={{
                background:
                  'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
                boxShadow: 'var(--shadow-soft)',
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-7 w-7"
              >
                <path d="M12 21s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 11c0 5.6-7 10-7 10z" />
                <path d="M19 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />
              </svg>
            </span>
            <h3
              className="mt-4 text-base font-bold"
              style={{ color: 'var(--ink)' }}
            >
              {t('wishlist.empty_title')}
            </h3>
            <p
              className="mt-1.5 max-w-xs text-xs leading-relaxed"
              style={{ color: 'var(--text-soft)' }}
            >
              {t('wishlist.empty_body')}
            </p>
            <Link
              href="/stores"
              className="mt-5 inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 active:scale-95"
              style={{
                background:
                  'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                boxShadow: 'var(--shadow-soft)',
              }}
            >
              {t('wishlist.empty_cta')}
            </Link>
          </div>
        ) : (
          <ul className="mt-6 flex flex-col gap-2.5">
            {items.map((w) => (
              <li
                key={w.id}
                className="flex items-center gap-3 rounded-2xl border p-4 backdrop-blur-md"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--card)',
                }}
              >
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--surface-2)',
                    color: 'var(--primary)',
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <path d="M12 21s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 11c0 5.6-7 10-7 10z" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <h3
                    className="truncate text-sm font-bold"
                    style={{ color: 'var(--ink)' }}
                  >
                    {w.title}
                  </h3>
                  {w.store && (
                    <p
                      className="truncate text-xs"
                      style={{ color: 'var(--muted)' }}
                    >
                      {w.store}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => toggleVisibility(w.id)}
                  className="shrink-0 rounded-full border px-2.5 py-1 text-[0.65rem] font-medium"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--card-soft)',
                    color: 'var(--text-soft)',
                  }}
                >
                  {t(`wishlist.${w.visibility}`)}
                </button>
                <button
                  type="button"
                  onClick={() => remove(w.id)}
                  aria-label={t('wishlist.remove')}
                  className="shrink-0 rounded-full p-1.5 transition-colors"
                  style={{ color: 'var(--muted-2)' }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageContainer>
  )
}
