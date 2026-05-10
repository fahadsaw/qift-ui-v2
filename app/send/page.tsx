'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import Badge from '@/components/Badge'
import Field from '@/components/Field'
import MediaPicker, {
  type PickerErrorReason,
} from '@/components/MediaPicker'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import PrimaryButton from '@/components/PrimaryButton'
import RecipientPreview from '@/components/RecipientPreview'
import Skeleton from '@/components/Skeleton'
import { API_BASE } from '@/lib/apiBase'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import { useAuth, getAuth } from '@/lib/auth'
import {
  getProduct,
  isFastDeliveryCategory,
  isSampleStoreId,
  type StoreCategory,
} from '@/lib/sampleData'
import { getStore, listProducts } from '@/lib/storesApi'
import {
  uploadGiftMedia,
  GiftMediaUploadError,
} from '@/lib/giftMedia'

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

  // The "selected gift" hydrates from one of two sources depending on
  // the store id shape: sample slugs (`rosary`, `cocoa`, …) resolve
  // synchronously from the in-memory STORES dataset; real merchant
  // ids — including stable seeded ones like `store-riyadh-flowers` —
  // hit GET /stores/:id + GET /products?storeId=. We mirror the
  // tri-state used elsewhere on this page so we can render a skeleton
  // while the API resolves and only fall back to "No gift selected"
  // once we're sure nothing is going to load.
  type SelectedProduct = {
    store: { name: string; city: string }
    product: { name: string; price: string }
    category: StoreCategory
    isFastDelivery: boolean
  }
  type SelectedState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'ok'; value: SelectedProduct }
    | { status: 'missing' }
  const [selectedState, setSelectedState] = useState<SelectedState>(() =>
    storeId && productId ? { status: 'loading' } : { status: 'idle' },
  )
  const selected =
    selectedState.status === 'ok' ? selectedState.value : null

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!storeId || !productId) {
        if (!cancelled) setSelectedState({ status: 'idle' })
        return
      }
      // Sample storefront — synchronous resolution.
      if (isSampleStoreId(storeId)) {
        const sample = getProduct(storeId, productId)
        if (!sample) {
          if (!cancelled) setSelectedState({ status: 'missing' })
          return
        }
        if (cancelled) return
        setSelectedState({
          status: 'ok',
          value: {
            store: { name: sample.store.name, city: sample.store.city },
            product: {
              name: sample.product.name,
              price: sample.product.price,
            },
            category: sample.category,
            isFastDelivery: sample.isFastDelivery,
          },
        })
        return
      }
      // Real merchant store. Fetch the store row (for city used in
      // the fast-delivery check) and the product row (name + price).
      // Fall back to `realStoreId` when present — the storefront CTA
      // always sends both `store` and `storeIdRef` set to the same
      // value for real products, but we'd rather be defensive than
      // 404 again.
      if (!cancelled) setSelectedState({ status: 'loading' })
      const targetStoreId = realStoreId || storeId
      const targetProductId = realProductId || productId
      const [s, products] = await Promise.all([
        getStore(targetStoreId),
        listProducts(targetStoreId),
      ])
      if (cancelled) return
      const product = products.find((p) => p.id === targetProductId)
      if (!s || !product) {
        // Soft warning: the user clicked a real product CTA but the
        // backend no longer returns it (deleted between click and
        // arrival, or stale cache). Surfaces in console without
        // breaking the UI — the "No gift selected" empty state still
        // renders so the user can re-pick from /stores.
        const recipientHint = (params.get('to') ?? '').trim().toLowerCase()
        if (recipientHint) {
          console.warn(
            '[send] real product context lost — to=%s storeIdRef=%s productId=%s store=%o product=%o',
            recipientHint,
            targetStoreId,
            targetProductId,
            s,
            product,
          )
        }
        setSelectedState({ status: 'missing' })
        return
      }
      const category = product.category as StoreCategory
      setSelectedState({
        status: 'ok',
        value: {
          store: { name: s.name, city: s.city },
          product: {
            name: product.name,
            price: `${product.price.toLocaleString('ar-SA')} ر.س`,
          },
          category,
          isFastDelivery: isFastDeliveryCategory(category),
        },
      })
    })()
    return () => {
      cancelled = true
    }
    // params is excluded — we read `to` once inside the closure for
    // the debug warning; we don't want to re-resolve the product on
    // every search-param change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, productId, realStoreId, realProductId])

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
        // Public-safe identity fields the RecipientPreview card
        // renders. The backend's /users/check endpoint guarantees
        // these are the only profile fields it ships back to the
        // sender — no phone, email, address, or private wishlist.
        // See apps/api/src/users/users.service.ts checkByUsername.
        qiftUsername: string
        fullName: string | null
        avatarUrl: string | null
        profileVisibility: 'public' | 'private' | string
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
          qiftUsername?: string
          fullName?: string | null
          avatarUrl?: string | null
          profileVisibility?: string
          canDeliverFast?: boolean | null
        }
        if (!data.exists) {
          setCheck({ status: 'missing' })
        } else {
          setCheck({
            status: 'ok',
            exists: true,
            hasDefaultAddress: data.hasDefaultAddress,
            qiftUsername: data.qiftUsername ?? trimmedRecipient,
            fullName: data.fullName ?? null,
            avatarUrl: data.avatarUrl ?? null,
            profileVisibility: data.profileVisibility ?? 'public',
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
            {selectedState.status === 'loading' ? (
              <ProductSkeleton />
            ) : selected ? (
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
              {/* Recipient identity preview. Render whenever the
                  /users/check call resolves to an existing recipient,
                  even if they don't have a default address yet — the
                  user still needs to see who they typed before the
                  address-missing alert that follows. The preview is
                  narrow by design (avatar, display name, @handle,
                  public/private chip) so the sender never sees
                  anything private about the recipient. */}
              {check.status === 'ok' && !isSelf && (
                <div className="mt-2">
                  <RecipientPreview
                    variant="compact"
                    recipient={{
                      qiftUsername: check.qiftUsername,
                      fullName: check.fullName,
                      avatarUrl: check.avatarUrl,
                      profileVisibility: check.profileVisibility,
                    }}
                  />
                </div>
              )}
              {check.status === 'ok' && check.hasDefaultAddress && (
                <p
                  className="mt-1.5 text-[0.72rem] font-medium"
                  style={{ color: 'var(--primary)' }}
                >
                  ✓ {t('send.recipient_ready')}
                </p>
              )}
              {/* Not-found state. Inline error on the field already
                  flags it, but the brief calls for a clear card
                  with a path forward — either fix the spelling or
                  invite/search. The "Search for @<query>" link
                  routes to /search prefilled, which is the canonical
                  place to disambiguate a near-miss. */}
              {check.status === 'missing' && trimmedRecipient.length >= 2 && (
                <div
                  className="qift-fade-in mt-2 flex flex-col items-center gap-2.5 rounded-2xl border-2 border-dashed py-6 px-5 text-center"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--card-soft)',
                  }}
                >
                  <span
                    aria-hidden
                    className="qift-bob flex h-12 w-12 items-center justify-center rounded-2xl text-white"
                    style={{
                      background:
                        'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
                      boxShadow: 'var(--shadow-soft)',
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                      <circle cx="11" cy="11" r="7" />
                      <path d="M20 20l-3.5-3.5" />
                    </svg>
                  </span>
                  <p
                    className="text-sm font-semibold"
                    style={{ color: 'var(--ink)' }}
                  >
                    {t('recipient.not_found_title')}
                  </p>
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: 'var(--text-soft)' }}
                  >
                    {t('recipient.not_found_body')}
                  </p>
                  <Link
                    href={`/search?type=qift&q=${encodeURIComponent(trimmedRecipient)}`}
                    className="qift-press inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[0.72rem] font-semibold"
                    style={{
                      borderColor: 'var(--border)',
                      background: 'var(--card)',
                      color: 'var(--text)',
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                      <circle cx="11" cy="11" r="7" />
                      <path d="M20 20l-3.5-3.5" />
                    </svg>
                    {t('recipient.find_user').replace(
                      '{q}',
                      trimmedRecipient,
                    )}
                  </Link>
                </div>
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
                  <p className="mt-1">
                    {t('send.recipient_no_address_body')}
                  </p>
                  {/* Operational rationale — explains WHY the gate is
                      strict so the sender doesn't perceive it as an
                      arbitrary block. */}
                  <p
                    className="mt-2 text-[0.72rem] leading-relaxed"
                    style={{ color: '#7B3B47' }}
                  >
                    {t('send.recipient_no_address_reason')}
                  </p>
                  {/* Copy-invite CTA. Pulls the message text from i18n
                      so the localized copy follows the page language.
                      Falls back silently if the clipboard API is
                      unavailable (older mobile browsers, file://
                      contexts) — the toast still confirms intent. */}
                  <button
                    type="button"
                    onClick={async () => {
                      const msg = t('send.recipient_no_address_invite_text')
                      try {
                        await navigator.clipboard?.writeText(msg)
                      } catch {
                        // best-effort; clipboard may be locked down
                      }
                      toast.show(
                        t('send.recipient_no_address_invite_done'),
                      )
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.72rem] font-semibold transition-colors active:scale-95"
                    style={{
                      borderColor: 'rgba(213, 91, 110, 0.45)',
                      background: 'rgba(213, 91, 110, 0.08)',
                      color: '#B83A50',
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-3.5 w-3.5"
                    >
                      <rect x="9" y="9" width="11" height="11" rx="2" />
                      <path d="M5 15V5a2 2 0 012-2h10" />
                    </svg>
                    {t('send.recipient_no_address_invite_cta')}
                  </button>
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

            {/* Optional media attachment. The whole block is purely
                additive — leaving it blank submits a text-only gift
                exactly as before. The receive-side reveal gate
                (apps/api/src/gifts/gift-visibility.ts) hides these
                fields until status === 'delivered'. */}
            <MediaAttachmentField
              url={mediaUrl}
              type={mediaType}
              onChange={(next) => {
                setMediaUrl(next.url)
                setMediaType(next.type)
              }}
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

// Optional image / video attachment for the gift message.
//
// Two states:
//   1. EMPTY  — a single "Attach photo or video" button that opens
//               MediaPicker. Friction-minimal: one tap, then the OS
//               camera/gallery sheet takes over.
//   2. PICKED — a thumbnail tile with the live preview, an optional
//               "Replace" affordance, and a remove (✕) chip. The
//               file uploads to /media/gift the moment it's picked
//               and the resulting public URL is committed via
//               onChange, so by the time the user taps "Send" the
//               gift payload already carries (mediaUrl, mediaType).
//
// Privacy / reveal: the URL the picker produces is unauthenticated
// on R2 by design (object keys are unguessable timestamp+random).
// The receive-side reveal gate in apps/api/src/gifts/gift-visibility.ts
// strips mediaUrl + mediaType from the recipient's gift payload until
// the gift is delivered — that's what enforces the surprise.
function MediaAttachmentField({
  url,
  type,
  onChange,
}: {
  url: string
  type: 'image' | 'video'
  onChange: (next: { url: string; type: 'image' | 'video' }) => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const { accessToken } = useAuth()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  // Local object-URL preview shown while the upload is in flight.
  // Once the server returns the canonical R2 URL we swap to that
  // (the parent's `url` prop) so the same <img>/<video> element
  // doesn't re-fetch a fresh blob from the network.
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview)
    }
  }, [localPreview])

  const hasMedia = url.trim().length > 0
  const previewSrc = localPreview ?? (hasMedia ? url : null)

  const onPicked = async (file: File) => {
    if (!accessToken) {
      // The /send page is auth-gated upstream — but defend anyway so
      // a stale tab doesn't trigger an opaque 401.
      toast.show(t('media.error_upload_failed'), { tone: 'error' })
      return
    }
    // Show the picked file immediately while we upload. Object URLs
    // are cheap and let the user see the framing they chose without
    // waiting on the network round-trip.
    const objectUrl = URL.createObjectURL(file)
    setLocalPreview(objectUrl)
    setUploading(true)
    try {
      const result = await uploadGiftMedia({ accessToken, file })
      onChange({ url: result.url, type: result.mediaType })
      // Once the canonical R2 URL is committed, the local preview is
      // redundant — release the object URL and let <img>/<video>
      // bind to the public source.
      URL.revokeObjectURL(objectUrl)
      setLocalPreview(null)
    } catch (err) {
      URL.revokeObjectURL(objectUrl)
      setLocalPreview(null)
      if (err instanceof GiftMediaUploadError && err.status === 503) {
        toast.show(t('media.error_storage_unavailable'), { tone: 'error' })
      } else {
        toast.show(t('media.error_upload_failed'), { tone: 'error' })
      }
    } finally {
      setUploading(false)
    }
  }

  const onPickerError = (reason: PickerErrorReason) => {
    const key =
      reason === 'too-large-photo'
        ? 'media.error_too_large_photo'
        : reason === 'too-large-video'
          ? 'media.error_too_large_video'
          : reason === 'empty'
            ? 'media.error_empty'
            : 'media.error_invalid_type'
    toast.show(t(key), { tone: 'error' })
  }

  const onRemove = () => {
    if (localPreview) URL.revokeObjectURL(localPreview)
    setLocalPreview(null)
    // Reset the parent: empty URL + a default 'image' type so the
    // backend's validateGiftMedia treats this as no-attachment.
    onChange({ url: '', type: 'image' })
  }

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
        {t('send.media_reveal_hint')}
      </p>

      {/* Picked-state preview tile. 4:3 aspect to fit reasonable
          phone-camera framings without forcing a square crop on the
          uploaded asset. The backend keeps the original — this is
          purely a UI render. */}
      {previewSrc ? (
        <div
          className="relative mt-3 flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-2xl"
          style={{ background: '#000' }}
        >
          {type === 'video' ? (
            <video
              src={previewSrc}
              controls
              playsInline
              muted
              className="h-full w-full object-contain"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewSrc}
              alt=""
              className="h-full w-full object-cover"
            />
          )}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
              <span
                className="qift-spin h-7 w-7 rounded-full"
                style={{
                  border:
                    '2.5px solid color-mix(in srgb, white 25%, transparent)',
                  borderTopColor: '#fff',
                }}
                aria-label={t('media.uploading')}
              />
            </div>
          )}
          {!uploading && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={t('send.media_remove')}
              className="absolute top-2 end-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-white qift-press"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      ) : null}

      {/* Action button. Empty state shows "Attach"; once a media item
          exists we offer "Replace" so the user knows they can swap
          without first removing. Both open the same picker. */}
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        disabled={uploading}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition-colors qift-press disabled:opacity-60"
        style={{
          background: hasMedia ? 'var(--card)' : undefined,
          backgroundImage: hasMedia
            ? undefined
            : 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
          color: hasMedia ? 'var(--ink)' : '#fff',
          border: hasMedia ? '1px solid var(--hairline)' : 'none',
          boxShadow: hasMedia ? undefined : 'var(--shadow-soft)',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
        >
          <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        {hasMedia
          ? t('send.media_replace_button')
          : t('send.media_attach_button')}
      </button>

      <MediaPicker
        open={pickerOpen}
        mode="image-and-video"
        onClose={() => setPickerOpen(false)}
        onPicked={onPicked}
        onError={onPickerError}
      />
    </div>
  )
}

// Placeholder shown while we fetch the real merchant product +
// store from the API. Mirrors the ProductCard layout (store line,
// product name, price chip) so the section doesn't reflow when
// the data arrives.
function ProductSkeleton() {
  return (
    <div
      className="rounded-3xl border p-4 backdrop-blur-md"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="mt-2.5 h-5 w-2/3" />
      <Skeleton className="mt-3 h-7 w-24" rounded="full" />
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
