'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import Badge from '@/components/Badge'
import Field from '@/components/Field'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import PrimaryButton from '@/components/PrimaryButton'
import { API_BASE } from '@/lib/apiBase'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import { useAuth, getAuth } from '@/lib/auth'
import { getProduct } from '@/lib/sampleData'

export default function SendPage() {
  return (
    <Suspense
      fallback={
        <PageContainer>
          <div className="pt-5" />
        </PageContainer>
      }
    >
      <SendInner />
    </Suspense>
  )
}

function SendInner() {
  const { t } = useI18n()
  const router = useRouter()
  const toast = useToast()
  const { user } = useAuth()
  const params = useSearchParams()
  const storeId = params.get('store') ?? ''
  const productId = params.get('product') ?? ''
  // Real catalog identifiers — present when the user navigated from a
  // real /stores/[id] page (cuid storefront). Sample-product flows leave
  // them blank; the backend's out-of-stock check then no-ops.
  const realProductId = params.get('productId') ?? ''
  const realStoreId = params.get('storeIdRef') ?? ''

  const selected = storeId && productId ? getProduct(storeId, productId) : null

  const [recipient, setRecipient] = useState(
    () => params.get('to')?.trim().toLowerCase() ?? '',
  )
  const [message, setMessage] = useState('')
  // Optional media attachment. Both fields are sent to the backend only
  // when `mediaUrl` is non-empty — `mediaType` is meaningless without it
  // and the backend's validateGiftMedia helper would reject the pair.
  // The receiver only sees these after delivery; the message-reveal gate
  // strips them pre-delivery (see gifts/gift-visibility.ts).
  const [mediaUrl, setMediaUrl] = useState('')
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image')
  const [isAnonymous, setIsAnonymous] = useState(false)
  // Surprise mode: when on, the receiver sees a mystery card (no
  // product / store name) until the gift is delivered. Sender + store
  // always see real values — this is a receiver-side reveal gate, not
  // a data-scrub. Backend default is `false` so omitting the flag keeps
  // legacy "visible immediately" behaviour.
  const [isSurprise, setIsSurprise] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Live receiver check. We hit /users/check?username= every time the
  // recipient is "stable" (350ms after the last keystroke) and use the
  // result to decide whether to render the red warning + block submit.
  //
  // For fast-delivery products (flowers, chocolate, cake, perishables) we
  // also send `fastCity=<store city>`. The backend returns ONLY a boolean
  // canDeliverFast — never the receiver's city or any other address data.
  type CheckState =
    | { status: 'idle' }
    | { status: 'checking' }
    | {
        status: 'ok'
        exists: true
        hasDefaultAddress: boolean
        fullName: string | null
        // null when the product isn't fast-delivery (the check wasn't run);
        // true/false otherwise. Drives the ✔️/⚠️ pill under the username.
        canDeliverFast: boolean | null
      }
    | { status: 'missing' }
    | { status: 'error' }
  const [check, setCheck] = useState<CheckState>({ status: 'idle' })

  const trimmedRecipient = recipient.trim().toLowerCase()

  // Fast-delivery context for this product. We only send the store's city
  // to the backend — never the receiver's, never any address. The store
  // city is public information (sender picked the store).
  const isFastDelivery = selected?.isFastDelivery === true
  const fastCity = isFastDelivery ? selected?.store.city ?? '' : ''

  useEffect(() => {
    if (trimmedRecipient.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCheck({ status: 'idle' })
      return
    }
    const ctrl = new AbortController()
    setCheck({ status: 'checking' })
    const timer = setTimeout(async () => {
      try {
        const auth = getAuth()
        const url = new URL(`${API_BASE}/users/check`)
        url.searchParams.set('username', trimmedRecipient)
        if (fastCity) url.searchParams.set('fastCity', fastCity)
        const res = await fetch(url.toString(), {
          headers: auth.accessToken
            ? { Authorization: `Bearer ${auth.accessToken}` }
            : undefined,
          signal: ctrl.signal,
        })
        if (!res.ok) {
          setCheck({ status: 'error' })
          return
        }
        const data = (await res.json()) as {
          exists: boolean
          hasDefaultAddress: boolean
          fullName?: string | null
          canDeliverFast?: boolean | null
        }
        if (!data.exists) {
          setCheck({ status: 'missing' })
        } else {
          setCheck({
            status: 'ok',
            exists: true,
            hasDefaultAddress: data.hasDefaultAddress,
            fullName: data.fullName ?? null,
            canDeliverFast:
              typeof data.canDeliverFast === 'boolean'
                ? data.canDeliverFast
                : null,
          })
        }
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return
        setCheck({ status: 'error' })
      }
    }, 350)
    return () => {
      ctrl.abort()
      clearTimeout(timer)
    }
  }, [trimmedRecipient, fastCity])

  const myUsername = user?.qiftUsername?.toLowerCase() ?? ''
  const isSelf =
    myUsername.length > 0 && trimmedRecipient === myUsername

  // Receiver must exist AND have a default address AND, for fast-delivery
  // products, have *some* address in the store's city. Mirrors the backend
  // guards in OrdersService and GiftsService — keep them in sync.
  const failsFastDelivery =
    isFastDelivery &&
    check.status === 'ok' &&
    check.canDeliverFast === false
  const receiverBlocked =
    check.status === 'missing' ||
    (check.status === 'ok' && !check.hasDefaultAddress) ||
    failsFastDelivery

  const canSubmit =
    !!selected &&
    trimmedRecipient.length >= 2 &&
    !isSelf &&
    !receiverBlocked &&
    check.status !== 'checking' &&
    !submitting

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Pre-flight validation — same toasts as before, mirrors the backend's
    // guards so the user gets a localized message before navigating away.
    // (Backend re-validates everything in OrdersService.create; these are
    // just UX shortcuts so the user doesn't pay-fail at /checkout.)
    if (isSelf) {
      toast.show(t('send.cant_send_self'), { tone: 'error' })
      return
    }
    if (check.status === 'missing') {
      toast.show(t('send.recipient_not_found'), { tone: 'error' })
      return
    }
    if (check.status === 'ok' && !check.hasDefaultAddress) {
      toast.show(t('send.recipient_no_address'), { tone: 'error' })
      return
    }
    if (failsFastDelivery) {
      // Generic message — never reveals the receiver's city or even that
      // we KNOW their cities. Mirrors the backend error verbatim.
      toast.show(t('send.cannot_deliver'), { tone: 'error' })
      return
    }
    if (!canSubmit || !selected) return

    // /checkout requires a logged-in viewer to actually pay. The /send
    // page is publicly browsable for the recipient-lookup step, so we
    // only gate at this submit boundary.
    const auth = getAuth()
    if (!auth.accessToken) {
      router.push('/login')
      return
    }

    // Build the /checkout URL. Every gift-shaping field the user filled
    // in here threads through as a query param so the checkout summary
    // can show them and POST /orders persists them. The backend then
    // forwards the persisted Order fields into GiftsService.create when
    // the (mock) payment confirms — no field is dropped on the way.
    //
    // Anonymity note kept here for context: `isAnonymous: true` only
    // changes how the receiver-facing UI hides the sender's identity.
    // The backend ALWAYS persists senderId from the JWT.
    const qs = new URLSearchParams()
    qs.set('store', storeId)
    qs.set('product', productId)
    if (realProductId) qs.set('productId', realProductId)
    if (realStoreId) qs.set('storeIdRef', realStoreId)
    qs.set('to', trimmedRecipient)
    if (message.trim()) qs.set('m', message.trim())
    if (isAnonymous) qs.set('anon', '1')
    if (isSurprise) qs.set('surprise', '1')
    const trimmedMediaUrl = mediaUrl.trim()
    if (trimmedMediaUrl) {
      qs.set('mediaUrl', trimmedMediaUrl)
      qs.set('mediaType', mediaType)
    }

    setSubmitting(true)
    router.push(`/checkout?${qs.toString()}`)
  }

  return (
    <PageContainer>
      <section className="pt-5">
        <PageHeading
          badge={<Badge>{t('send.badge')}</Badge>}
          line1={t('send.title_1')}
          gradient={t('send.title_2')}
          subtitle={t('send.subtitle')}
          size="sm"
        />

        <div className="mt-5">
          <SectionLabel>{t('send.product_section')}</SectionLabel>
          <div className="mt-2.5">
            {selected ? (
              <ProductCard
                store={selected.store.name}
                name={selected.product.name}
                price={selected.product.price}
                gradient="#7B5CF5,#F472B6"
              />
            ) : (
              <NoProduct />
            )}
          </div>
        </div>

        {selected && (
          <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-3.5">
            <div>
              <Field
                label={t('send.recipient_label')}
                placeholder="username"
                prefix="@"
                dirOverride="ltr"
                value={recipient}
                onChange={(e) =>
                  setRecipient(e.target.value.replace(/\s+/g, '').toLowerCase())
                }
                // Show the helper line only when nothing is wrong; otherwise
                // the error/warning line below replaces it.
                helper={
                  // receiverBlocked already covers `missing`, so checking it
                  // alone is enough to suppress the helper line.
                  !isSelf && !receiverBlocked
                    ? t('send.recipient_helper')
                    : undefined
                }
                error={
                  isSelf
                    ? t('send.cant_send_self')
                    : check.status === 'missing'
                      ? t('send.recipient_not_found')
                      : check.status === 'ok' && !check.hasDefaultAddress
                        ? t('send.recipient_no_address')
                        : undefined
                }
                autoComplete="off"
                spellCheck={false}
              />
              {/* Loading + success badges sit just under the field so the
                  user gets immediate feedback while typing. The red warning
                  block (no default address) gets a fuller card so it can't
                  be missed. */}
              {check.status === 'checking' && (
                <p
                  className="mt-1.5 text-[0.7rem]"
                  style={{ color: 'var(--muted)' }}
                >
                  {t('send.recipient_checking')}
                </p>
              )}
              {check.status === 'ok' && check.hasDefaultAddress && (
                <p
                  className="mt-1.5 text-[0.72rem] font-medium"
                  style={{ color: 'var(--primary)' }}
                >
                  ✓{' '}
                  {check.fullName
                    ? `${t('send.recipient_ready')} — ${check.fullName}`
                    : t('send.recipient_ready')}
                </p>
              )}
              {check.status === 'ok' && !check.hasDefaultAddress && (
                <div
                  role="alert"
                  className="mt-2 rounded-2xl border p-3 text-[0.78rem] leading-relaxed"
                  style={{
                    borderColor: 'rgba(213, 91, 110, 0.45)',
                    background: 'rgba(213, 91, 110, 0.08)',
                    color: '#B83A50',
                  }}
                >
                  <strong className="block font-bold">
                    {t('send.recipient_no_address_title')}
                  </strong>
                  <span>{t('send.recipient_no_address_body')}</span>
                </div>
              )}

              {/* Fast-delivery indicator. Only shown when the product needs
                  same-city delivery AND the receiver has a default address
                  (so we don't double-stack with the red banner above).
                  Crucially, NEITHER of the two states reveals any city
                  name, address, or location info — only ✔️/⚠️. */}
              {check.status === 'ok' &&
                check.hasDefaultAddress &&
                isFastDelivery &&
                check.canDeliverFast === true && (
                  <p
                    className="mt-1.5 text-[0.72rem] font-semibold"
                    style={{ color: '#2F7F50' }}
                  >
                    ✔️ {t('send.fast_can_deliver')}
                  </p>
                )}
              {check.status === 'ok' &&
                check.hasDefaultAddress &&
                isFastDelivery &&
                check.canDeliverFast === false && (
                  <p
                    role="alert"
                    className="mt-1.5 text-[0.72rem] font-semibold"
                    style={{ color: '#B83A50' }}
                  >
                    ⚠️ {t('send.fast_cannot_deliver')}
                  </p>
                )}
            </div>
            <Field
              label={t('send.message_label')}
              optional={t('send.message_optional')}
              placeholder={t('send.message_placeholder')}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              multiline
              rows={3}
            />

            {/* Optional media attachment. URL + type discriminator. The
                whole block is purely additive — leaving it blank submits
                a text-only gift exactly as before. The receive-side
                reveal gate (apps/api/src/gifts/gift-visibility.ts) hides
                these fields until status === 'delivered'. */}
            <MediaAttachmentField
              url={mediaUrl}
              type={mediaType}
              onUrlChange={setMediaUrl}
              onTypeChange={setMediaType}
            />

            <button
              type="button"
              onClick={() => setIsAnonymous((v) => !v)}
              className="flex items-center justify-between rounded-2xl border px-4 py-3 text-sm transition-colors hover:-translate-y-0.5"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--surface-2)',
                color: 'var(--text)',
              }}
            >
              <span className="flex flex-col text-start">
                <span className="font-semibold">{t('send.anonymous_label')}</span>
                <span
                  className="mt-0.5 text-[0.7rem]"
                  style={{ color: 'var(--muted)' }}
                >
                  {t('send.anonymous_hint')}
                </span>
              </span>
              <span
                aria-hidden
                className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
                style={{
                  background: isAnonymous
                    ? 'var(--primary)'
                    : 'var(--border-strong)',
                }}
              >
                <span
                  className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
                  style={{
                    left: isAnonymous ? 'calc(100% - 22px)' : '2px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                  }}
                />
              </span>
            </button>

            {/* Surprise toggle. Same visual contract as the isAnonymous
                toggle above — distinct semantics: anonymous hides the
                SENDER's identity from the receiver; surprise hides the
                PRODUCT/STORE from the receiver until delivery. They can
                be mixed freely. */}
            <button
              type="button"
              onClick={() => setIsSurprise((v) => !v)}
              aria-pressed={isSurprise}
              className="flex items-center justify-between rounded-2xl border px-4 py-3 text-sm transition-colors hover:-translate-y-0.5"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--surface-2)',
                color: 'var(--text)',
              }}
            >
              <span className="flex flex-col text-start">
                <span className="font-semibold">{t('send.surprise_label')}</span>
                <span
                  className="mt-0.5 text-[0.7rem]"
                  style={{ color: 'var(--muted)' }}
                >
                  {t('send.surprise_hint')}
                </span>
              </span>
              <span
                aria-hidden
                className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
                style={{
                  background: isSurprise
                    ? 'var(--primary)'
                    : 'var(--border-strong)',
                }}
              >
                <span
                  className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
                  style={{
                    left: isSurprise ? 'calc(100% - 22px)' : '2px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                  }}
                />
              </span>
            </button>

            <PrimaryButton type="submit" disabled={!canSubmit} loading={submitting} className="mt-1.5">
              {t('send.submit')}
            </PrimaryButton>
          </form>
        )}
      </section>
    </PageContainer>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-xs font-semibold tracking-[0.3em]"
      style={{ color: 'var(--primary)' }}
    >
      {children}
    </h2>
  )
}

function ProductCard({
  store,
  name,
  price,
  gradient,
}: {
  store: string
  name: string
  price: string
  gradient: string
}) {
  const { t } = useI18n()
  const [a, b] = gradient.split(',')
  return (
    <div
      className="flex items-center gap-3 rounded-3xl border p-3 backdrop-blur-md"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div
        aria-hidden
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-white"
        style={{ background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)` }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
          <path d="M20 12v9H4v-9" />
          <path d="M2 7h20v5H2z" />
          <path d="M12 22V7" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <h3
          className="truncate text-[0.95rem] font-bold tracking-tight"
          style={{ color: 'var(--ink)' }}
        >
          {name}
        </h3>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
          {t('send.from_store')} {store}
        </p>
      </div>
      <span
        className="shrink-0 rounded-full px-3 py-1 text-sm font-bold"
        style={{ background: 'var(--ring)', color: 'var(--primary)' }}
      >
        {price}
      </span>
    </div>
  )
}

// Optional image / video attachment for the gift message. Designed as a
// single URL field with an "Image | Video" segmented selector — much
// fewer fields than two parallel inputs and matches the backend's
// (mediaUrl, mediaType) pair shape directly.
//
// Validation note: we don't run client-side URL validation. The backend
// already rejects malformed pairs via validateGiftMedia, and a URL
// regex would just gate UX without adding security. Empty URL → field
// is treated as not-set on submit.
function MediaAttachmentField({
  url,
  type,
  onUrlChange,
  onTypeChange,
}: {
  url: string
  type: 'image' | 'video'
  onUrlChange: (v: string) => void
  onTypeChange: (v: 'image' | 'video') => void
}) {
  const { t } = useI18n()
  const hasUrl = url.trim().length > 0

  return (
    <div
      className="rounded-2xl border p-3.5 backdrop-blur-md"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--surface-2)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-sm font-semibold"
          style={{ color: 'var(--ink)' }}
        >
          {t('send.media_label')}
        </span>
        <span
          className="text-[0.65rem] font-medium"
          style={{ color: 'var(--muted)' }}
        >
          ({t('send.media_optional')})
        </span>
      </div>
      <p
        className="mt-1 text-[0.7rem] leading-relaxed"
        style={{ color: 'var(--muted)' }}
      >
        {t('send.media_hint')}
      </p>

      <div className="mt-2.5 flex items-center gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder={t('send.media_placeholder')}
          dir="ltr"
          spellCheck={false}
          autoComplete="off"
          className="flex-1 rounded-xl border px-3 py-2.5 text-sm placeholder:text-[var(--placeholder)] focus:outline-none"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--card)',
            color: 'var(--text)',
          }}
        />
      </div>

      {/* Segmented selector — only meaningful when there's a URL. We keep
          it visible at all times so the user knows the option exists,
          but disable it (visually + via aria-disabled) when the URL is
          empty so it doesn't read as "required". */}
      <div
        className="mt-2.5 inline-flex items-center gap-1 rounded-full border p-1"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--card)',
          opacity: hasUrl ? 1 : 0.65,
        }}
      >
        {(['image', 'video'] as const).map((kind) => {
          const active = type === kind
          return (
            <button
              key={kind}
              type="button"
              onClick={() => onTypeChange(kind)}
              aria-pressed={active}
              aria-disabled={!hasUrl}
              className="rounded-full px-3.5 py-1.5 text-[0.7rem] font-medium transition-all"
              style={{
                background: active
                  ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)'
                  : 'transparent',
                color: active ? '#fff' : 'var(--text-soft)',
                fontWeight: active ? 600 : 500,
                boxShadow: active ? 'var(--shadow-soft)' : undefined,
              }}
            >
              {kind === 'image'
                ? t('send.media_type_image')
                : t('send.media_type_video')}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function NoProduct() {
  const { t } = useI18n()
  return (
    <div
      className="rounded-3xl border p-6 text-center backdrop-blur-md"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <h3 className="text-base font-bold" style={{ color: 'var(--ink)' }}>
        {t('send.no_product_title')}
      </h3>
      <p
        className="mt-2 text-sm leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        {t('send.no_product_body')}
      </p>
      <Link
        href="/stores"
        className="mt-4 inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5"
        style={{
          background:
            'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
          boxShadow: 'var(--shadow-soft)',
        }}
      >
        {t('send.no_product_cta')}
      </Link>
    </div>
  )
}
