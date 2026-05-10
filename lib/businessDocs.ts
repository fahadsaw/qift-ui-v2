// Country-specific business document expectations.
//
// Different GCC jurisdictions issue different IDs for a registered
// business. Saudi has a 10-digit Commercial Registration (السجل
// التجاري). Kuwait uses MOCI license numbers. UAE has the trade
// license issued by DED / DMCC / freezone authorities. Bahrain
// and Qatar both issue CRs. Oman issues a CR via the Invest Easy
// portal.
//
// This module gives the merchant onboarding form the right field
// labels, format hints, and required-document set per country so
// merchants don't see a generic "commercial registration" field
// that doesn't match their paperwork.
//
// PRIVACY
// All values here are public regulatory information (the names of
// the regulators, the format of public business IDs). No
// merchant-specific data lives in this module.

export type DocumentSlot = {
  // Stable type id sent to /media/store-document on upload. Mirrors
  // the backend's allow-list (commercial_registration,
  // vat_certificate, business_license, owner_id, other).
  type: 'commercial_registration' | 'vat_certificate' | 'business_license' | 'owner_id' | 'other'
  // Localised slot label, derived in the form via t().
  labelKey: string
  // True when this slot is mandatory in the country. The form blocks
  // submission until every required slot has at least one document.
  required: boolean
  // Brief one-line hint shown under the slot. Country-specific copy
  // (e.g. "Saudi 10-digit CR") so merchants don't have to guess.
  hintKey: string
}

export type CountryBusinessConfig = {
  // ISO-3166 alpha-2 (matches lib/locations countries).
  code: string
  // The label used for the Commercial Registration / Trade License
  // field on the form. Saudi: السجل التجاري. UAE: Trade License.
  registrationLabelKey: string
  // Format hint shown under the registration input. Empty when no
  // hint applies.
  registrationFormatKey: string | null
  // VAT number is optional everywhere we list (some merchants are
  // below the threshold). The label still adapts per country —
  // some markets call it Tax Registration Number.
  vatLabelKey: string
  // Document slots in display order. Required slots first.
  documents: DocumentSlot[]
}

// Saudi Arabia — 10-digit Commercial Registration issued by the
// Ministry of Commerce. VAT registration is mandatory above SAR
// 375,000 annual revenue; we treat it as optional on the form.
const SA: CountryBusinessConfig = {
  code: 'SA',
  registrationLabelKey: 'merchant.cr_label_sa',
  registrationFormatKey: 'merchant.cr_format_sa',
  vatLabelKey: 'merchant.vat_label_sa',
  documents: [
    {
      type: 'commercial_registration',
      labelKey: 'merchant.doc_cr',
      required: true,
      hintKey: 'merchant.doc_cr_hint_sa',
    },
    {
      type: 'vat_certificate',
      labelKey: 'merchant.doc_vat',
      required: false,
      hintKey: 'merchant.doc_vat_hint_sa',
    },
    {
      type: 'owner_id',
      labelKey: 'merchant.doc_owner_id',
      required: true,
      hintKey: 'merchant.doc_owner_id_hint_sa',
    },
  ],
}

// Kuwait — Ministry of Commerce and Industry license. Civil ID
// for the authorised signatory is required for verification.
const KW: CountryBusinessConfig = {
  code: 'KW',
  registrationLabelKey: 'merchant.cr_label_kw',
  registrationFormatKey: 'merchant.cr_format_kw',
  vatLabelKey: 'merchant.vat_label_kw',
  documents: [
    {
      type: 'business_license',
      labelKey: 'merchant.doc_license_kw',
      required: true,
      hintKey: 'merchant.doc_license_hint_kw',
    },
    {
      type: 'owner_id',
      labelKey: 'merchant.doc_owner_id',
      required: true,
      hintKey: 'merchant.doc_owner_id_hint_kw',
    },
  ],
}

// UAE — Trade License (DED / freezone). VAT is mandatory above
// AED 375,000; treated optional on the form. Emirates ID for
// authorised signatory is required.
const AE: CountryBusinessConfig = {
  code: 'AE',
  registrationLabelKey: 'merchant.cr_label_ae',
  registrationFormatKey: 'merchant.cr_format_ae',
  vatLabelKey: 'merchant.vat_label_ae',
  documents: [
    {
      type: 'business_license',
      labelKey: 'merchant.doc_license_ae',
      required: true,
      hintKey: 'merchant.doc_license_hint_ae',
    },
    {
      type: 'vat_certificate',
      labelKey: 'merchant.doc_vat',
      required: false,
      hintKey: 'merchant.doc_vat_hint_ae',
    },
    {
      type: 'owner_id',
      labelKey: 'merchant.doc_owner_id',
      required: true,
      hintKey: 'merchant.doc_owner_id_hint_ae',
    },
  ],
}

// Qatar — Commercial Registration via the MoCI portal. ID for the
// authorised signatory is required.
const QA: CountryBusinessConfig = {
  code: 'QA',
  registrationLabelKey: 'merchant.cr_label_qa',
  registrationFormatKey: 'merchant.cr_format_qa',
  vatLabelKey: 'merchant.vat_label_qa',
  documents: [
    {
      type: 'commercial_registration',
      labelKey: 'merchant.doc_cr',
      required: true,
      hintKey: 'merchant.doc_cr_hint_qa',
    },
    {
      type: 'owner_id',
      labelKey: 'merchant.doc_owner_id',
      required: true,
      hintKey: 'merchant.doc_owner_id_hint_qa',
    },
  ],
}

// Bahrain — CR via Sijilat. VAT registration above BHD 37,500.
const BH: CountryBusinessConfig = {
  code: 'BH',
  registrationLabelKey: 'merchant.cr_label_bh',
  registrationFormatKey: 'merchant.cr_format_bh',
  vatLabelKey: 'merchant.vat_label_bh',
  documents: [
    {
      type: 'commercial_registration',
      labelKey: 'merchant.doc_cr',
      required: true,
      hintKey: 'merchant.doc_cr_hint_bh',
    },
    {
      type: 'vat_certificate',
      labelKey: 'merchant.doc_vat',
      required: false,
      hintKey: 'merchant.doc_vat_hint_bh',
    },
    {
      type: 'owner_id',
      labelKey: 'merchant.doc_owner_id',
      required: true,
      hintKey: 'merchant.doc_owner_id_hint_bh',
    },
  ],
}

// Oman — CR via the Invest Easy portal.
const OM: CountryBusinessConfig = {
  code: 'OM',
  registrationLabelKey: 'merchant.cr_label_om',
  registrationFormatKey: 'merchant.cr_format_om',
  vatLabelKey: 'merchant.vat_label_om',
  documents: [
    {
      type: 'commercial_registration',
      labelKey: 'merchant.doc_cr',
      required: true,
      hintKey: 'merchant.doc_cr_hint_om',
    },
    {
      type: 'owner_id',
      labelKey: 'merchant.doc_owner_id',
      required: true,
      hintKey: 'merchant.doc_owner_id_hint_om',
    },
  ],
}

// Catch-all for countries we haven't tailored yet. Generic
// "Business registration number" with an optional supporting doc.
const OTHER: CountryBusinessConfig = {
  code: 'OTHER',
  registrationLabelKey: 'merchant.cr_label_generic',
  registrationFormatKey: null,
  vatLabelKey: 'merchant.vat_label_generic',
  documents: [
    {
      type: 'commercial_registration',
      labelKey: 'merchant.doc_cr_generic',
      required: true,
      hintKey: 'merchant.doc_cr_hint_generic',
    },
    {
      type: 'other',
      labelKey: 'merchant.doc_other',
      required: false,
      hintKey: 'merchant.doc_other_hint',
    },
  ],
}

const CONFIGS: Record<string, CountryBusinessConfig> = {
  SA,
  KW,
  AE,
  QA,
  BH,
  OM,
  OTHER,
}

export function getBusinessDocConfig(
  countryCode: string | null | undefined,
): CountryBusinessConfig {
  const code = (countryCode ?? '').trim().toUpperCase()
  return CONFIGS[code] ?? OTHER
}
