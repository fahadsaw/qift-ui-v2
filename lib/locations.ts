// Unified country-aware location catalog.
//
// PURPOSE
// Multiple surfaces in the app need to speak about places using the
// same vocabulary and the same dataset:
//   - Registration / address book (lib/addresses.ts schemas)
//   - Stores discovery filter (app/stores/page.tsx)
//   - Merchant store creation (app/store-dashboard/new)
//   - Recipient delivery context (checkout)
// Before this module they each maintained their own copy with subtle
// drift (different tier labels, missing cities, mismatched ordering).
// This file is the single source of truth.
//
// CONVENTIONS
// - `field` names match the canonical Address columns on the backend
//   (region, city, governorate, district). A form posting these values
//   needs no per-country mapping layer.
// - Tier order is broad → specific. Each country picks the tiers that
//   make sense for its administrative geography. Saudi for instance
//   uses all four; UAE collapses governorate (it doesn't have one).
// - Names are stored in Arabic primary (the dominant locale) with an
//   optional English transliteration. Catalog dropdowns render the
//   active locale's name and persist the Arabic value to the backend
//   so address records are stable across language switches.
//
// FRONTEND-FIRST
// This module ships as a static dataset so registration / stores work
// today without a backend round-trip. The `BACKEND_LOCATION_FIELDS`
// constant at the bottom documents the exact columns a future
// /locations API would need to serve. When that lands, swap the
// static lookups below for fetched data — every consumer reads
// through the helpers (`getLocationConfig`, `getTierOptions`) so the
// transition is one file.
//
// COVERAGE TARGETS
// - SA: all 13 regions, all major cities & governorates per region,
//   commonly-referenced districts in the largest cities.
// - KW / AE / QA / BH / OM: realistic local structures with the
//   actual administrative subdivisions. Not exhaustive — we ship
//   what users actually type into forms today and expand as the
//   merchant catalog grows in each market.

export type LocationField =
  | 'region'
  | 'city'
  | 'governorate'
  | 'district'

export type LocationTier = {
  // Backend Address column the value is persisted to.
  field: LocationField
  // Translation key picked per country to surface the local term
  // ("المنطقة" vs "الإمارة" vs "المحافظة" — all valid tier-1 labels
  // depending on country).
  labelKey: string
  // When true, the user can leave this tier empty in flows where
  // partial data is acceptable (stores filter at a high level,
  // address forms where the column is nullable).
  optional?: boolean
}

// Cascading lookup tables. `tierN` is keyed by the value chosen at
// `tier(N-1)` so the UI can drive a series of dependent dropdowns.
// Tiers are 1-indexed to match how forms reference them.
export type LocationData = {
  tier1: string[]
  tier2?: Record<string, string[]>
  tier3?: Record<string, string[]>
  tier4?: Record<string, string[]>
}

export type CountryLocationConfig = {
  code: string
  name: { ar: string; en: string }
  flag: string
  // Tier sequence in the order the UI should render them. The
  // length of `tiers` matches the deepest populated tier in `data`.
  tiers: LocationTier[]
  data: LocationData
}

// ──────────────────────────────────────────────────────────────────
// SAUDI ARABIA (المملكة العربية السعودية)
// ──────────────────────────────────────────────────────────────────
// Hierarchy: Region (منطقة) → City (مدينة) → Governorate (محافظة, optional)
//           → District (حي).
//
// Saudi's 13 regions and their major cities / governorates are
// covered. Districts ship for the largest cities in each region;
// other cities accept free-form district entry and the dropdown
// falls back to a text field automatically (see schemaFor in
// lib/addresses.ts).
//
// On the address form the Governorate tier is optional because the
// regional capital (e.g. الرياض city in الرياض region) is not a
// sub-governorate — it sits directly under the region. Sub-cities
// like الدرعية, الخرج, جدة-suburbs ARE inside governorates.

const SA_REGIONS = [
  'منطقة الرياض',
  'منطقة مكة المكرمة',
  'المنطقة الشرقية',
  'منطقة المدينة المنورة',
  'منطقة القصيم',
  'منطقة عسير',
  'منطقة تبوك',
  'منطقة حائل',
  'منطقة الحدود الشمالية',
  'منطقة جازان',
  'منطقة نجران',
  'منطقة الباحة',
  'منطقة الجوف',
] as const

// Cities and major governorates per region. The first entry in each
// list is the regional capital (no sub-governorate); the rest are
// governorates that contain a main city of the same name.
const SA_CITIES: Record<string, string[]> = {
  'منطقة الرياض': [
    'الرياض',
    'الخرج',
    'الدرعية',
    'المجمعة',
    'الدوادمي',
    'الزلفي',
    'شقراء',
    'وادي الدواسر',
    'الأفلاج',
    'القويعية',
    'حوطة بني تميم',
    'ضرما',
    'ثادق',
    'حريملاء',
    'مرات',
    'الغاط',
    'السليل',
    'الحريق',
    'رماح',
    'الرين',
  ],
  'منطقة مكة المكرمة': [
    'مكة المكرمة',
    'جدة',
    'الطائف',
    'القنفذة',
    'الليث',
    'رابغ',
    'خليص',
    'الجموم',
    'الكامل',
    'تربة',
    'ميسان',
    'العرضيات',
    'أضم',
    'رنية',
    'الخرمة',
    'بحرة',
  ],
  'المنطقة الشرقية': [
    'الدمام',
    'الخبر',
    'الظهران',
    'الأحساء',
    'القطيف',
    'الجبيل',
    'حفر الباطن',
    'الخفجي',
    'النعيرية',
    'رأس تنورة',
    'بقيق',
    'قرية العليا',
    'العديد',
  ],
  'منطقة المدينة المنورة': [
    'المدينة المنورة',
    'ينبع',
    'العلا',
    'بدر',
    'مهد الذهب',
    'الحناكية',
    'خيبر',
    'العيص',
    'وادي الفرع',
  ],
  'منطقة القصيم': [
    'بريدة',
    'عنيزة',
    'الرس',
    'البكيرية',
    'البدائع',
    'المذنب',
    'رياض الخبراء',
    'الأسياح',
    'النبهانية',
    'عقلة الصقور',
    'الشماسية',
    'ضرية',
    'عيون الجواء',
  ],
  'منطقة عسير': [
    'أبها',
    'خميس مشيط',
    'بيشة',
    'محايل عسير',
    'النماص',
    'تنومة',
    'ظهران الجنوب',
    'تثليث',
    'سراة عبيدة',
    'البرك',
    'رجال ألمع',
    'المجاردة',
    'بلقرن',
    'طريب',
    'أحد رفيدة',
  ],
  'منطقة تبوك': [
    'تبوك',
    'الوجه',
    'ضباء',
    'تيماء',
    'أملج',
    'حقل',
    'البدع',
    'شرما',
  ],
  'منطقة حائل': [
    'حائل',
    'بقعاء',
    'الغزالة',
    'الشنان',
    'الحائط',
    'السليمي',
    'موقق',
  ],
  'منطقة الحدود الشمالية': ['عرعر', 'رفحاء', 'طريف', 'العويقيلة'],
  'منطقة جازان': [
    'جازان',
    'صبيا',
    'أبو عريش',
    'صامطة',
    'بيش',
    'الدرب',
    'العارضة',
    'الريث',
    'الحرث',
    'الدائر',
    'العيدابي',
    'الطوال',
    'ضمد',
    'الموسم',
    'فرسان',
    'الأحد المسارحة',
    'بيش الوسطى',
  ],
  'منطقة نجران': ['نجران', 'شرورة', 'حبونا', 'بدر الجنوب', 'ثار', 'خباش', 'يدمة'],
  'منطقة الباحة': [
    'الباحة',
    'بلجرشي',
    'المندق',
    'القرى',
    'العقيق',
    'قلوة',
    'المخواة',
    'غامد الزناد',
  ],
  'منطقة الجوف': ['سكاكا', 'دومة الجندل', 'طبرجل', 'القريات', 'صوير'],
}

// Governorates per city — only populated when the city actually has
// a sub-governorate level. Empty array (or absent key) means the
// city sits directly under its region with no governorate divider.
//
// The data is shallow on purpose: we surface the most commonly used
// district groupings under cities like Riyadh / Jeddah / Dammam where
// users do think about sub-municipalities ("شمال الرياض", "شرق
// الرياض"). Smaller cities skip this tier entirely.
const SA_GOVERNORATES: Record<string, string[]> = {
  // Riyadh is divided into informal sub-zones for delivery purposes.
  'الرياض': [
    'شمال الرياض',
    'شرق الرياض',
    'غرب الرياض',
    'جنوب الرياض',
    'وسط الرياض',
  ],
  // Jeddah's main planning sub-zones (used by Aramex / Saudi Post).
  'جدة': ['شمال جدة', 'وسط جدة', 'جنوب جدة', 'شرق جدة'],
  // Dammam metro effectively covers Dammam + Khobar + Dhahran.
  'الدمام': ['شمال الدمام', 'وسط الدمام', 'جنوب الدمام'],
  'الأحساء': ['الهفوف', 'المبرز', 'العمران'],
  // Madinah-area sub-zones.
  'المدينة المنورة': ['وسط المدينة', 'شمال المدينة', 'جنوب المدينة'],
  'مكة المكرمة': ['وسط مكة', 'شمال مكة', 'العزيزية', 'العوالي'],
  'الطائف': ['وسط الطائف', 'الهدا', 'الشفا'],
}

// Districts per city (or per governorate for cities that have
// sub-governorates). Keyed by the most specific parent — usually city
// name; occasionally governorate when the sub-municipality is the
// natural parent.
//
// Districts are the level users actually type into address forms;
// missing entries fall through to free-form input.
const SA_DISTRICTS: Record<string, string[]> = {
  'الرياض': [
    'العليا',
    'الملقا',
    'حطين',
    'الياسمين',
    'الورود',
    'النخيل',
    'الروضة',
    'السليمانية',
    'العقيق',
    'القيروان',
    'الصحافة',
    'العارض',
    'النرجس',
    'الازدهار',
    'المنار',
    'الحمراء',
    'الوزارات',
    'الفيحاء',
    'الشفا',
    'إشبيلية',
    'قرطبة',
    'النفل',
    'الربيع',
    'الخالدية',
    'الفاخرية',
    'الواحة',
    'لبن',
    'السويدي',
    'العريجاء',
    'ظهرة لبن',
    'العود',
    'البطحاء',
    'الغدير',
    'المروج',
    'الملك فهد',
    'الملك عبدالعزيز',
    'الملك سلمان',
    'الندى',
    'الفلاح',
    'الجزيرة',
    'المعذر',
    'المحمدية',
    'الدار البيضاء',
    'الشميسي',
    'المرسلات',
    'الورود',
    'النموذجية',
    'الواحة',
    'النسيم',
    'الرحاب',
    'صلاح الدين',
    'الزهراء',
    'الربوة',
  ],
  'جدة': [
    'الزهراء',
    'الروضة',
    'الشاطئ',
    'الحمراء',
    'النعيم',
    'الصفا',
    'المروة',
    'الفيصلية',
    'الرحاب',
    'البساتين',
    'النزهة',
    'الأندلس',
    'البوادي',
    'النهضة',
    'الواحة',
    'مشرفة',
    'الفيحاء',
    'الورود',
    'الجامعة',
    'العزيزية',
    'الكورنيش',
    'البلد',
    'الثغر',
    'النسيم',
    'الصواري',
    'ابحر الشمالية',
    'ابحر الجنوبية',
    'الحمدانية',
    'الخالدية',
    'الزهور',
    'المرجان',
    'الفهد',
  ],
  'مكة المكرمة': [
    'العزيزية',
    'الزاهر',
    'الششة',
    'العوالي',
    'النوارية',
    'الشوقية',
    'بطحاء قريش',
    'العتيبية',
    'المسفلة',
    'أجياد',
    'الحجون',
    'الزهراء',
    'النسيم',
    'الكعكية',
    'العدل',
    'النزهة',
  ],
  'المدينة المنورة': [
    'قباء',
    'العقيق',
    'الحرة الشرقية',
    'الحرة الغربية',
    'العزيزية',
    'الدفاع',
    'النخيل',
    'العنبرية',
    'الرانوناء',
    'بني خدرة',
    'الدويمة',
    'الإسكان',
    'الجامعة',
    'سيد الشهداء',
  ],
  'الدمام': [
    'الشاطئ',
    'الفيصلية',
    'النور',
    'الراكة',
    'النخيل',
    'الفنار',
    'الإسكان',
    'الزهور',
    'الواحة',
    'الفيحاء',
    'الأمانة',
    'الندى',
    'الجلوية',
    'الشعلة',
    'البديع',
    'الأثير',
  ],
  'الخبر': [
    'العليا',
    'الراكة',
    'الكورنيش',
    'الثقبة',
    'الحزام الأخضر',
    'الجسر',
    'الخزامى',
    'العقربية',
    'البندرية',
    'اليرموك',
    'العزيزية',
    'الراكة الجنوبية',
    'الراكة الشمالية',
  ],
  'الظهران': [
    'الدوحة',
    'تهامة',
    'هجر',
    'الجامعة',
    'القصور',
    'العزيزية',
    'الراكة',
  ],
  'الأحساء': [
    'الهفوف',
    'المبرز',
    'العيون',
    'العمران',
    'الجفر',
    'الطرف',
    'الكلابية',
    'القارة',
    'الشعبة',
  ],
  'القطيف': [
    'القطيف',
    'تاروت',
    'صفوى',
    'سيهات',
    'الأوجام',
    'العوامية',
    'القديح',
    'أم الحمام',
  ],
  'الجبيل': [
    'الجبيل الصناعية',
    'الجبيل البلد',
    'الفناتير',
    'الأمواج',
    'النخيل',
    'الدفي',
    'الرياض',
    'الدانة',
  ],
  'الطائف': [
    'الشهداء الجنوبية',
    'الشهداء الشمالية',
    'الفيصلية',
    'الحلقة',
    'الوسام',
    'الروضة',
    'العزيزية',
    'الجال',
    'شهار',
    'حوايا',
  ],
  'بريدة': [
    'الإسكان',
    'الفايزية',
    'الصفراء',
    'الإيمان',
    'النقع',
    'الفيصلية',
    'النخيل',
    'الرحمانية',
    'الصالحية',
    'الخليج',
    'الريان',
    'الزهور',
    'الافق',
    'الورود',
    'العليا',
    'الإسكان الجنوبي',
  ],
  'عنيزة': [
    'الجامعة',
    'الفيصلية',
    'العزيزية',
    'الرحمانية',
    'الصفراء',
    'الإسكان',
    'النفل',
    'النخيل',
  ],
  'حائل': [
    'الزبارة',
    'النقرة',
    'برزان',
    'سماح',
    'العزيزية',
    'النسيم',
    'الجامعيين',
    'العليا',
    'الراشدية',
    'الإسكان',
  ],
  'تبوك': [
    'العزيزية',
    'الخالدية',
    'النزهة',
    'المروج',
    'السلام',
    'الورود',
    'الفيصلية',
    'المحمدية',
    'الإسكان',
    'الروضة',
  ],
  'أبها': [
    'المنسك',
    'الموظفين',
    'الورود',
    'الشفا',
    'حي الأمير سلطان',
    'البديع',
    'العرين',
    'الشعف',
    'الإسكان',
    'الصفا',
  ],
  'خميس مشيط': [
    'الراقي',
    'الموظفين',
    'العزيزية',
    'العليا',
    'الإسكان',
    'الواحة',
    'النسيم',
    'الورود',
  ],
  'نجران': [
    'الفيصلية',
    'الفهد',
    'الأمير مشعل',
    'الفيحاء',
    'الشرفة',
    'العريسة',
  ],
  'جازان': [
    'الروضة',
    'الشاطئ',
    'الصفا',
    'الزهور',
    'المطار',
    'الدغارير',
  ],
  'سكاكا': ['الجوف', 'الفيصلية', 'الإسكان', 'العزيزية', 'النخيل'],
  'عرعر': ['البلدية', 'الإسكان', 'العليا', 'الفيصلية', 'الورود'],
  'الباحة': ['الزرايب', 'العقيق', 'الجبل', 'الشعب', 'العقبة'],
  'ينبع': ['الصناعية', 'النخيل', 'النواة', 'الفيحاء', 'الرضوى', 'الرويس'],
  // Riyadh sub-zones — districts ALSO live here keyed by sub-zone so
  // the Governorate tier in the form can narrow the district list
  // when the user picks "شمال الرياض" etc. Each entry overlaps with
  // the city-level list above so it's safe to treat the latter as
  // the union view.
  'شمال الرياض': [
    'العليا',
    'الملقا',
    'الياسمين',
    'النرجس',
    'الصحافة',
    'الفلاح',
    'العارض',
    'الندى',
    'حطين',
  ],
  'شرق الرياض': ['الروضة', 'الربوة', 'النسيم', 'القدس', 'الريان'],
  'غرب الرياض': ['العقيق', 'الحمراء', 'إشبيلية', 'قرطبة', 'الواحة'],
  'جنوب الرياض': ['السويدي', 'لبن', 'البديعة', 'الشفا', 'العريجاء'],
  'وسط الرياض': ['الوزارات', 'البطحاء', 'المرقب', 'الديرة', 'الفوطة'],
  'شمال جدة': ['الشاطئ', 'النعيم', 'الزهراء', 'ابحر الشمالية', 'البساتين'],
  'وسط جدة': ['البلد', 'العزيزية', 'الكورنيش', 'الفيصلية', 'المشرفة'],
  'جنوب جدة': ['المرجان', 'الثغر', 'الخمرة', 'الفيحاء'],
  'شرق جدة': ['النزهة', 'الأندلس', 'النسيم', 'الواحة'],
}

// ──────────────────────────────────────────────────────────────────
// KUWAIT (دولة الكويت)
// ──────────────────────────────────────────────────────────────────
// Hierarchy: Governorate (محافظة) → Area (منطقة) → Block (قطعة).
// All six governorates and their major areas are covered. Block
// numbers are entered as numeric values; we expose realistic ranges
// per area but the field accepts free entry too.

const KW_GOVERNORATES = [
  'العاصمة',
  'حولي',
  'الفروانية',
  'الأحمدي',
  'مبارك الكبير',
  'الجهراء',
] as const

const KW_AREAS: Record<string, string[]> = {
  'العاصمة': [
    'مدينة الكويت',
    'الشرق',
    'القبلة',
    'المرقاب',
    'الدسمة',
    'الشامية',
    'الشويخ',
    'كيفان',
    'الفيحاء',
    'الروضة',
    'العديلية',
    'الخالدية',
    'الصوابر',
    'بنيد القار',
    'الدعية',
    'النزهة',
    'القادسية',
    'دسمان',
    'مرشد',
    'ضاحية عبدالله السالم',
    'الصليبيخات',
    'الدوحة',
    'النهضة',
    'الصبية',
    'سعد العبدالله',
  ],
  'حولي': [
    'حولي',
    'السالمية',
    'الجابرية',
    'الرميثية',
    'بيان',
    'مشرف',
    'سلوى',
    'البدع',
    'حطين',
    'الشعب',
    'النقرة',
    'ميدان حولي',
  ],
  'الفروانية': [
    'الفروانية',
    'العمرية',
    'خيطان',
    'العارضية',
    'الرابية',
    'الأندلس',
    'إشبيلية',
    'الرحاب',
    'الفردوس',
    'العمرية الجنوبية',
    'الرقعي',
    'الضجيج',
    'صباح الناصر',
    'عبدالله المبارك',
    'جليب الشيوخ',
    'الري',
    'مطار الكويت',
  ],
  'الأحمدي': [
    'الفحيحيل',
    'المنقف',
    'أبو حليفة',
    'الأحمدي',
    'هدية',
    'الرقة',
    'الفنطاس',
    'العقيلة',
    'المهبولة',
    'الصباحية',
    'الظهر',
    'علي صباح السالم',
    'الوفرة',
    'الخيران',
    'مدينة صباح الأحمد',
    'مينا عبدالله',
    'بنيدر',
  ],
  'مبارك الكبير': [
    'العدان',
    'القرين',
    'القصور',
    'صبحان',
    'صباح السالم',
    'مبارك الكبير',
    'المسيلة',
    'أبو فطيرة',
    'أبو الحصانية',
    'الفنيطيس',
    'مشرف',
  ],
  'الجهراء': [
    'الجهراء',
    'النعيم',
    'الواحة',
    'القصر',
    'تيماء',
    'الصليبية',
    'العيون',
    'النسيم',
    'سعد العبدالله',
    'الجهراء الجديدة',
    'كبد',
    'الصبية',
    'أمغرة',
  ],
}

const KW_BLOCKS: Record<string, string[]> = {
  'مدينة الكويت': ['قطعة 1', 'قطعة 2', 'قطعة 3', 'قطعة 4'],
  'السالمية': ['قطعة 1', 'قطعة 2', 'قطعة 3', 'قطعة 4', 'قطعة 5', 'قطعة 6', 'قطعة 7', 'قطعة 8', 'قطعة 9', 'قطعة 10', 'قطعة 11', 'قطعة 12'],
  'الجابرية': ['قطعة 1', 'قطعة 2', 'قطعة 3', 'قطعة 4', 'قطعة 5', 'قطعة 6', 'قطعة 7', 'قطعة 8', 'قطعة 9', 'قطعة 10', 'قطعة 11', 'قطعة 12'],
  'حولي': ['قطعة 1', 'قطعة 2', 'قطعة 3', 'قطعة 4', 'قطعة 5'],
  'الرميثية': ['قطعة 1', 'قطعة 2', 'قطعة 3', 'قطعة 4', 'قطعة 5', 'قطعة 6', 'قطعة 7', 'قطعة 8', 'قطعة 9', 'قطعة 10', 'قطعة 11', 'قطعة 12'],
  'بيان': ['قطعة 1', 'قطعة 2', 'قطعة 3', 'قطعة 4', 'قطعة 5', 'قطعة 6', 'قطعة 7', 'قطعة 8', 'قطعة 9', 'قطعة 10', 'قطعة 11', 'قطعة 12'],
  'مشرف': ['قطعة 1', 'قطعة 2', 'قطعة 3', 'قطعة 4', 'قطعة 5', 'قطعة 6'],
  'سلوى': ['قطعة 1', 'قطعة 2', 'قطعة 3', 'قطعة 4', 'قطعة 5', 'قطعة 6', 'قطعة 7', 'قطعة 8', 'قطعة 9', 'قطعة 10', 'قطعة 11', 'قطعة 12'],
  'الفروانية': ['قطعة 1', 'قطعة 2', 'قطعة 3', 'قطعة 4', 'قطعة 5'],
  'العمرية': ['قطعة 1', 'قطعة 2', 'قطعة 3', 'قطعة 4', 'قطعة 5'],
  'خيطان': ['قطعة 1', 'قطعة 2', 'قطعة 3', 'قطعة 4', 'قطعة 5', 'قطعة 6'],
  'الفحيحيل': ['قطعة 1', 'قطعة 2', 'قطعة 3', 'قطعة 4', 'قطعة 5', 'قطعة 6', 'قطعة 7', 'قطعة 8'],
  'المنقف': ['قطعة 1', 'قطعة 2', 'قطعة 3', 'قطعة 4', 'قطعة 5'],
  'أبو حليفة': ['قطعة 1', 'قطعة 2', 'قطعة 3', 'قطعة 4', 'قطعة 5'],
  'صباح السالم': ['قطعة 1', 'قطعة 2', 'قطعة 3', 'قطعة 4', 'قطعة 5', 'قطعة 6', 'قطعة 7', 'قطعة 8', 'قطعة 9', 'قطعة 10'],
  'العدان': ['قطعة 1', 'قطعة 2', 'قطعة 3', 'قطعة 4', 'قطعة 5'],
  'القرين': ['قطعة 1', 'قطعة 2', 'قطعة 3', 'قطعة 4', 'قطعة 5'],
  'الجهراء': ['قطعة 1', 'قطعة 2', 'قطعة 3', 'قطعة 4', 'قطعة 5'],
}

// ──────────────────────────────────────────────────────────────────
// UAE (الإمارات العربية المتحدة)
// ──────────────────────────────────────────────────────────────────
// Hierarchy: Emirate → City → Area (community/neighbourhood).
// All seven emirates with their main cities and most-referenced
// communities for delivery purposes.

const AE_EMIRATES = [
  'أبوظبي',
  'دبي',
  'الشارقة',
  'عجمان',
  'أم القيوين',
  'رأس الخيمة',
  'الفجيرة',
] as const

const AE_CITIES: Record<string, string[]> = {
  'أبوظبي': ['أبوظبي', 'العين', 'الرويس', 'مدينة زايد', 'غياثي', 'مدينة خليفة'],
  'دبي': ['دبي', 'حتا'],
  'الشارقة': ['الشارقة', 'كلباء', 'خورفكان', 'الذيد', 'دبا الحصن', 'مدينة المدام'],
  'عجمان': ['عجمان', 'مصفوت', 'منامة عجمان'],
  'أم القيوين': ['أم القيوين', 'فلج المعلا'],
  'رأس الخيمة': ['رأس الخيمة', 'خت', 'الجزيرة الحمراء', 'مسافي', 'الرمس'],
  'الفجيرة': ['الفجيرة', 'دبا الفجيرة', 'البدية', 'القرية', 'مربح'],
}

const AE_AREAS: Record<string, string[]> = {
  'أبوظبي': [
    'الكورنيش',
    'المرور',
    'الحصن',
    'الزاهية',
    'النادي السياحي',
    'البطين',
    'الخالدية',
    'الكرامة',
    'الروضة',
    'المشرف',
    'المصفح',
    'الشهامة',
    'البحية',
    'جزيرة ياس',
    'جزيرة السعديات',
    'جزيرة الريم',
    'مدينة محمد بن زايد',
    'مدينة الرياضة',
    'منطقة المطار',
    'بني ياس',
    'الشامخة',
    'الفلاح',
    'الباهية',
    'الراحة',
  ],
  'العين': [
    'الجيمي',
    'هيلي',
    'العين الصناعية',
    'الفوعة',
    'النيادات',
    'المويجعي',
    'الجاهلي',
    'الخبيصي',
    'المعترض',
    'المطاوعة',
    'العين الحضري',
    'الحيلي',
    'الزاخر',
    'الصاروج',
    'القطارة',
  ],
  'دبي': [
    'وسط مدينة دبي',
    'الخليج التجاري',
    'الجميرا',
    'برشاء',
    'القوز',
    'المرابع العربية',
    'المرسى',
    'مرسى دبي',
    'دبي مارينا',
    'بر دبي',
    'ديرة',
    'القصيص',
    'الكرامة',
    'البرشاء',
    'تلال الإمارات',
    'مدينة جميرا',
    'دبي هيلز',
    'القرهود',
    'المنخول',
    'المنارة',
    'النهدة',
    'ميدان',
    'مدينة دبي للاستديوهات',
    'دبي لاند',
    'الخوانيج',
    'مردف',
    'الورقاء',
    'العوير',
    'حتا',
    'المزهر',
    'الورقاء',
    'القوز الصناعية',
    'جبل علي',
    'دبي الجنوب',
  ],
  'الشارقة': [
    'المجاز',
    'القصباء',
    'الخان',
    'النهدة',
    'الزاهية',
    'العزرة',
    'الجامعة',
    'المنطقة الحرة',
    'الناصرية',
    'بوطينة',
    'الخالدية',
    'الفيحاء',
    'الراشدية',
    'الممزر',
    'البطائح',
    'القاسمية',
    'مويلح',
    'النهضة',
  ],
  'عجمان': [
    'الجرف',
    'الراشدية',
    'النعيمية',
    'الروضة',
    'الحميدية',
    'الزاهرة',
    'الياسمين',
    'مشيرف',
    'البستان',
    'منطقة عجمان الصناعية',
    'الصوان',
    'العزيزية',
  ],
  'أم القيوين': ['الراس', 'البحوارين', 'السلمة', 'الخور', 'العزيزية'],
  'رأس الخيمة': [
    'النخيل',
    'الحمرا',
    'كورنيش رأس الخيمة',
    'منار',
    'سيح المظلوم',
    'الظيت',
    'دفان',
    'الرفاع',
  ],
  'الفجيرة': [
    'الفصيل',
    'كورنيش الفجيرة',
    'الفصيل الصناعية',
    'مدينة الفجيرة الجديدة',
    'مرشد',
    'الحيل',
    'الطويين',
    'صفد',
  ],
}

// ──────────────────────────────────────────────────────────────────
// QATAR (دولة قطر)
// ──────────────────────────────────────────────────────────────────
// Hierarchy: Municipality (بلدية) → Zone/Area → District/Street.

const QA_MUNICIPALITIES = [
  'الدوحة',
  'الريان',
  'الوكرة',
  'الخور والذخيرة',
  'الشمال',
  'الضعاين',
  'أم صلال',
  'الشحانية',
] as const

const QA_AREAS: Record<string, string[]> = {
  'الدوحة': [
    'الكورنيش',
    'مشيرب',
    'الدفنة',
    'وست باي',
    'فريج بن محمود',
    'فريج العسيري',
    'النصر',
    'فريج كليب',
    'العزيزية',
    'بن عمران',
    'فريج الكوت',
    'فريج بن درهم',
    'منطقة المطار القديم',
    'الخليفات',
    'السد',
    'المنصورة',
    'فريج المرخية',
    'فريج النجدة',
    'النجمة',
    'فريج عبدالعزيز',
    'الهتمي',
    'السلطة',
    'البدع',
    'البستان',
  ],
  'الريان': [
    'الريان القديم',
    'الريان الجديد',
    'معيذر',
    'العزيزية',
    'الغانم القديم',
    'الغانم الجديد',
    'فريج الأمير',
    'الوعب',
    'لوسيل',
    'الثمامة',
    'مدينة خليفة',
    'بوهامور',
    'الكعبان',
    'الفريج الأمير',
  ],
  'الوكرة': ['الوكرة', 'الوكير', 'مشاف', 'مسيعيد', 'الجنوب'],
  'الخور والذخيرة': ['الخور', 'الذخيرة', 'سميسمة'],
  'الشمال': ['مدينة الشمال', 'أبو ظلوف', 'الرويس', 'الخريب'],
  'الضعاين': ['الضعاين', 'سميسمة', 'الجريان', 'العنبر', 'بوسلاسل'],
  'أم صلال': ['أم صلال علي', 'أم صلال محمد', 'السيلية'],
  'الشحانية': ['الشحانية', 'أبو نخلة', 'الكرعانة', 'الجميلية'],
}

const QA_DISTRICTS: Record<string, string[]> = {
  'الكورنيش': ['شارع الكورنيش', 'شارع الديوان', 'شارع المتحف'],
  'مشيرب': ['شارع المسحب', 'شارع جسرة', 'شارع المسحب الجنوبي'],
  'الدفنة': ['شارع لوسيل', 'شارع الميناء', 'شارع المرور'],
  'وست باي': ['برج الدفنة', 'مارينا الدفنة', 'حي السفارات'],
  'الريان القديم': ['شارع الريان', 'شارع الجامعة', 'شارع المسلم'],
  'الريان الجديد': ['شارع الفروسية', 'شارع التحلية', 'شارع المعارض'],
  'معيذر': ['شارع معيذر', 'شارع الزبارة'],
  'الوكرة': ['شارع الوكرة', 'شارع البحر'],
  'الخور': ['شارع الخور', 'شارع الميناء'],
  'لوسيل': ['مارينا لوسيل', 'حي الإيمان', 'حي الخليج', 'بوليفارد لوسيل'],
}

// ──────────────────────────────────────────────────────────────────
// BAHRAIN (مملكة البحرين)
// ──────────────────────────────────────────────────────────────────
// Hierarchy: Governorate → City/Town → Block (numeric).
// Bahrain uses a 3- or 4-digit block numbering scheme (e.g. 316,
// 317, 551). We surface the most common blocks per city; the field
// accepts free entry for the rest.

const BH_GOVERNORATES = [
  'العاصمة',
  'الشمالية',
  'الجنوبية',
  'المحرق',
] as const

const BH_CITIES: Record<string, string[]> = {
  'العاصمة': ['المنامة', 'الجفير', 'العدلية', 'القضيبية', 'النعيم', 'السنابس', 'الدراز'],
  'الشمالية': ['البديع', 'الجنبية', 'بوقوة', 'كرباباد', 'مدينة حمد', 'صدد', 'دير', 'سار', 'بني جمرة'],
  'الجنوبية': ['الرفاع', 'الرفاع الشرقي', 'الرفاع الغربي', 'الزلاق', 'العوالي', 'مدينة عيسى', 'الحنينية', 'دار كليب'],
  'المحرق': ['المحرق', 'الحد', 'عراد', 'جزر أمواج', 'الدير', 'سماهيج', 'البسيتين'],
}

const BH_BLOCKS: Record<string, string[]> = {
  'المنامة': ['316', '317', '318', '319', '320', '321', '322', '323', '326', '328'],
  'الجفير': ['316', '317', '319', '320', '326'],
  'العدلية': ['319', '320', '321', '322'],
  'القضيبية': ['317', '318', '321', '322'],
  'النعيم': ['322', '321', '326', '329'],
  'البديع': ['551', '552', '553', '555'],
  'الجنبية': ['571', '572'],
  'مدينة حمد': ['1201', '1202', '1203', '1204', '1205', '1206', '1207', '1208', '1209', '1210'],
  'سار': ['526', '527', '528', '529'],
  'الرفاع': ['903', '904', '905', '906', '907', '908', '909', '910'],
  'الرفاع الشرقي': ['923', '924', '925'],
  'الرفاع الغربي': ['915', '916', '917'],
  'الزلاق': ['1054', '1055', '1056'],
  'مدينة عيسى': ['801', '802', '803', '804', '805', '806', '807'],
  'المحرق': ['203', '204', '205', '206', '207', '208', '209', '210', '211', '212', '213', '214', '215', '216'],
  'الحد': ['107', '108', '109', '110', '111', '112'],
  'جزر أمواج': ['253', '254', '255', '256'],
  'عراد': ['240', '241', '242', '243', '244'],
}

// ──────────────────────────────────────────────────────────────────
// OMAN (سلطنة عُمان)
// ──────────────────────────────────────────────────────────────────
// Hierarchy: Governorate (محافظة) → Wilayat (ولاية) → District/Area.

const OM_GOVERNORATES = [
  'مسقط',
  'ظفار',
  'الباطنة شمال',
  'الباطنة جنوب',
  'الداخلية',
  'الشرقية شمال',
  'الشرقية جنوب',
  'الظاهرة',
  'البريمي',
  'مسندم',
  'الوسطى',
] as const

const OM_WILAYATS: Record<string, string[]> = {
  'مسقط': ['مسقط', 'مطرح', 'بوشر', 'السيب', 'العامرات', 'قريات'],
  'ظفار': ['صلالة', 'طاقة', 'مرباط', 'سدح', 'رخيوت', 'ضلكوت', 'ثمريت', 'مقشن', 'شليم وجزر الحلانيات', 'المزيونة'],
  'الباطنة شمال': ['صحار', 'شناص', 'لوى', 'صحم', 'الخابورة', 'السويق', 'المصنعة', 'بركاء'],
  'الباطنة جنوب': ['الرستاق', 'العوابي', 'نخل', 'وادي المعاول', 'بركاء', 'المصنعة'],
  'الداخلية': ['نزوى', 'بهلاء', 'منح', 'الحمراء', 'أدم', 'إزكي', 'سمائل', 'بدبد'],
  'الشرقية شمال': ['إبراء', 'المضيبي', 'بدية', 'القابل', 'وادي بني خالد', 'دماء والطائيين'],
  'الشرقية جنوب': ['صور', 'الكامل والوافي', 'جعلان بني بو علي', 'جعلان بني بو حسن', 'مصيرة'],
  'الظاهرة': ['عبري', 'ينقل', 'ضنك'],
  'البريمي': ['البريمي', 'محضة', 'السنينة'],
  'مسندم': ['خصب', 'بخا', 'دبا البيعة', 'مدحاء'],
  'الوسطى': ['هيما', 'محوت', 'الدقم', 'الجازر'],
}

const OM_DISTRICTS: Record<string, string[]> = {
  'مسقط': ['روي', 'الخوض', 'مدينة قابوس', 'دارسيت', 'الوادي الكبير', 'الإنشراح', 'القرم'],
  'مطرح': ['مطرح', 'الفلج', 'الحمرية', 'وادي عدي', 'كلبوه'],
  'بوشر': ['بوشر', 'غلا', 'العذيبة', 'الحيل', 'المعبيلة', 'الموالح'],
  'السيب': ['السيب', 'المعبيلة', 'الحيل', 'الموج', 'الخوض'],
  'صلالة': ['الحصن', 'الدهاريز', 'صلالة الجديدة', 'صلالة الوسطى', 'عوقد', 'الوادي', 'صحلنوت'],
  'صحار': ['صحار', 'لوى', 'الفلج', 'حلة الشيخ', 'الترف'],
  'الرستاق': ['الرستاق', 'وادي بني خروص', 'وادي السحتن'],
  'بركاء': ['بركاء', 'المصنعة', 'الكبرى', 'بدبد'],
  'نزوى': ['نزوى', 'بركة الموز', 'تنوف', 'سيت'],
  'صور': ['صور', 'الحارة الشمالية', 'الحارة الجنوبية', 'العيجة'],
}

// ──────────────────────────────────────────────────────────────────
// CATCH-ALL: free-text mode for unsupported countries
// ──────────────────────────────────────────────────────────────────
// When a user picks a country that isn't in the catalog, we expose a
// 3-tier generic schema (region / city / district) and accept free
// text. The same fallback applies to the stores filter.

const OTHER_REGIONS: string[] = []

// ──────────────────────────────────────────────────────────────────
// COUNTRY CONFIGS
// ──────────────────────────────────────────────────────────────────

export const COUNTRY_LOCATIONS: Record<string, CountryLocationConfig> = {
  SA: {
    code: 'SA',
    name: { ar: 'السعودية', en: 'Saudi Arabia' },
    flag: '🇸🇦',
    tiers: [
      { field: 'region', labelKey: 'addr.region' },
      { field: 'city', labelKey: 'addr.city' },
      { field: 'governorate', labelKey: 'addr.governorate', optional: true },
      { field: 'district', labelKey: 'addr.district' },
    ],
    data: {
      tier1: [...SA_REGIONS],
      tier2: SA_CITIES,
      tier3: SA_GOVERNORATES,
      tier4: SA_DISTRICTS,
    },
  },
  KW: {
    code: 'KW',
    name: { ar: 'الكويت', en: 'Kuwait' },
    flag: '🇰🇼',
    tiers: [
      { field: 'governorate', labelKey: 'addr.governorate' },
      { field: 'city', labelKey: 'addr.area' },
      { field: 'district', labelKey: 'addr.block' },
    ],
    data: {
      tier1: [...KW_GOVERNORATES],
      tier2: KW_AREAS,
      tier3: KW_BLOCKS,
    },
  },
  AE: {
    code: 'AE',
    name: { ar: 'الإمارات', en: 'United Arab Emirates' },
    flag: '🇦🇪',
    tiers: [
      { field: 'region', labelKey: 'addr.emirate' },
      { field: 'city', labelKey: 'addr.city' },
      { field: 'district', labelKey: 'addr.area', optional: true },
    ],
    data: {
      tier1: [...AE_EMIRATES],
      tier2: AE_CITIES,
      tier3: AE_AREAS,
    },
  },
  QA: {
    code: 'QA',
    name: { ar: 'قطر', en: 'Qatar' },
    flag: '🇶🇦',
    tiers: [
      { field: 'region', labelKey: 'addr.municipality' },
      { field: 'city', labelKey: 'addr.area' },
      { field: 'district', labelKey: 'addr.district', optional: true },
    ],
    data: {
      tier1: [...QA_MUNICIPALITIES],
      tier2: QA_AREAS,
      tier3: QA_DISTRICTS,
    },
  },
  BH: {
    code: 'BH',
    name: { ar: 'البحرين', en: 'Bahrain' },
    flag: '🇧🇭',
    tiers: [
      { field: 'governorate', labelKey: 'addr.governorate' },
      { field: 'city', labelKey: 'addr.city' },
      { field: 'district', labelKey: 'addr.block' },
    ],
    data: {
      tier1: [...BH_GOVERNORATES],
      tier2: BH_CITIES,
      tier3: BH_BLOCKS,
    },
  },
  OM: {
    code: 'OM',
    name: { ar: 'عُمان', en: 'Oman' },
    flag: '🇴🇲',
    tiers: [
      { field: 'governorate', labelKey: 'addr.governorate' },
      { field: 'city', labelKey: 'addr.wilayat' },
      { field: 'district', labelKey: 'addr.district', optional: true },
    ],
    data: {
      tier1: [...OM_GOVERNORATES],
      tier2: OM_WILAYATS,
      tier3: OM_DISTRICTS,
    },
  },
  OTHER: {
    code: 'OTHER',
    name: { ar: 'دولة أخرى', en: 'Other country' },
    flag: '🌍',
    tiers: [
      { field: 'region', labelKey: 'addr.region', optional: true },
      { field: 'city', labelKey: 'addr.city' },
      { field: 'district', labelKey: 'addr.district', optional: true },
    ],
    data: {
      tier1: OTHER_REGIONS,
    },
  },
}

// Display list for country pickers. Mirrors the iteration order used
// by AddressForm; "OTHER" is appended last as a catch-all.
export const COUNTRIES_LIST: { code: string; name: { ar: string; en: string }; flag: string }[] =
  Object.values(COUNTRY_LOCATIONS).map((c) => ({
    code: c.code,
    name: c.name,
    flag: c.flag,
  }))

// Convenience: just the supported country codes (for picker chips).
export const SUPPORTED_COUNTRY_CODES = Object.keys(COUNTRY_LOCATIONS).filter(
  (c) => c !== 'OTHER',
)

// ──────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────

export function getLocationConfig(code: string): CountryLocationConfig | undefined {
  return COUNTRY_LOCATIONS[code]
}

// Resolve options for a given tier index (1-based) given the chosen
// values at higher tiers. Returns an empty array when:
//   - the country isn't in the catalog
//   - the tier doesn't exist for this country
//   - the parent tier value isn't selected yet
//   - no catalog entries exist for the parent value (caller can then
//     fall back to a free-text input)
export function getTierOptions(
  countryCode: string,
  tierIndex: 1 | 2 | 3 | 4,
  parentValues: { tier1?: string; tier2?: string; tier3?: string },
): string[] {
  const config = getLocationConfig(countryCode)
  if (!config) return []
  if (tierIndex > config.tiers.length) return []
  const data = config.data
  if (tierIndex === 1) return data.tier1 ?? []
  if (tierIndex === 2) {
    const parent = parentValues.tier1
    if (!parent) return []
    return data.tier2?.[parent] ?? []
  }
  if (tierIndex === 3) {
    const parent = parentValues.tier2
    if (!parent) return []
    return data.tier3?.[parent] ?? []
  }
  // tier4
  // For tier4 prefer tier3 as parent when set; fall back to tier2 if
  // the country skips tier3 (e.g. Saudi cities with no governorate
  // sub-zone — districts are keyed by city directly).
  const parent = parentValues.tier3 || parentValues.tier2
  if (!parent) return []
  return data.tier4?.[parent] ?? []
}

// Map a tier index back to the backend Address column name. Used when
// posting structured location values from a multi-tier picker.
export function fieldForTier(
  countryCode: string,
  tierIndex: 1 | 2 | 3 | 4,
): LocationField | null {
  const config = getLocationConfig(countryCode)
  if (!config) return null
  return config.tiers[tierIndex - 1]?.field ?? null
}

// Compose an `address.details` map keyed by the backend column names
// from a list of tier values, in tier order. Stops at the first
// undefined value so partial selections are persisted faithfully.
export function buildLocationDetails(
  countryCode: string,
  values: { tier1?: string; tier2?: string; tier3?: string; tier4?: string },
): Record<string, string> {
  const config = getLocationConfig(countryCode)
  if (!config) return {}
  const out: Record<string, string> = {}
  const all = [values.tier1, values.tier2, values.tier3, values.tier4]
  for (let i = 0; i < config.tiers.length; i++) {
    const v = all[i]
    if (!v) break
    const tier = config.tiers[i]
    out[tier.field] = v
  }
  return out
}

// ──────────────────────────────────────────────────────────────────
// BACKEND CONTRACT (documentation)
// ──────────────────────────────────────────────────────────────────
// The backend Address model already has dedicated columns for every
// field this catalog speaks about — values posted from the form land
// in the right place without a translation layer:
//
//   region        TEXT   – top admin division (region/emirate/etc.)
//   city          TEXT   – city or area
//   governorate   TEXT   – sub-municipality (used by SA/KW/BH/OM)
//   district      TEXT   – neighbourhood / block / wilayat
//   country       TEXT   – ISO code, e.g. 'SA'
//
// FUTURE: lift this catalog onto the backend as a /locations API
// keyed by country. Endpoint shape we'd want:
//
//   GET /locations?country=SA
//     → { tiers: [...], data: { tier1: [...], tier2: {...}, ... } }
//
// then this module becomes a thin client over a fetched dataset.
// Until then, every consumer reads through `getLocationConfig` so
// the migration is one file.

export const BACKEND_LOCATION_FIELDS: ReadonlyArray<LocationField> = [
  'region',
  'city',
  'governorate',
  'district',
] as const
