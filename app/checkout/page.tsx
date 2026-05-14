'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useMemo, useState } from 'react'
import Badge from '@/components/Badge'
import Card from '@/components/Card'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import PrimaryButton from '@/components/PrimaryButton'
import RecipientPreview, {
  type RecipientSummary,
} from '@/components/RecipientPreview'
import { API_BASE } from '@/lib/apiBase'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import { useAuth } from '@/lib/auth'
import {
  getProduct,
  isFastDeliveryCategory,
  isSampleStoreId,
  type StoreCategory,
} from '@/lib/sampleData'
import { getStore, listProducts } from '@/lib/storesApi'
import Skeleton from '@/components/Skeleton'
import {
  SUPPORTED_COUNTRIES,
  currencyFor,
  getPaymentProvidersByCountry,
  type PaymentProvider,
} from '@/lib/paymentProviders'

type DeliverySpeed = 'same_day' | 'fast'
type ServerAddress = { country?: string; isDefault?: boolean }

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <PageContainer>
          <div className="pt-5" />
        </PageContainer>
      }
    >
      <CheckoutInner />
    </Suspense>
  )
}

function CheckoutInner() {
  const { t } = useI18n()
  const toast = useToast()
  const router = useRouter()
  const { accessToken, userId } = useAuth()
  const params = useSearchParams()
  const storeId = params.get('store') ?? ''
  const productId = params.get('product') ?? ''
  // Real catalog identifiers forwarded from /send. Present only when the
  // user came from a real /stores/[id] page; sample flows leave both
  // blank and the backend's stock guard then no-ops.
  const realProductId = params.get('productId') ?? ''
  const realStoreId = params.get('storeIdRef') ?? ''

  // Linkage debug — fires once on mount in dev mode, never in
  // production. Logs the four URL-derived identifiers so the next
  // "merchant doesn't see this order" report can be diagnosed
  // straight off the buyer's browser console without a server
  // round-trip. The four-flag combination tells you everything:
  //   { storeId: 'rosary',  productId: 'p1',
  //     storeIdRef: '',     productId(real): '' }   → SAMPLE flow
  //   { storeId: 'cuxxx',   productId: 'cyxxx',
  //     storeIdRef: 'cuxxx',productId(real): 'cyxxx' } → REAL flow
  // See also the [checkout] productId-set-but-storeIdRef-missing
  // warning emitted at submit time.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[checkout] entered with linkage:', {
        store: storeId,
        product: productId,
        realProductId,
        realStoreId,
        isReal: !!realStoreId,
      })
    }
  }, [storeId, productId, realProductId, realStoreId])
  const recipient = params.get('to') ?? ''
  const message = params.get('m') ?? ''
  const isAnonymous = params.get('anon') === '1'
  // Sender's "surprise mode" flag — carried through from /send. Persisted
  // on Order so the post-payment Gift inherits it and the receiver sees
  // a mystery card until the gift is delivered.
  const isSurprise = params.get('surprise') === '1'
  // Optional media. Both fields are sent only when `mediaUrl` is non-
  // empty; the backend's validateGiftMedia (shared with POST /gifts)
  // rejects mismatched pairs.
  const mediaUrl = params.get('mediaUrl') ?? ''
  const mediaTypeRaw = params.get('mediaType')
  const mediaType: 'image' | 'video' | null =
    mediaTypeRaw === 'image' || mediaTypeRaw === 'video' ? mediaTypeRaw : null
  // Phase 6.4 — optional occasion attach from /send. Threaded into
  // POST /orders below; backend stores it on Order and forwards to
  // GiftsService.create on payment-confirm, where it's re-validated
  // against (senderId, receiverId, occasion.owner). Empty / invalid
  // values drop silently — never block the order.
  const occasionId = params.get('occasion') ?? ''

  // Same tri-state shape /send uses. Sample storefront ids resolve
  // synchronously from the in-memory STORES dataset; real merchant
  // ids — including stable seeded ones like `store-riyadh-flowers` —
  // hit GET /stores/:id + GET /products?storeId=. Empty/missing
  // params drop straight into "missing" so the existing redirect
  // path still fires.
  type SelectedProduct = {
    store: { name: string; city: string }
    product: { name: string; price: string }
    category: StoreCategory
    isFastDelivery: boolean
  }
  type SelectedState =
    | { status: 'loading' }
    | { status: 'ok'; value: SelectedProduct }
    | { status: 'missing' }
  const [selectedState, setSelectedState] = useState<SelectedState>(() =>
    storeId && productId ? { status: 'loading' } : { status: 'missing' },
  )
  const selected =
    selectedState.status === 'ok' ? selectedState.value : null

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!storeId || !productId) {
        if (!cancelled) setSelectedState({ status: 'missing' })
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
      // Real merchant store. Fetch the store row (for the city used
      // by the fast-delivery check) and the product row (name +
      // price). `realStoreId` / `realProductId` are the canonical
      // catalog FKs forwarded from /send, but the storefront CTA
      // sets `store` and `storeIdRef` to the same value for real
      // products — fall back to either so a slightly mangled URL
      // still lands the buyer on a working summary.
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
        // Soft warning: buyer arrived at /checkout with real-product
        // params but the API can't resolve them. Surface in console
        // so the next "merchant doesn't see this order" report has
        // a breadcrumb in the buyer's tab.
        console.warn(
          '[checkout] real product context lost — storeIdRef=%s productId=%s store=%o product=%o',
          targetStoreId,
          targetProductId,
          s,
          product,
        )
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
  }, [storeId, productId, realStoreId, realProductId])

  const [delivery, setDelivery] = useState<DeliverySpeed>('same_day')
  const [country, setCountry] = useState<string>('SA')
  // The user's preferred provider; the rendered/selected provider is derived
  // below so we don't need an effect to keep it in sync with the country.
  const [chosenProvider, setChosenProvider] =
    useState<PaymentProvider>('mada')
  const [submitting, setSubmitting] = useState(false)
  // Recipient summary for the top-of-page identity card. We refetch
  // here (not just trust the URL params) so:
  //   1. The display name + avatar shown on /send and /checkout are
  //      always taken from the same authoritative endpoint.
  //   2. A user who lands on /checkout via a stale link from
  //      somewhere else (Back button, direct paste) still sees a
  //      fresh confirmation — not a name plucked from a query string
  //      that may have been tampered with.
  // Endpoint is /users/check (JWT-guarded, public-safe fields only).
  // Same call /send already makes; the network cost is one tiny GET.
  const [recipientSummary, setRecipientSummary] =
    useState<RecipientSummary | null>(null)
  useEffect(() => {
    if (!accessToken || !recipient || recipient.length < 2) return
    let cancelled = false
    const ctrl = new AbortController()
    void (async () => {
      try {
        const url = new URL(`${API_BASE}/users/check`)
        url.searchParams.set('username', recipient)
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: ctrl.signal,
        })
        if (!res.ok) return
        const data = (await res.json()) as {
          exists: boolean
          qiftUsername?: string
          fullName?: string | null
          avatarUrl?: string | null
          profileVisibility?: string
        }
        if (cancelled || !data.exists) return
        setRecipientSummary({
          qiftUsername: data.qiftUsername ?? recipient,
          fullName: data.fullName ?? null,
          avatarUrl: data.avatarUrl ?? null,
          profileVisibility: data.profileVisibility ?? 'public',
        })
      } catch {
        // Non-fatal — the @username text + the order summary still
        // render from URL params if the recipient lookup fails.
      }
    })()
    return () => {
      cancelled = true
      ctrl.abort()
    }
  }, [accessToken, recipient])

  // Try to auto-detect the country from the user's default address; fall
  // back silently to SA when the call fails or returns nothing.
  useEffect(() => {
    if (!accessToken || !userId) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/addresses/${userId}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        )
        if (!res.ok) return
        const list = (await res.json()) as ServerAddress[]
        const def = list.find((a) => a.isDefault) ?? list[0]
        const code = def?.country?.trim().toUpperCase()
        if (cancelled || !code) return
        setCountry(code)
      } catch {
        // non-fatal
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken, userId])

  const providers = useMemo(
    () => getPaymentProvidersByCountry(country),
    [country],
  )

  // Derive the active provider from the user's pick — fall back to the first
  // available one if the country no longer allows it.
  const provider: PaymentProvider | undefined = providers.includes(
    chosenProvider,
  )
    ? chosenProvider
    : providers[0]

  const productSar = useMemo(() => {
    if (!selected) return 0
    const m = selected.product.price.match(/[\d٠-٩]+/)
    if (!m) return 0
    const ar = '٠١٢٣٤٥٦٧٨٩'
    return parseInt(
      m[0]
        .split('')
        .map((c) => {
          const i = ar.indexOf(c)
          return i >= 0 ? String(i) : c
        })
        .join(''),
      10,
    )
  }, [selected])

  const deliveryFee = delivery === 'fast' ? 15 : 0
  const serviceFee = Math.max(5, Math.round(productSar * 0.03))
  const total = productSar + deliveryFee + serviceFee
  const fmt = (n: number) => `${n.toLocaleString('ar-SA')} ر.س`
  const currency = currencyFor(country)

  if (selectedState.status === 'loading') {
    return (
      <PageContainer>
        <section className="pt-5">
          <PageHeading
            badge={<Badge>{t('checkout.badge')}</Badge>}
            line1={t('checkout.title_1')}
            gradient={t('checkout.title_2')}
            size="sm"
          />
          <Card className="mt-5">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12" rounded="2xl" />
              <div className="flex-1">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="mt-2 h-3 w-1/3" />
              </div>
              <Skeleton className="h-7 w-16" rounded="full" />
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </Card>
        </section>
      </PageContainer>
    )
  }

  if (!selected) {
    return (
      <PageContainer>
        <section className="pt-5">
          <PageHeading
            badge={<Badge>{t('checkout.badge')}</Badge>}
            line1={t('send.no_product_title')}
            gradient={t('send.no_product_cta')}
            size="sm"
          />
          <div className="mt-5">
            <PrimaryButton href="/stores">
              {t('send.no_product_cta')}
            </PrimaryButton>
          </div>
        </section>
      </PageContainer>
    )
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    if (!accessToken || !userId) {
      toast.show(t('login.error_invalid'), { tone: 'error' })
      router.push('/login')
      return
    }
    if (!provider) {
      toast.show(t('checkout.no_methods'), { tone: 'error' })
      return
    }
    setSubmitting(true)
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    }

    // Defensive breadcrumb. If the buyer came from a sample-store
    // flow (no `storeIdRef` query param) we expect the backend to
    // create an unlinked order — that's intentional for the demo
    // catalog. But if the buyer came from a REAL store and the
    // storeIdRef is missing somehow (URL got mangled, query was
    // stripped, link tampered with), the order would be created
    // without merchant linkage and the merchant wouldn't see it
    // on their dashboard. Log a warning so the next time a
    // merchant reports "I'm missing an order" we have a
    // breadcrumb in the buyer's console.
    if (realProductId && !realStoreId) {
      console.warn(
        '[checkout] productId set but storeIdRef missing — order will be unlinked from merchant dashboard',
        { productId: realProductId, storeId: storeId },
      )
    }

    // Step 1: create the order. Backend ignores any client-supplied userId.
    let orderId: string | null = null
    try {
      const orderRes = await fetch(`${API_BASE}/orders`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          receiverUsername: recipient,
          productName: selected.product.name,
          storeName: selected.store.name,
          productPrice: productSar,
          serviceFee,
          deliveryFee,
          totalAmount: total,
          currency,
          country,
          paymentProvider: provider,
          message: message || undefined,
          isAnonymous,
          // Surprise mode is the receive-side reveal gate (productName +
          // storeName masked from the receiver until delivery). The
          // backend's Order schema persists this so PaymentsService can
          // forward it to GiftsService.create when the order goes paid.
          isSurprise,
          // Optional media attachment. Send the (mediaUrl, mediaType)
          // pair only when the URL is non-empty — the backend's
          // validateGiftMedia helper rejects a mediaType without a URL.
          ...(mediaUrl && mediaType
            ? { mediaUrl, mediaType }
            : {}),
          // Phase 6.4 — optional occasion attach. Validated server-
          // side at GiftsService.create (Order persists as-given).
          ...(occasionId ? { occasionId } : {}),
          // Fast-delivery context. Server re-runs canDeliverFast against
          // the receiver's addresses; we pass `storeCity` (public info) so
          // the backend never has to trust the catalog blindly. For non-
          // perishable products both fields are simply ignored server-side.
          isFastDelivery: selected.isFastDelivery,
          storeCity: selected.isFastDelivery ? selected.store.city : undefined,
          // Real catalog FKs (only present when the user shopped from a
          // real API store). The backend's out-of-stock guard runs only
          // when productId is supplied; sample flows pass nothing and
          // skip the check.
          productId: realProductId || undefined,
          storeId: realStoreId || undefined,
        }),
      })
      if (!orderRes.ok) {
        // Map by stable error CODE rather than by Arabic substring — a
        // copy change on the backend can no longer break the client-
        // side toast routing. Falls through to the message string only
        // when no recognised code is present (legacy callers).
        let code: string | null = null
        let serverMessage: string | null = null
        try {
          const data = (await orderRes.json()) as {
            code?: string
            message?: string | string[]
          }
          code = typeof data.code === 'string' ? data.code : null
          const msg = Array.isArray(data.message)
            ? data.message[0]
            : data.message
          serverMessage = typeof msg === 'string' ? msg : null
        } catch {
          // ignore parse errors — we'll surface a generic toast below
        }
        // recipient_no_default_address is the hard 422 we return when
        // the recipient hasn't set a default address. Sending without
        // one is intentionally blocked (see OrdersService.create), so
        // we route this to the dedicated localized warning instead of
        // a generic "couldn't create order".
        if (code === 'recipient_no_default_address') {
          toast.show(t('send.recipient_no_address'), { tone: 'error' })
        } else if (
          // Fast-delivery city-mismatch — still string-matched until
          // OrdersService grows a stable code for it. Privacy-safe
          // because the message never names a city.
          serverMessage?.includes('لا يمكن التوصيل')
        ) {
          toast.show(t('send.cannot_deliver'), { tone: 'error' })
        } else {
          toast.show(t('checkout.create_order_failed'), { tone: 'error' })
        }
        setSubmitting(false)
        return
      }
      const order = (await orderRes.json()) as { id?: string }
      if (!order?.id) throw new Error('order_failed')
      orderId = order.id
    } catch (err) {
      // Network / parse failures only — the !res.ok branch above
      // returns directly. Anything reaching here is genuinely
      // unexpected; surface the generic toast.
      console.error('[checkout] order create failed', err)
      toast.show(t('checkout.create_order_failed'), { tone: 'error' })
      setSubmitting(false)
      return
    }

    // Step 2: confirm the (mock) payment for that order. The backend
    // creates the gift only after a successful confirm.
    try {
      const payRes = await fetch(`${API_BASE}/payments/mock/confirm`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ orderId }),
      })
      if (!payRes.ok) throw new Error('payment_failed')
    } catch {
      toast.show(t('checkout.payment_failed'), { tone: 'error' })
      setSubmitting(false)
      return
    }

    toast.show(t('toast.gift_sent'))
    router.push('/gifts')
  }

  return (
    <PageContainer>
      <section className="pt-5">
        <PageHeading
          badge={<Badge>{t('checkout.badge')}</Badge>}
          line1={t('checkout.title_1')}
          gradient={t('checkout.title_2')}
          subtitle={t('checkout.subtitle')}
          size="sm"
        />

        <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-3.5">
          {/* Top-of-page recipient confirmation. The brief calls for
              the sender to "visually confirm the recipient before
              checkout"; this card is that confirmation. We render it
              only after the /users/check refetch resolves so the
              sender always sees the freshest avatar + display name
              regardless of how they got here. The card sits above
              the gift summary so the eye lands on "who is this for"
              before "what / how much". */}
          {recipientSummary && (
            <RecipientPreview
              variant="confirm"
              recipient={recipientSummary}
            />
          )}
          <Card>
            <SectionTitle>{t('checkout.summary')}</SectionTitle>
            <div className="mt-3 flex items-center gap-3">
              <div
                aria-hidden
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white"
                style={{
                  background:
                    'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                  <path d="M20 12v9H4v-9" />
                  <path d="M2 7h20v5H2z" />
                  <path d="M12 22V7" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h3
                  className="truncate text-sm font-bold"
                  style={{ color: 'var(--ink)' }}
                >
                  {selected.product.name}
                </h3>
                <p
                  className="mt-0.5 text-xs"
                  style={{ color: 'var(--muted)' }}
                >
                  {t('send.from_store')} {selected.store.name}
                </p>
              </div>
              <span
                className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold"
                style={{ background: 'var(--ring)', color: 'var(--primary)' }}
              >
                {selected.product.price}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-1 gap-1.5 text-sm">
              <Row label={t('checkout.recipient')} value={`@${recipient}`} ltr />
              {message && (
                <Row label={t('checkout.message')} value={`“${message}”`} />
              )}
              {/* Show the gift-shaping flags so the buyer can confirm
                  what they're about to pay for. Only render rows that
                  carry a non-default value — clean summary with no
                  noise for plain gifts. */}
              {isAnonymous && (
                <Row
                  label={t('checkout.anonymous_label')}
                  value={t('checkout.flag_on')}
                />
              )}
              {isSurprise && (
                <Row
                  label={t('checkout.surprise_label')}
                  value={t('checkout.flag_on')}
                />
              )}
              {mediaUrl && mediaType && (
                <Row
                  label={t('checkout.media_label')}
                  value={
                    mediaType === 'image'
                      ? t('checkout.media_image')
                      : t('checkout.media_video')
                  }
                />
              )}
            </dl>
          </Card>

          <Card>
            <SectionTitle>{t('checkout.delivery_section')}</SectionTitle>
            <div className="mt-3 flex flex-col gap-2">
              <DeliveryOption
                active={delivery === 'same_day'}
                title={t('checkout.delivery_same_day')}
                price={t('checkout.delivery_same_day_price')}
                onClick={() => setDelivery('same_day')}
              />
              <DeliveryOption
                active={delivery === 'fast'}
                title={t('checkout.delivery_2h')}
                price={t('checkout.delivery_2h_price')}
                onClick={() => setDelivery('fast')}
              />
            </div>
          </Card>

          <Card>
            <SectionTitle>{t('checkout.country_section')}</SectionTitle>
            <p
              className="mt-1 text-[0.7rem]"
              style={{ color: 'var(--muted)' }}
            >
              {t('checkout.country_hint')}
            </p>
            <div className="mt-3 -mx-1 flex gap-2 overflow-x-auto pb-1">
              {SUPPORTED_COUNTRIES.map((c) => {
                const active = country === c.code
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => setCountry(c.code)}
                    className="shrink-0 rounded-full border px-3.5 py-1.5 text-xs transition-all active:scale-95"
                    style={{
                      borderColor: active
                        ? 'transparent'
                        : 'var(--border)',
                      background: active
                        ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)'
                        : 'var(--card-soft)',
                      color: active ? '#fff' : 'var(--text-soft)',
                      fontWeight: active ? 600 : 500,
                      boxShadow: active ? 'var(--shadow-soft)' : undefined,
                    }}
                  >
                    {c.name}
                  </button>
                )
              })}
              <button
                key="OTHER"
                type="button"
                onClick={() => setCountry('XX')}
                className="shrink-0 rounded-full border px-3.5 py-1.5 text-xs transition-all active:scale-95"
                style={{
                  borderColor:
                    !SUPPORTED_COUNTRIES.some((c) => c.code === country)
                      ? 'transparent'
                      : 'var(--border)',
                  background: !SUPPORTED_COUNTRIES.some(
                    (c) => c.code === country,
                  )
                    ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)'
                    : 'var(--card-soft)',
                  color: !SUPPORTED_COUNTRIES.some((c) => c.code === country)
                    ? '#fff'
                    : 'var(--text-soft)',
                  fontWeight: !SUPPORTED_COUNTRIES.some(
                    (c) => c.code === country,
                  )
                    ? 600
                    : 500,
                }}
              >
                {t('checkout.country_other')}
              </button>
            </div>
          </Card>

          <Card>
            <SectionTitle>{t('checkout.method_section')}</SectionTitle>
            {providers.length === 0 ? (
              <p
                className="mt-3 text-sm"
                style={{ color: 'var(--text-soft)' }}
              >
                {t('checkout.no_methods')}
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {providers.map((p) => (
                  <ProviderCard
                    key={p}
                    provider={p}
                    active={provider === p}
                    onClick={() => setChosenProvider(p)}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card>
            <SectionTitle>{t('checkout.pricing')}</SectionTitle>
            <dl className="mt-3 grid grid-cols-1 gap-2 text-sm">
              <PriceRow label={t('checkout.product_price')} value={fmt(productSar)} />
              <PriceRow label={t('checkout.delivery_fee')} value={deliveryFee === 0 ? t('checkout.delivery_same_day_price') : fmt(deliveryFee)} />
              <PriceRow label={t('checkout.service_fee')} value={fmt(serviceFee)} />
              <div
                className="mt-1 flex items-center justify-between border-t pt-3 text-base font-bold"
                style={{ borderColor: 'var(--hairline)', color: 'var(--ink)' }}
              >
                <span>{t('checkout.total')}</span>
                <span style={{ color: 'var(--primary)' }}>{fmt(total)}</span>
              </div>
            </dl>
          </Card>

          <div
            className="flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-xs leading-relaxed"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card-soft)',
              color: 'var(--text-soft)',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" style={{ color: 'var(--primary)' }}>
              <rect x="4" y="10" width="16" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 118 0v3" />
            </svg>
            {t('checkout.secure_note')}
          </div>

          <PrimaryButton
            type="submit"
            disabled={providers.length === 0}
            loading={submitting}
            className="mt-1.5"
          >
            {t('checkout.submit')}
          </PrimaryButton>

          <Link
            href="/send"
            className="text-center text-xs font-medium"
            style={{ color: 'var(--muted)' }}
          >
            ← {t('nav.back')}
          </Link>
        </form>
      </section>
    </PageContainer>
  )
}

function ProviderCard({
  provider,
  active,
  onClick,
}: {
  provider: PaymentProvider
  active: boolean
  onClick: () => void
}) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 text-sm transition-all hover:-translate-y-0.5 active:scale-[0.98]"
      style={{
        borderColor: active ? 'var(--input-border-focus)' : 'var(--border)',
        background: active ? 'var(--ring)' : 'var(--card-soft)',
        color: active ? 'var(--ink)' : 'var(--text-soft)',
        fontWeight: active ? 700 : 500,
        boxShadow: active ? 'var(--shadow-soft)' : undefined,
      }}
    >
      <span className="flex items-center gap-2">
        <ProviderGlyph provider={provider} active={active} />
        <span>{t(`checkout.provider_${provider}`)}</span>
      </span>
      {active && (
        <span
          aria-hidden
          className="flex h-5 w-5 items-center justify-center rounded-full text-[0.7rem]"
          style={{ background: 'var(--primary)', color: '#fff' }}
        >
          ✓
        </span>
      )}
    </button>
  )
}

function ProviderGlyph({
  provider,
  active,
}: {
  provider: PaymentProvider
  active: boolean
}) {
  // Generic colored glyph per provider — real brand marks come later.
  const path =
    provider === 'apple_pay'
      ? 'M16.5 13.3c0 2.6 2.3 3.5 2.3 3.5-.1.2-1 2.4-2.4 2.4-1.2 0-1.6-.7-2.9-.7-1.4 0-1.7.7-2.9.7-1.4 0-2.6-2.5-3.4-4.6-1-2.5-1.1-5.7.6-7.3.9-.9 2-1.5 3.3-1.5 1 0 2 .7 2.7.7.7 0 1.7-.7 2.9-.7 1 0 2.7.5 3.6 2.2-.1.1-2 1.2-2 3.3z M12.6 4.4c.6-.7 1.5-1.2 2.3-1.3.1.9-.3 1.8-.8 2.4-.6.7-1.5 1.2-2.3 1.2-.1-.9.3-1.7.8-2.3z'
      : provider === 'visa' || provider === 'mastercard'
      ? 'M3 7h18v10H3z M3 11h18'
      : 'M5 7h14a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2V9a2 2 0 012-2z M3 11h18'
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      style={{ color: active ? 'var(--primary)' : 'var(--muted)' }}
    >
      <path d={path} />
    </svg>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-sm font-bold tracking-tight"
      style={{ color: 'var(--ink)' }}
    >
      {children}
    </h2>
  )
}

function Row({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
        {label}
      </dt>
      <dd
        dir={ltr ? 'ltr' : undefined}
        className="text-sm font-medium text-right"
        style={{ color: 'var(--text)' }}
      >
        {value}
      </dd>
    </div>
  )
}

function PriceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm" style={{ color: 'var(--text-soft)' }}>
        {label}
      </span>
      <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
        {value}
      </span>
    </div>
  )
}

function DeliveryOption({
  active,
  title,
  price,
  onClick,
}: {
  active: boolean
  title: string
  price: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between rounded-2xl border px-4 py-3 text-sm transition-all"
      style={{
        borderColor: active ? 'var(--input-border-focus)' : 'var(--border)',
        background: active ? 'var(--ring)' : 'var(--card-soft)',
        color: 'var(--ink)',
        fontWeight: active ? 600 : 500,
      }}
    >
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className="flex h-4 w-4 items-center justify-center rounded-full border"
          style={{
            borderColor: active ? 'var(--primary)' : 'var(--border-strong)',
            background: active ? 'var(--primary)' : 'transparent',
          }}
        >
          {active && (
            <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden />
          )}
        </span>
        {title}
      </span>
      <span style={{ color: active ? 'var(--primary)' : 'var(--muted)' }}>
        {price}
      </span>
    </button>
  )
}
