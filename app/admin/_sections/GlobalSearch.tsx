'use client'

// Global ops search — one input → three result lists
// (users / stores / gifts). Debounced 350ms; hidden when query is
// below 2 chars (matches the backend's empty-result guard).
//
// Gated server-side by `diagnostics.read` permission. Frontend
// renders the input regardless; operators without permission get
// empty responses, not an error toast — same as direct API access.

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { API_BASE } from '@/lib/apiBase'
import { useI18n } from '@/lib/i18n'
import type { AdminStore, AdminUser } from '../_types'

type SearchResults = {
  users: AdminUser[]
  stores: AdminStore[]
  gifts: {
    id: string
    productName: string
    storeName: string
    status: string
  }[]
}

export function AdminGlobalSearch({
  accessToken,
}: {
  accessToken: string | null
}) {
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [busy, setBusy] = useState(false)
  const term = q.trim()

  useEffect(() => {
    if (!accessToken || term.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults(null)
      return
    }
    const ctrl = new AbortController()
    setBusy(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_BASE}/admin/search?q=${encodeURIComponent(term)}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: ctrl.signal,
          },
        )
        if (!res.ok) {
          setResults(null)
        } else {
          setResults((await res.json()) as SearchResults)
        }
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return
        setResults(null)
      } finally {
        setBusy(false)
      }
    }, 350)
    return () => {
      ctrl.abort()
      clearTimeout(timer)
    }
  }, [accessToken, term])

  const totalHits =
    (results?.users.length ?? 0) +
    (results?.stores.length ?? 0) +
    (results?.gifts.length ?? 0)

  return (
    <div className="mt-5">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('admin.global_search_ph')}
        className="w-full rounded-2xl border bg-transparent px-4 py-2.5 text-sm focus:outline-none"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--surface-2)',
          color: 'var(--text)',
        }}
      />
      {term.length >= 2 && (
        <div
          className="mt-2 rounded-2xl border p-3 text-[0.78rem]"
          style={{
            borderColor: 'var(--hairline)',
            background: 'var(--card)',
            boxShadow: 'var(--shadow-soft)',
          }}
        >
          {busy ? (
            <p style={{ color: 'var(--muted)' }}>{t('common.loading')}</p>
          ) : totalHits === 0 ? (
            <p style={{ color: 'var(--muted)' }}>
              {t('admin.global_search_empty')}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {results!.users.length > 0 && (
                <SearchGroup labelKey="admin.section_users">
                  {results!.users.map((u) => (
                    <SearchLine
                      key={u.id}
                      title={`@${u.qiftUsername}`}
                      subtitle={`${u.fullName ?? ''} · ${u.role}`}
                    />
                  ))}
                </SearchGroup>
              )}
              {results!.stores.length > 0 && (
                <SearchGroup labelKey="admin.section_stores">
                  {results!.stores.map((s) => (
                    <SearchLine
                      key={s.id}
                      title={s.name}
                      subtitle={`${s.city} · ${s.status}${s.plan ? ` · ${s.plan}` : ''}`}
                      href={`/stores/${s.id}`}
                    />
                  ))}
                </SearchGroup>
              )}
              {results!.gifts.length > 0 && (
                <SearchGroup labelKey="admin.section_gifts">
                  {results!.gifts.map((g) => (
                    <SearchLine
                      key={g.id}
                      title={g.productName}
                      subtitle={`${g.storeName} · ${g.status}`}
                    />
                  ))}
                </SearchGroup>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SearchGroup({
  labelKey,
  children,
}: {
  labelKey: string
  children: React.ReactNode
}) {
  const { t } = useI18n()
  return (
    <div>
      <h3
        className="mb-1 text-[0.62rem] font-bold uppercase tracking-[0.18em]"
        style={{ color: 'var(--muted)' }}
      >
        {t(labelKey)}
      </h3>
      <ul className="flex flex-col gap-1">{children}</ul>
    </div>
  )
}

function SearchLine({
  title,
  subtitle,
  href,
}: {
  title: string
  subtitle: string
  href?: string
}) {
  const body = (
    <>
      <p
        className="truncate font-semibold"
        style={{ color: 'var(--ink)' }}
      >
        {title}
      </p>
      <p className="truncate" style={{ color: 'var(--muted)' }}>
        {subtitle}
      </p>
    </>
  )
  if (href) {
    return (
      <li>
        <Link
          href={href}
          className="block rounded-xl border px-3 py-1.5 transition-colors hover:-translate-y-0.5"
          style={{
            borderColor: 'var(--hairline)',
            background: 'var(--card-soft)',
          }}
        >
          {body}
        </Link>
      </li>
    )
  }
  return (
    <li
      className="rounded-xl border px-3 py-1.5"
      style={{
        borderColor: 'var(--hairline)',
        background: 'var(--card-soft)',
      }}
    >
      {body}
    </li>
  )
}
