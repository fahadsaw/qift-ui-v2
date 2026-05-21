'use client'

// Merchant onboarding form (v2).
//
// Replaces the v1 single-screen form (store name + city + category)
// with a 4-step business application that collects everything Qift
// needs to verify a real merchant + ship to recipients in their
// service area:
//
//   Step 1 — Store basics
//     storeName, category
//   Step 2 — Business identity
//     legalEntityName, country of registration (drives doc labels),
//     CR number, optional VAT, contact person + phone + email
//   Step 3 — Delivery coverage
//     One or more (city, optional districts) zones using the unified
//     locations catalog. Multi-city merchants add multiple zones.
//   Step 4 — Review + submit
//     Read-only summary; tap submit → POST /stores → status="pending".
//     The dashboard's pending-approval screen handles the rest
//     (document upload, status display, resubmission).
//
// Documents (CR scan, VAT cert, owner ID) are NOT collected in this
// form — they require a storeId that doesn't exist until the form
// submits. The pending-approval screen at /store-dashboard surfaces
// the upload affordance after the store exists.
//
// Privacy / safety:
//   - JWT-guarded; redirects to /login if not authed
//   - Form state is local only — never written to localStorage so a
//     shared device doesn't leak business info
//   - Submit is one POST; failure surfaces an inline error and the
//     form state survives so the merchant doesn't have to retype

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import Badge from '@/components/Badge'
import Field from '@/components/Field'
import PageContainer from '@/components/PageContainer'
import PageHeading from '@/components/PageHeading'
import PrimaryButton from '@/components/PrimaryButton'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/lib/toast'
import { useAuth } from '@/lib/auth'
import { createStore, type CreateStoreInputV2 } from '@/lib/storesApi'
import { COUNTRIES_LIST } from '@/lib/locations'
import { getBusinessDocConfig } from '@/lib/businessDocs'
import {
  buildZonePayload,
  newZoneDraft,
  type ZoneDraft,
} from '@/lib/zoneDraft'
import ZoneEditor from '@/components/ZoneEditor'

// Categories drive product/store classification. Mirrors backend
// StoreCategory enum so the same labels render across the storefront
// and dashboard.
const CATEGORY_OPTIONS: { code: string; labelKey: string }[] = [
  { code: 'flowers', labelKey: 'store.cat_flowers' },
  { code: 'chocolate', labelKey: 'store.cat_chocolate' },
  { code: 'cake', labelKey: 'store.cat_cake' },
  { code: 'perishable', labelKey: 'store.cat_perishable' },
  { code: 'perfume', labelKey: 'store.cat_perfume' },
  { code: 'gifts', labelKey: 'store.cat_gifts' },
  { code: 'other', labelKey: 'store.cat_other' },
]

type Step = 1 | 2 | 3 | 4 | 5

// Wave 1 closed-beta legal hardening — the five acknowledgments
// the merchant agreement acceptance step (Step 5) requires the
// merchant to tick before submitting. Each maps to a clause in
// LEGAL_REVIEW_PACK.md §22.A.2 (merchant-facing closed-beta
// disclaimer). All five must be true for the submit button to
// enable. The mapping is fixed in code so a future copy change
// in the translations file can't accidentally drop an
// acknowledgment from the required set.
type AgreementAcks = {
  sandbox: boolean        // simulated transactions
  shipping: boolean       // merchant ships, no obligation to ship for sandbox
  payouts: boolean        // payout/settlement may be delayed or disabled
  reviewRight: boolean    // Qift's operational review rights
  privacy: boolean        // recipient privacy invariants apply in sandbox too
}
const EMPTY_ACKS: AgreementAcks = {
  sandbox: false,
  shipping: false,
  payouts: false,
  reviewRight: false,
  privacy: false,
}
const ACK_KEYS: ReadonlyArray<keyof AgreementAcks> = [
  'sandbox',
  'shipping',
  'payouts',
  'reviewRight',
  'privacy',
]

export default function MerchantOnboardingPage() {
  const { t } = useI18n()
  const router = useRouter()
  const toast = useToast()
  const { accessToken, isAuthenticated } = useAuth()

  // Step 1
  const [storeName, setStoreName] = useState('')
  const [category, setCategory] = useState<string>('flowers')
  // Step 2
  const [legalEntityName, setLegalEntityName] = useState('')
  const [countryOfRegistration, setCountryOfRegistration] = useState('SA')
  const [crNumber, setCrNumber] = useState('')
  const [vatNumber, setVatNumber] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  // Step 3
  const [zones, setZones] = useState<ZoneDraft[]>(() => [newZoneDraft('SA')])
  // Step 5 — merchant agreement acceptance (Wave 1 closed-beta hardening)
  const [acks, setAcks] = useState<AgreementAcks>(EMPTY_ACKS)
  const allAcksTicked = ACK_KEYS.every((k) => acks[k])

  const [step, setStep] = useState<Step>(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isAuthenticated === false)
      router.replace('/login?next=/store-dashboard/new')
  }, [isAuthenticated, router])

  // Per-country business doc config drives the registration field
  // label + format hint. Reactive to countryOfRegistration so the
  // step-2 copy adapts (Saudi: "السجل التجاري"; UAE: "Trade License";
  // etc.).
  const docConfig = useMemo(
    () => getBusinessDocConfig(countryOfRegistration),
    [countryOfRegistration],
  )

  // Build the API payload from the current form state. Returns null
  // when something required is missing (the caller bails out and
  // bumps the user to the right step).
  const buildPayload = (): CreateStoreInputV2 | null => {
    const validZones = buildZonePayload(zones)
    if (
      !storeName.trim() ||
      !category ||
      !countryOfRegistration ||
      validZones.length === 0
    )
      return null
    // The legacy `city` column on Store stays mandatory at the API
    // level. We use the first zone's city as the canonical value
    // (most merchants will declare their primary location first).
    const primaryCity = validZones[0].city
    return {
      name: storeName.trim(),
      city: primaryCity,
      category,
      legalEntityName: legalEntityName.trim() || undefined,
      countryOfRegistration,
      commercialRegistrationNumber: crNumber.trim() || undefined,
      vatNumber: vatNumber.trim() || undefined,
      contactPerson: contactPerson.trim() || undefined,
      contactPhone: contactPhone.trim() || undefined,
      contactEmail: contactEmail.trim().toLowerCase() || undefined,
      deliveryZones: validZones,
    }
  }

  const canAdvance = (() => {
    if (step === 1) return storeName.trim().length >= 2 && !!category
    if (step === 2)
      return (
        countryOfRegistration.length > 0 &&
        // CR + contact person/phone are required to submit a real
        // application. Email is technically optional but the form
        // soft-requires it for follow-up communication.
        crNumber.trim().length > 0 &&
        contactPerson.trim().length >= 2 &&
        contactPhone.trim().length >= 6
      )
    if (step === 3) return zones.some((z) => z.city.trim().length > 0)
    if (step === 4) return true
    // Step 5 — merchant agreement acceptance. All five
    // acknowledgments must be ticked. This is the final gate
    // before createStore() runs.
    return allAcksTicked
  })()

  const onSubmit = async () => {
    if (!accessToken) {
      router.push('/login')
      return
    }
    const payload = buildPayload()
    if (!payload) {
      toast.show(t('merchant.error_missing_required'), { tone: 'error' })
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await createStore(accessToken, payload)
      toast.show(t('merchant.submit_success'))
      // Land on the dashboard. The pending-approval screen there
      // surfaces the next step (document upload + waiting copy).
      router.push('/store-dashboard')
    } catch (err) {
      const msg = (err as Error).message || 'submit_failed'
      setError(msg)
      toast.show(t('merchant.submit_failed'), { tone: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageContainer size="md">
      <section className="pt-5 qift-fade-in">
        <PageHeading
          badge={<Badge>{t('store.badge')}</Badge>}
          line1={t('merchant.onboarding_title_1')}
          gradient={t('merchant.onboarding_title_2')}
          subtitle={t('merchant.onboarding_subtitle')}
          size="sm"
        />

        <ProgressBar step={step} />

        <form
          onSubmit={(e) => {
            e.preventDefault()
            // Wave 1 closed-beta legal hardening — Step 5
            // (merchant agreement) is the final gate. Submit
            // only fires after every ack is ticked AND the
            // viewer has reached Step 5. Earlier steps just
            // advance.
            if (step < 5) {
              if (canAdvance) setStep((s) => (s + 1) as Step)
              return
            }
            if (!allAcksTicked) return
            void onSubmit()
          }}
          className="mt-6 flex flex-col gap-4"
        >
          {step === 1 && (
            <BasicsStep
              storeName={storeName}
              category={category}
              onStoreName={setStoreName}
              onCategory={setCategory}
            />
          )}

          {step === 2 && (
            <BusinessStep
              legalEntityName={legalEntityName}
              countryOfRegistration={countryOfRegistration}
              crNumber={crNumber}
              vatNumber={vatNumber}
              contactPerson={contactPerson}
              contactPhone={contactPhone}
              contactEmail={contactEmail}
              docConfig={docConfig}
              onLegalEntityName={setLegalEntityName}
              onCountry={(c) => {
                setCountryOfRegistration(c)
                // When the merchant changes country, also reset the
                // first zone's country so coverage stays aligned with
                // where the business is registered.
                setZones((z) => [{ ...z[0], country: c }, ...z.slice(1)])
              }}
              onCr={setCrNumber}
              onVat={setVatNumber}
              onContactPerson={setContactPerson}
              onContactPhone={setContactPhone}
              onContactEmail={setContactEmail}
            />
          )}

          {step === 3 && (
            <CoverageStep
              zones={zones}
              defaultCountry={countryOfRegistration}
              onZones={setZones}
            />
          )}

          {step === 4 && (
            <ReviewStep
              storeName={storeName}
              category={category}
              countryOfRegistration={countryOfRegistration}
              legalEntityName={legalEntityName}
              crNumber={crNumber}
              vatNumber={vatNumber}
              contactPerson={contactPerson}
              contactPhone={contactPhone}
              contactEmail={contactEmail}
              zones={zones}
            />
          )}

          {step === 5 && (
            <AgreementStep
              acks={acks}
              onToggle={(key) =>
                setAcks((a) => ({ ...a, [key]: !a[key] }))
              }
            />
          )}

          {error && (
            <p
              className="text-[0.75rem]"
              style={{ color: '#D55B6E' }}
              role="alert"
            >
              {error}
            </p>
          )}

          <div className="mt-4 flex items-center gap-2">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => (s - 1) as Step)}
                className="rounded-xl border px-4 py-2.5 text-sm font-semibold"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--card-soft)',
                  color: 'var(--text-soft)',
                }}
              >
                {t('merchant.step_back')}
              </button>
            )}
            <PrimaryButton
              type="submit"
              disabled={
                submitting ||
                // Steps 1-4 disable when their own validation
                // fails; Step 5 disables until every ack is ticked.
                (step < 5 ? !canAdvance : !allAcksTicked)
              }
              loading={submitting}
              className="flex-1"
            >
              {step < 5
                ? t('merchant.step_next')
                : t('merchant.submit_application')}
            </PrimaryButton>
          </div>
        </form>
      </section>
    </PageContainer>
  )
}

function ProgressBar({ step }: { step: Step }) {
  const { t } = useI18n()
  const labels = [
    t('merchant.step1_label'),
    t('merchant.step2_label'),
    t('merchant.step3_label'),
    t('merchant.step4_label'),
    t('merchant.step5_label'),
  ]
  return (
    <div className="mt-4 flex items-center gap-1.5">
      {labels.map((label, i) => {
        const idx = (i + 1) as Step
        const reached = idx <= step
        return (
          <div key={label} className="flex flex-1 items-center gap-1.5">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-bold"
              style={{
                background: reached
                  ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)'
                  : 'var(--card-soft)',
                color: reached ? '#fff' : 'var(--muted)',
                border: reached
                  ? 'none'
                  : '1.5px dashed var(--border-strong)',
              }}
            >
              {idx}
            </span>
            <span
              className="hidden flex-1 truncate text-[0.65rem] font-semibold tracking-wide sm:block"
              style={{
                color: idx === step ? 'var(--ink)' : 'var(--muted)',
              }}
            >
              {label}
            </span>
            {i < labels.length - 1 && (
              <span
                aria-hidden
                className="hidden h-px flex-1 sm:block"
                style={{
                  background:
                    idx < step ? 'var(--primary)' : 'var(--hairline)',
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Step 1 ────────────────────────────────────────────────────────
function BasicsStep({
  storeName,
  category,
  onStoreName,
  onCategory,
}: {
  storeName: string
  category: string
  onStoreName: (v: string) => void
  onCategory: (v: string) => void
}) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-3.5">
      <Field
        label={t('merchant.store_name_label')}
        placeholder={t('merchant.store_name_placeholder')}
        value={storeName}
        onChange={(e) => onStoreName(e.target.value)}
        autoComplete="organization"
      />
      <div>
        <span
          className="mb-2 block text-xs font-semibold tracking-[0.2em]"
          style={{ color: 'var(--text-soft)' }}
        >
          {t('merchant.category_label')}
        </span>
        <div className="-mx-1 flex flex-wrap gap-2">
          {CATEGORY_OPTIONS.map((c) => {
            const active = c.code === category
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => onCategory(c.code)}
                className="rounded-full border px-3.5 py-1.5 text-xs transition-all active:scale-95"
                style={{
                  borderColor: active ? 'transparent' : 'var(--border)',
                  background: active
                    ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)'
                    : 'var(--card-soft)',
                  color: active ? '#fff' : 'var(--text-soft)',
                  fontWeight: active ? 600 : 500,
                }}
              >
                {t(c.labelKey)}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Step 2 ────────────────────────────────────────────────────────
function BusinessStep({
  legalEntityName,
  countryOfRegistration,
  crNumber,
  vatNumber,
  contactPerson,
  contactPhone,
  contactEmail,
  docConfig,
  onLegalEntityName,
  onCountry,
  onCr,
  onVat,
  onContactPerson,
  onContactPhone,
  onContactEmail,
}: {
  legalEntityName: string
  countryOfRegistration: string
  crNumber: string
  vatNumber: string
  contactPerson: string
  contactPhone: string
  contactEmail: string
  docConfig: ReturnType<typeof getBusinessDocConfig>
  onLegalEntityName: (v: string) => void
  onCountry: (v: string) => void
  onCr: (v: string) => void
  onVat: (v: string) => void
  onContactPerson: (v: string) => void
  onContactPhone: (v: string) => void
  onContactEmail: (v: string) => void
}) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-3.5">
      <Field
        label={t('merchant.legal_entity_label')}
        placeholder={t('merchant.legal_entity_placeholder')}
        value={legalEntityName}
        onChange={(e) => onLegalEntityName(e.target.value)}
      />
      <div>
        <span
          className="mb-2 block text-xs font-semibold tracking-[0.2em]"
          style={{ color: 'var(--text-soft)' }}
        >
          {t('merchant.country_of_registration_label')}
        </span>
        <div className="-mx-1 flex flex-wrap gap-2">
          {COUNTRIES_LIST.filter((c) => c.code !== 'OTHER').map((c) => {
            const active = c.code === countryOfRegistration
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => onCountry(c.code)}
                className="rounded-full border px-3.5 py-1.5 text-xs transition-all active:scale-95"
                style={{
                  borderColor: active ? 'transparent' : 'var(--border)',
                  background: active
                    ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)'
                    : 'var(--card-soft)',
                  color: active ? '#fff' : 'var(--text-soft)',
                  fontWeight: active ? 600 : 500,
                }}
              >
                {c.flag} {c.name.ar}
              </button>
            )
          })}
        </div>
      </div>
      <Field
        label={t(docConfig.registrationLabelKey)}
        helper={
          docConfig.registrationFormatKey
            ? t(docConfig.registrationFormatKey)
            : undefined
        }
        placeholder={t(docConfig.registrationLabelKey)}
        value={crNumber}
        onChange={(e) => onCr(e.target.value)}
        dirOverride="ltr"
      />
      <Field
        label={t(docConfig.vatLabelKey)}
        placeholder={t('merchant.vat_placeholder')}
        value={vatNumber}
        onChange={(e) => onVat(e.target.value)}
        dirOverride="ltr"
        optional={t('common.optional')}
      />
      <Field
        label={t('merchant.contact_person_label')}
        placeholder={t('merchant.contact_person_placeholder')}
        value={contactPerson}
        onChange={(e) => onContactPerson(e.target.value)}
        autoComplete="name"
      />
      <Field
        label={t('merchant.contact_phone_label')}
        placeholder={t('merchant.contact_phone_placeholder')}
        value={contactPhone}
        onChange={(e) => onContactPhone(e.target.value)}
        dirOverride="ltr"
        autoComplete="tel"
      />
      <Field
        label={t('merchant.contact_email_label')}
        placeholder={t('merchant.contact_email_placeholder')}
        value={contactEmail}
        onChange={(e) => onContactEmail(e.target.value)}
        dirOverride="ltr"
        autoComplete="email"
        optional={t('common.optional')}
      />
    </div>
  )
}

// ── Step 3 ────────────────────────────────────────────────────────
function CoverageStep({
  zones,
  defaultCountry,
  onZones,
}: {
  zones: ZoneDraft[]
  defaultCountry: string
  onZones: (next: ZoneDraft[]) => void
}) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-3">
      <p
        className="text-[0.78rem] leading-relaxed"
        style={{ color: 'var(--text-soft)' }}
      >
        {t('merchant.coverage_intro')}
      </p>
      {zones.map((z, idx) => (
        <ZoneEditor
          key={z.key}
          zone={z}
          canRemove={zones.length > 1}
          onChange={(next) => {
            const copy = zones.slice()
            copy[idx] = next
            onZones(copy)
          }}
          onRemove={() => {
            onZones(zones.filter((_, i) => i !== idx))
          }}
        />
      ))}
      <button
        type="button"
        onClick={() => onZones([...zones, newZoneDraft(defaultCountry)])}
        className="rounded-xl border px-3 py-2.5 text-sm font-semibold"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--card-soft)',
          color: 'var(--primary)',
        }}
      >
        + {t('merchant.add_zone')}
      </button>
    </div>
  )
}


// ── Step 4 ────────────────────────────────────────────────────────
function ReviewStep({
  storeName,
  category,
  countryOfRegistration,
  legalEntityName,
  crNumber,
  vatNumber,
  contactPerson,
  contactPhone,
  contactEmail,
  zones,
}: {
  storeName: string
  category: string
  countryOfRegistration: string
  legalEntityName: string
  crNumber: string
  vatNumber: string
  contactPerson: string
  contactPhone: string
  contactEmail: string
  zones: ZoneDraft[]
}) {
  const { t } = useI18n()
  const validZones = zones.filter((z) => z.city.trim().length > 0)
  return (
    <div className="flex flex-col gap-3">
      <ReviewSection title={t('merchant.review_basics')}>
        <ReviewRow label={t('merchant.store_name_label')} value={storeName} />
        <ReviewRow
          label={t('merchant.category_label')}
          value={t(`store.cat_${category}`)}
        />
      </ReviewSection>
      <ReviewSection title={t('merchant.review_business')}>
        <ReviewRow
          label={t('merchant.country_of_registration_label')}
          value={countryOfRegistration}
        />
        {legalEntityName && (
          <ReviewRow
            label={t('merchant.legal_entity_label')}
            value={legalEntityName}
          />
        )}
        <ReviewRow
          label={t('merchant.cr_number_label')}
          value={crNumber}
          ltr
          mono
        />
        {vatNumber && (
          <ReviewRow
            label={t('merchant.vat_number_label')}
            value={vatNumber}
            ltr
            mono
          />
        )}
        <ReviewRow
          label={t('merchant.contact_person_label')}
          value={contactPerson}
        />
        <ReviewRow
          label={t('merchant.contact_phone_label')}
          value={contactPhone}
          ltr
        />
        {contactEmail && (
          <ReviewRow
            label={t('merchant.contact_email_label')}
            value={contactEmail}
            ltr
          />
        )}
      </ReviewSection>
      <ReviewSection title={t('merchant.review_coverage')}>
        <ul className="flex flex-col gap-1">
          {validZones.map((z) => (
            <li key={z.key} className="text-[0.78rem]">
              <span
                className="font-semibold"
                style={{ color: 'var(--ink)' }}
              >
                {z.city}
              </span>
              {z.districts.length > 0 && (
                <span style={{ color: 'var(--muted)' }}>
                  {' '}
                  ({z.districts.join('، ')})
                </span>
              )}
            </li>
          ))}
        </ul>
      </ReviewSection>
      <p
        className="rounded-xl border px-3 py-2.5 text-[0.7rem] leading-relaxed"
        style={{
          borderColor: 'color-mix(in srgb, var(--primary) 30%, var(--border))',
          background: 'var(--card-soft)',
          color: 'var(--text-soft)',
        }}
      >
        {t('merchant.review_after_submit_hint')}
      </p>
    </div>
  )
}

function ReviewSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div
      className="rounded-2xl border p-3.5"
      style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
    >
      <h3
        className="text-[0.7rem] font-bold uppercase tracking-[0.16em]"
        style={{ color: 'var(--muted)' }}
      >
        {title}
      </h3>
      <div className="mt-2 flex flex-col gap-1.5">{children}</div>
    </div>
  )
}

// Step 5 — Wave 1 closed-beta merchant agreement acceptance.
//
// Surfaces the five acknowledgments documented in
// LEGAL_REVIEW_PACK.md §22.A.2. Each ack is an independent
// checkbox; the parent form gates the submit button on every
// box being ticked.
//
// The card visual treatment is intentionally calm + serious —
// warm-amber eyebrow that matches the closed-beta banner on
// /terms + /privacy so the merchant recognizes the framing.
// Each ack card has a one-line headline + a short prose
// explanation; no legal walls of text in the UI. The merchant
// who wants the full legal language follows the link to /terms.
function AgreementStep({
  acks,
  onToggle,
}: {
  acks: {
    sandbox: boolean
    shipping: boolean
    payouts: boolean
    reviewRight: boolean
    privacy: boolean
  }
  onToggle: (
    key: 'sandbox' | 'shipping' | 'payouts' | 'reviewRight' | 'privacy',
  ) => void
}) {
  const { t } = useI18n()
  const items: ReadonlyArray<{
    key: keyof typeof acks
    title: string
    body: string
  }> = [
    {
      key: 'sandbox',
      title: t('merchant.agreement_sandbox_title'),
      body: t('merchant.agreement_sandbox_body'),
    },
    {
      key: 'shipping',
      title: t('merchant.agreement_shipping_title'),
      body: t('merchant.agreement_shipping_body'),
    },
    {
      key: 'payouts',
      title: t('merchant.agreement_payouts_title'),
      body: t('merchant.agreement_payouts_body'),
    },
    {
      key: 'reviewRight',
      title: t('merchant.agreement_review_right_title'),
      body: t('merchant.agreement_review_right_body'),
    },
    {
      key: 'privacy',
      title: t('merchant.agreement_privacy_title'),
      body: t('merchant.agreement_privacy_body'),
    },
  ]
  return (
    <div className="flex flex-col gap-3">
      <div
        className="rounded-2xl border p-4 backdrop-blur-md"
        style={{
          borderColor:
            'color-mix(in srgb, #E89B3A 35%, var(--border))',
          background:
            'linear-gradient(135deg, rgba(232, 155, 58, 0.10) 0%, var(--card) 100%)',
        }}
      >
        <p
          className="text-[0.65rem] font-semibold tracking-[0.18em]"
          style={{ color: '#E89B3A' }}
        >
          {t('merchant.agreement_eyebrow')}
        </p>
        <h3
          className="mt-1 text-sm font-bold"
          style={{ color: 'var(--ink)' }}
        >
          {t('merchant.agreement_intro_title')}
        </h3>
        <p
          className="mt-1.5 text-[0.78rem] leading-relaxed"
          style={{ color: 'var(--text-soft)' }}
        >
          {t('merchant.agreement_intro_body')}
        </p>
      </div>

      <ul className="flex flex-col gap-2.5">
        {items.map((it) => (
          <li key={it.key}>
            <button
              type="button"
              role="checkbox"
              aria-checked={acks[it.key]}
              onClick={() => onToggle(it.key)}
              className="flex w-full items-start gap-3 rounded-2xl border p-4 text-start backdrop-blur-md transition-colors"
              style={{
                borderColor: acks[it.key]
                  ? 'color-mix(in srgb, var(--primary) 38%, var(--border))'
                  : 'var(--border)',
                background: acks[it.key]
                  ? 'color-mix(in srgb, var(--primary) 6%, var(--card))'
                  : 'var(--card)',
              }}
            >
              <span
                aria-hidden
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border"
                style={{
                  borderColor: acks[it.key]
                    ? 'var(--primary)'
                    : 'var(--border)',
                  background: acks[it.key]
                    ? 'var(--primary)'
                    : 'var(--card-soft)',
                  color: acks[it.key] ? '#fff' : 'transparent',
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3 w-3"
                >
                  <path d="M5 12l5 5L20 7" />
                </svg>
              </span>
              <div className="min-w-0">
                <p
                  className="text-[0.85rem] font-bold"
                  style={{ color: 'var(--ink)' }}
                >
                  {it.title}
                </p>
                <p
                  className="mt-1 text-[0.75rem] leading-relaxed"
                  style={{ color: 'var(--text-soft)' }}
                >
                  {it.body}
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>

      <p
        className="mt-1 text-[0.7rem] leading-relaxed"
        style={{ color: 'var(--muted)' }}
      >
        {t('merchant.agreement_terms_link_prefix')}{' '}
        <a
          href="/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold underline-offset-4 hover:underline"
          style={{ color: 'var(--primary)' }}
        >
          {t('merchant.agreement_terms_link_label')}
        </a>
        {t('merchant.agreement_terms_link_suffix')}
      </p>
    </div>
  )
}

function ReviewRow({
  label,
  value,
  ltr,
  mono,
}: {
  label: string
  value: string
  ltr?: boolean
  mono?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span
        className="shrink-0 text-[0.65rem] font-medium tracking-wide"
        style={{ color: 'var(--muted)' }}
      >
        {label}
      </span>
      <span
        dir={ltr ? 'ltr' : undefined}
        className={`min-w-0 flex-1 text-end font-medium ${mono ? 'font-mono text-[0.7rem]' : 'text-[0.78rem]'}`}
        style={{ color: 'var(--ink)' }}
      >
        {value}
      </span>
    </div>
  )
}
