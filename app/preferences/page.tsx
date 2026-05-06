'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import Badge from '@/components/Badge'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import Skeleton, { useSimulatedReady } from '@/components/Skeleton'
import { API_BASE } from '@/lib/apiBase'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'

// Wishlist preferences MVP. Lightweight by design — these fields seed
// future AI gift recommendations and the /send Gift UX, without
// forcing users to fill any of them. Every field is optional.
//
// All persistence goes through PATCH /users/me/preferences (see
// UsersService.updatePreferences). The page is a thin form: load
// current values from /users/me on mount, save on click.
type Preferences = {
  preferredClothingSize: string
  preferredShoeSize: string
  preferredRingSize: string
  preferredPerfume: string
  favoriteColors: string
  favoriteCategories: string
  favoriteBrands: string
  allergies: string
  acceptsSurpriseGifts: boolean
}

const EMPTY: Preferences = {
  preferredClothingSize: '',
  preferredShoeSize: '',
  preferredRingSize: '',
  preferredPerfume: '',
  favoriteColors: '',
  favoriteCategories: '',
  favoriteBrands: '',
  allergies: '',
  acceptsSurpriseGifts: true,
}

export default function PreferencesPage() {
  const { t } = useI18n()
  const toast = useToast()
  const ready = useSimulatedReady(300)
  const { accessToken, isAuthenticated } = useAuth()
  const [prefs, setPrefs] = useState<Preferences>(EMPTY)
  const [submitting, setSubmitting] = useState(false)

  // Hydrate from /users/me on mount. The endpoint already returns
  // every preferences column so we don't need a dedicated GET.
  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/users/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (cancelled || !res.ok) return
        const data = (await res.json()) as Partial<Preferences>
        if (cancelled) return
        setPrefs({
          preferredClothingSize: data.preferredClothingSize ?? '',
          preferredShoeSize: data.preferredShoeSize ?? '',
          preferredRingSize: data.preferredRingSize ?? '',
          preferredPerfume: data.preferredPerfume ?? '',
          favoriteColors: data.favoriteColors ?? '',
          favoriteCategories: data.favoriteCategories ?? '',
          favoriteBrands: data.favoriteBrands ?? '',
          allergies: data.allergies ?? '',
          acceptsSurpriseGifts:
            typeof data.acceptsSurpriseGifts === 'boolean'
              ? data.acceptsSurpriseGifts
              : true,
        })
      } catch {
        // Silent — form stays at the empty defaults; saving from there
        // will write through any explicit values the user types.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken])

  const onSave = async () => {
    if (!accessToken || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch(`${API_BASE}/users/me/preferences`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          preferredClothingSize: prefs.preferredClothingSize.trim() || null,
          preferredShoeSize: prefs.preferredShoeSize.trim() || null,
          preferredRingSize: prefs.preferredRingSize.trim() || null,
          preferredPerfume: prefs.preferredPerfume.trim() || null,
          favoriteColors: prefs.favoriteColors.trim() || null,
          favoriteCategories: prefs.favoriteCategories.trim() || null,
          favoriteBrands: prefs.favoriteBrands.trim() || null,
          allergies: prefs.allergies.trim() || null,
          acceptsSurpriseGifts: prefs.acceptsSurpriseGifts,
        }),
      })
      if (!res.ok) {
        toast.show(t('register.error_toast'), { tone: 'error' })
        return
      }
      toast.show(t('toast.changes_saved'))
    } catch (err) {
      console.error('[preferences] PATCH failed', err)
      toast.show(t('register.error_toast'), { tone: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  if (!ready || !isAuthenticated) {
    return (
      <PageContainer size="md">
        <section className="pt-5">
          <Skeleton className="h-7 w-32" rounded="full" />
          <Skeleton className="mt-4 h-9 w-2/5" />
          <Skeleton className="mt-2 h-9 w-3/5" />
          <Skeleton className="mt-3 h-4 w-3/4" />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton
              key={i}
              className="mt-4 h-12 w-full"
              rounded="2xl"
            />
          ))}
        </section>
      </PageContainer>
    )
  }

  const update =
    (key: Exclude<keyof Preferences, 'acceptsSurpriseGifts'>) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setPrefs((p) => ({ ...p, [key]: e.target.value }))

  return (
    <PageContainer size="md">
      <section className="pt-5 qift-fade-in">
        <PageHeading
          badge={<Badge>{t('preferences.badge')}</Badge>}
          line1={t('preferences.title_1')}
          gradient={t('preferences.title_2')}
          subtitle={t('preferences.subtitle')}
          size="sm"
        />

        <div className="mt-5 flex flex-col gap-3.5">
          <PrefField
            label={t('preferences.clothing_size')}
            placeholder={t('preferences.clothing_placeholder')}
            value={prefs.preferredClothingSize}
            onChange={update('preferredClothingSize')}
          />
          <PrefField
            label={t('preferences.shoe_size')}
            placeholder={t('preferences.shoe_placeholder')}
            value={prefs.preferredShoeSize}
            onChange={update('preferredShoeSize')}
          />
          <PrefField
            label={t('preferences.ring_size')}
            placeholder={t('preferences.ring_placeholder')}
            value={prefs.preferredRingSize}
            onChange={update('preferredRingSize')}
          />
          <PrefField
            label={t('preferences.perfume')}
            placeholder={t('preferences.perfume_placeholder')}
            value={prefs.preferredPerfume}
            onChange={update('preferredPerfume')}
          />
          <PrefField
            label={t('preferences.colors')}
            placeholder={t('preferences.colors_placeholder')}
            value={prefs.favoriteColors}
            onChange={update('favoriteColors')}
          />
          <PrefField
            label={t('preferences.categories')}
            placeholder={t('preferences.categories_placeholder')}
            value={prefs.favoriteCategories}
            onChange={update('favoriteCategories')}
          />
          <PrefField
            label={t('preferences.brands')}
            placeholder={t('preferences.brands_placeholder')}
            value={prefs.favoriteBrands}
            onChange={update('favoriteBrands')}
          />
          <PrefField
            label={t('preferences.allergies')}
            placeholder={t('preferences.allergies_placeholder')}
            value={prefs.allergies}
            onChange={update('allergies')}
            multiline
          />

          <button
            type="button"
            onClick={() =>
              setPrefs((p) => ({
                ...p,
                acceptsSurpriseGifts: !p.acceptsSurpriseGifts,
              }))
            }
            className="flex items-center justify-between rounded-2xl border px-4 py-3 text-sm transition-colors"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--surface-2)',
              color: 'var(--text)',
            }}
          >
            <span className="flex flex-col text-start">
              <span className="font-semibold">
                {t('preferences.accept_surprises')}
              </span>
              <span
                className="mt-0.5 text-[0.7rem]"
                style={{ color: 'var(--muted)' }}
              >
                {t('preferences.accept_surprises_hint')}
              </span>
            </span>
            <span
              aria-hidden
              className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
              style={{
                background: prefs.acceptsSurpriseGifts
                  ? 'var(--primary)'
                  : 'var(--border-strong)',
              }}
            >
              <span
                className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
                style={{
                  left: prefs.acceptsSurpriseGifts
                    ? 'calc(100% - 22px)'
                    : '2px',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                }}
              />
            </span>
          </button>

          <p
            className="mt-1 text-[0.7rem] leading-relaxed"
            style={{ color: 'var(--muted)' }}
          >
            {t('preferences.privacy_note')}
          </p>

          <div className="mt-2 flex items-center gap-2">
            <Link
              href="/profile"
              className="rounded-full border px-4 py-2 text-xs font-medium"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card-soft)',
                color: 'var(--text-soft)',
              }}
            >
              {t('social.cancel')}
            </Link>
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={submitting}
              aria-busy={submitting || undefined}
              className="flex-1 rounded-full px-4 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                background:
                  'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                boxShadow: 'var(--shadow-soft)',
              }}
            >
              {submitting ? '…' : t('preferences.save')}
            </button>
          </div>
        </div>
      </section>
    </PageContainer>
  )
}

// Single labelled input. Accepts a multiline flag for the allergies
// field (longest free-text field, benefits from a textarea).
function PrefField({
  label,
  placeholder,
  value,
  onChange,
  multiline,
}: {
  label: string
  placeholder?: string
  value: string
  onChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void
  multiline?: boolean
}) {
  return (
    <label className="block">
      <span
        className="mb-1.5 block text-[0.65rem] font-semibold tracking-[0.2em]"
        style={{ color: 'var(--muted)' }}
      >
        {label}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          rows={2}
          maxLength={200}
          className="w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm focus:outline-none"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--surface-2)',
            color: 'var(--text)',
          }}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          maxLength={200}
          autoComplete="off"
          className="w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm focus:outline-none"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--surface-2)',
            color: 'var(--text)',
          }}
        />
      )}
    </label>
  )
}
