// Placeholder data for the prototype.

export type StoreCategory =
  | 'flowers'
  | 'chocolate'
  | 'cake'
  | 'perishable'
  | 'perfume'
  | 'gifts'
  // Non-perishable categories. Added to keep the filter bar fresh; sample
  // data may not include any rows in these buckets yet, but the filter
  // chip + future merchant integrations rely on the type being expressive.
  | 'clothes'
  | 'accessories'

// Categories whose products spoil or wilt and must therefore be matched to
// an address in the *same city* as the store. Anything else uses the
// receiver's default address with no city constraint.
export const FAST_DELIVERY_CATEGORIES: ReadonlySet<StoreCategory> = new Set([
  'flowers',
  'chocolate',
  'cake',
  'perishable',
])

export function isFastDeliveryCategory(c: StoreCategory): boolean {
  return FAST_DELIVERY_CATEGORIES.has(c)
}

export type StoreTag = 'fast' | 'same_day' | 'nearby'

export type StoreProduct = {
  id: string
  name: string
  price: string
  // Optional override; falls back to the parent store's category.
  category?: StoreCategory
}

export type Store = {
  id: string
  name: string
  category: StoreCategory
  city: string
  district: string
  country: string
  rating: number
  tags: StoreTag[]
  blurb: string
  products: StoreProduct[]
  // Optional public-facing URL (the merchant's own site). Reserved for
  // future integration with official-store APIs / webhooks; currently
  // null for sample data, but the field is plumbed through DisplayStore
  // and the card so the future wire-up is just a data-source change.
  officialUrl?: string | null
}

export const STORES: Store[] = [
  {
    id: 'rosary',
    name: 'روزاري',
    category: 'flowers',
    country: 'SA',
    city: 'الرياض',
    district: 'العليا',
    rating: 4.9,
    tags: ['fast', 'same_day', 'nearby'],
    blurb: 'باقات ورد جوري طازجة، تنسيق راقٍ.',
    products: [
      { id: 'p1', name: 'باقة جوري بلدي', price: '٢٢٠ ر.س' },
      { id: 'p2', name: 'صندوق جوري كبير', price: '٤٥٠ ر.س' },
      { id: 'p3', name: 'باقة بيوني وردي', price: '٣٢٠ ر.س' },
    ],
  },
  {
    id: 'cocoa',
    name: 'كوكوا هاوس',
    category: 'chocolate',
    country: 'SA',
    city: 'الرياض',
    district: 'الملقا',
    rating: 4.8,
    tags: ['fast', 'nearby'],
    blurb: 'شوكولاتة بلجيكية محشوّة بالنكهات الموسمية.',
    products: [
      { id: 'p1', name: 'علبة بلجيكية ١٢ قطعة', price: '١٧٥ ر.س' },
      { id: 'p2', name: 'علبة فاخرة ٢٤ قطعة', price: '٣٢٠ ر.س' },
    ],
  },
  {
    id: 'patisserie',
    name: 'باتسري نوارا',
    category: 'cake',
    country: 'SA',
    city: 'جدة',
    district: 'الزهراء',
    rating: 4.7,
    tags: ['same_day'],
    blurb: 'كيك فرنسي بمكوّنات محلية.',
    products: [
      { id: 'p1', name: 'كيك بستاشيو', price: '٢٨٠ ر.س' },
      { id: 'p2', name: 'تشيز كيك بالتوت', price: '٢٤٠ ر.س' },
    ],
  },
  {
    id: 'maison',
    name: 'ميسون عطر',
    category: 'perfume',
    country: 'SA',
    city: 'الرياض',
    district: 'حطين',
    rating: 4.9,
    tags: ['fast', 'nearby'],
    blurb: 'عطور مميّزة بإلهام عربي.',
    products: [
      { id: 'p1', name: 'عطر الرحلة', price: '٦٢٠ ر.س' },
      { id: 'p2', name: 'عطر مساء', price: '٧٤٠ ر.س' },
    ],
  },
  {
    id: 'gifted',
    name: 'هدايا مختارة',
    category: 'gifts',
    country: 'SA',
    city: 'الدمام',
    district: 'الشاطئ',
    rating: 4.6,
    tags: ['same_day'],
    blurb: 'صناديق هدايا منسّقة لكل مناسبة.',
    products: [
      { id: 'p1', name: 'صندوق صباح', price: '١٩٠ ر.س' },
      { id: 'p2', name: 'صندوق الهدوء', price: '٢٤٥ ر.س' },
    ],
  },
  {
    id: 'rosa-jeddah',
    name: 'روزا جدة',
    category: 'flowers',
    country: 'SA',
    city: 'جدة',
    district: 'الروضة',
    rating: 4.7,
    tags: ['nearby'],
    blurb: 'تنسيقات ورد ربيعيّة بأنامل محترفة.',
    products: [
      { id: 'p1', name: 'باقة الربيع', price: '٢٦٠ ر.س' },
      { id: 'p2', name: 'صندوق توليب', price: '٣٢٠ ر.س' },
    ],
  },
]

// Country-aware location schema for the /stores filter.
// Each country defines its own administrative tier labels and option trees.
export type CountryLocationSchema = {
  code: string
  name: string
  // Translation keys for the three sub-country tiers (parent → child → grandchild).
  tier1LabelKey: string
  tier2LabelKey: string
  tier3LabelKey: string
  // Tier 1 options (always present once a country is selected).
  tier1: string[]
  // Tier 2 options keyed by selected tier-1 value.
  tier2: Record<string, string[]>
  // Tier 3 options keyed by selected tier-2 value.
  tier3: Record<string, string[]>
}

export const COUNTRIES_LIST: { code: string; name: string }[] = [
  { code: 'SA', name: 'السعودية' },
  { code: 'KW', name: 'الكويت' },
  { code: 'AE', name: 'الإمارات' },
  { code: 'QA', name: 'قطر' },
  { code: 'BH', name: 'البحرين' },
  { code: 'OM', name: 'عُمان' },
]

// Country-specific location schemas for the stores discovery filter.
//
// Source of truth for tier LABELS is the registration address schema in
// lib/addresses.ts — we mirror its tier semantics so a Saudi user
// browsing stores sees the same words ("المنطقة / المدينة / الحي") they
// saw when they entered their address. Labels were previously drifting
// (AE tier3 said "region" while the address form said "area"; OM had
// "wilayat" before "city" while the address form had it after; etc.) —
// the mismatch made the stores filter feel disconnected from the rest
// of the app's address vocabulary.
//
// Tier DATA (the actual region/city/district names per country) stays
// here because the registration schema is field metadata, not place
// data — the address form lets users type free-form text, while the
// stores filter is a constrained dropdown over a known set of areas
// per market. Future: lift this into a backend-served catalog when
// we have a real merchant onboarding pipeline.
export const COUNTRY_LOCATIONS: Record<string, CountryLocationSchema> = {
  // Saudi Arabia — Region → City → District
  // (matches addresses.ts: region / city / district)
  SA: {
    code: 'SA',
    name: 'السعودية',
    tier1LabelKey: 'addr.region',
    tier2LabelKey: 'addr.city',
    tier3LabelKey: 'addr.district',
    tier1: ['الوسطى', 'الغربية', 'الشرقية'],
    tier2: {
      'الوسطى': ['الرياض'],
      'الغربية': ['جدة', 'مكة', 'المدينة'],
      'الشرقية': ['الدمام', 'الخبر'],
    },
    tier3: {
      'الرياض': ['العليا', 'الملقا', 'حطين', 'الياسمين'],
      'جدة': ['الزهراء', 'الروضة', 'الشاطئ'],
      'مكة': ['العزيزية', 'الزاهر', 'الششة'],
      'المدينة': ['قباء', 'العقيق'],
      'الدمام': ['الشاطئ', 'الفيصلية'],
      'الخبر': ['العليا', 'الراكة'],
    },
  },
  // Kuwait — Governorate → Area → Block
  KW: {
    code: 'KW',
    name: 'الكويت',
    tier1LabelKey: 'addr.governorate',
    tier2LabelKey: 'addr.area',
    tier3LabelKey: 'addr.block',
    tier1: ['العاصمة', 'حولي', 'الفروانية', 'الأحمدي'],
    tier2: {
      'العاصمة': ['الكويت', 'دسمان', 'الشرق'],
      'حولي': ['حولي', 'السالمية', 'الجابرية'],
      'الفروانية': ['الفروانية', 'العمرية'],
      'الأحمدي': ['الفحيحيل', 'المنقف'],
    },
    tier3: {
      'الكويت': ['قطعة 1', 'قطعة 2', 'قطعة 3'],
      'دسمان': ['قطعة 1', 'قطعة 2'],
      'الشرق': ['قطعة 1', 'قطعة 2'],
      'حولي': ['قطعة 1', 'قطعة 2', 'قطعة 3', 'قطعة 4'],
      'السالمية': ['قطعة 1', 'قطعة 2', 'قطعة 3'],
      'الجابرية': ['قطعة 1', 'قطعة 2'],
      'الفروانية': ['قطعة 1', 'قطعة 2'],
      'العمرية': ['قطعة 1', 'قطعة 2'],
      'الفحيحيل': ['قطعة 1', 'قطعة 2'],
      'المنقف': ['قطعة 1', 'قطعة 2'],
    },
  },
  // UAE — Emirate → City → Area (neighbourhood)
  // (matches addresses.ts: emirate / city / area — was previously
  // labelled tier3=region, which collided semantically with the
  // tier2 emirate-level concept and didn't match the address form.)
  AE: {
    code: 'AE',
    name: 'الإمارات',
    tier1LabelKey: 'addr.emirate',
    tier2LabelKey: 'addr.city',
    tier3LabelKey: 'addr.area',
    tier1: ['أبوظبي', 'دبي', 'الشارقة', 'عجمان'],
    tier2: {
      'أبوظبي': ['أبوظبي', 'العين'],
      'دبي': ['دبي'],
      'الشارقة': ['الشارقة'],
      'عجمان': ['عجمان'],
    },
    tier3: {
      'أبوظبي': ['الكورنيش', 'المرور', 'الحصن'],
      'العين': ['الجيمي', 'هيلي'],
      'دبي': ['داون تاون', 'الخليج التجاري', 'الجميرا'],
      'الشارقة': ['المجاز', 'القصباء'],
      'عجمان': ['الجرف', 'الراشدية'],
    },
  },
  // Qatar — Municipality → Area → Street
  // The address form has only city/area for QA; the stores filter
  // keeps three tiers because store discovery wants finer-grained
  // browsing than user address entry. Tier 1 is "Municipality"
  // (semantically the SA "Region" equivalent for Qatar's
  // administrative geography), tier 2 aligned to the address form's
  // "Area" label, tier 3 stays "Street" since QA addresses are
  // street-named.
  QA: {
    code: 'QA',
    name: 'قطر',
    tier1LabelKey: 'addr.municipality',
    tier2LabelKey: 'addr.area',
    tier3LabelKey: 'addr.street',
    tier1: ['الدوحة', 'الريان', 'الوكرة', 'الخور'],
    tier2: {
      'الدوحة': ['الكورنيش', 'مشيرب', 'الدفنة'],
      'الريان': ['الريان القديم', 'الريان الجديد'],
      'الوكرة': ['الوكرة', 'الوكير'],
      'الخور': ['الخور', 'الذخيرة'],
    },
    tier3: {
      'الكورنيش': ['شارع الكورنيش', 'شارع الديوان'],
      'مشيرب': ['شارع مسحب', 'شارع جسرة'],
      'الدفنة': ['شارع لوسيل', 'شارع الميناء'],
      'الريان القديم': ['شارع الريان', 'شارع الجامعة'],
      'الريان الجديد': ['شارع الفروسية', 'شارع التحلية'],
      'الوكرة': ['شارع الوكرة', 'شارع البحر'],
      'الوكير': ['شارع الوكير'],
      'الخور': ['شارع الخور', 'شارع الميناء'],
      'الذخيرة': ['شارع الذخيرة'],
    },
  },
  // Bahrain — Governorate → City → Block
  // (the address form has city/block for BH; the stores filter adds
  // governorate as the top tier for finer-grained discovery, then
  // mirrors the address form's city + block labels so the
  // numeric-block addressing convention reads consistently
  // everywhere.)
  BH: {
    code: 'BH',
    name: 'البحرين',
    tier1LabelKey: 'addr.governorate',
    tier2LabelKey: 'addr.city',
    tier3LabelKey: 'addr.block',
    tier1: ['العاصمة', 'الشمالية', 'الجنوبية', 'المحرق'],
    tier2: {
      'العاصمة': ['المنامة', 'الجفير'],
      'الشمالية': ['البديع', 'الجنبية'],
      'الجنوبية': ['الرفاع', 'الزلاق'],
      'المحرق': ['المحرق', 'الحد'],
    },
    tier3: {
      'المنامة': ['316', '317', '318'],
      'الجفير': ['316', '317'],
      'البديع': ['551', '552'],
      'الجنبية': ['571'],
      'الرفاع': ['903', '904'],
      'الزلاق': ['1054'],
      'المحرق': ['203', '204'],
      'الحد': ['107'],
    },
  },
  // Oman — Governorate → City → Wilayat
  // (matches addresses.ts: governorate / city / wilayat — was
  // previously labelled tier2=wilayat / tier3=region, which both
  // ordered the wilayat above its containing city AND used "region"
  // for what's actually a wilayat-level subdivision. The data
  // hierarchy here is governorate → wilayat-as-city → sub-area
  // matching what the address form labels city → wilayat.)
  OM: {
    code: 'OM',
    name: 'عُمان',
    tier1LabelKey: 'addr.governorate',
    tier2LabelKey: 'addr.city',
    tier3LabelKey: 'addr.wilayat',
    tier1: ['مسقط', 'ظفار', 'الباطنة شمال', 'الباطنة جنوب'],
    tier2: {
      'مسقط': ['مسقط', 'مطرح', 'بوشر', 'السيب'],
      'ظفار': ['صلالة', 'طاقة'],
      'الباطنة شمال': ['صحار', 'صحم'],
      'الباطنة جنوب': ['الرستاق', 'بركاء'],
    },
    tier3: {
      'مسقط': ['روي', 'الخوض'],
      'مطرح': ['مطرح', 'الفلج'],
      'بوشر': ['بوشر', 'غلا'],
      'السيب': ['السيب', 'المعبيلة'],
      'صلالة': ['الحصن', 'الدهاريز'],
      'طاقة': ['طاقة', 'مرباط'],
      'صحار': ['صحار', 'لوى'],
      'صحم': ['صحم'],
      'الرستاق': ['الرستاق', 'وادي بني خروص'],
      'بركاء': ['بركاء', 'المصنعة'],
    },
  },
}

export const LOCATIONS = {
  countries: [
    { code: 'SA', name: 'السعودية' },
    { code: 'AE', name: 'الإمارات' },
    { code: 'KW', name: 'الكويت' },
  ],
  regions: {
    SA: ['الوسطى', 'الغربية', 'الشرقية'],
    AE: ['أبوظبي', 'دبي', 'الشارقة'],
    KW: ['العاصمة', 'حولي', 'الفروانية'],
  } as Record<string, string[]>,
  cities: {
    'الوسطى': ['الرياض'],
    'الغربية': ['جدة', 'مكة', 'المدينة'],
    'الشرقية': ['الدمام', 'الخبر'],
    'دبي': ['دبي'],
    'أبوظبي': ['أبوظبي'],
    'الشارقة': ['الشارقة'],
    'العاصمة': ['الكويت'],
    'حولي': ['حولي'],
    'الفروانية': ['الفروانية'],
  } as Record<string, string[]>,
  districts: {
    'الرياض': ['العليا', 'الملقا', 'حطين', 'الياسمين'],
    'جدة': ['الزهراء', 'الروضة', 'الشاطئ'],
    'مكة': ['العزيزية', 'الزاهر', 'الششة'],
    'المدينة': ['قباء', 'العقيق'],
    'الدمام': ['الشاطئ', 'الفيصلية'],
    'الخبر': ['العليا', 'الراكة'],
    'دبي': ['داون تاون', 'الخليج التجاري', 'الجميرا'],
    'أبوظبي': ['الكورنيش', 'المرور', 'الحصن'],
    'الشارقة': ['المجاز', 'القصباء'],
    'الكويت': ['الشرق', 'القبلة', 'دسمان'],
    'حولي': ['حولي', 'الصالحية'],
    'الفروانية': ['الفروانية', 'العمرية'],
  } as Record<string, string[]>,
}

export type ProfileData = {
  name: string
  username: string
  bio: string
  email: string
  phone: string
  followers: number
  following: number
  giftsSent: number
  giftsReceived: number
  privacy: 'public' | 'followers' | 'private'
  notifications: boolean
}

export const PROFILE: ProfileData = {
  name: 'نورة العبدالله',
  username: 'noura',
  bio: 'محبّة للورد والعطور · تشاركك أمنياتها هنا.',
  email: 'noura@example.com',
  phone: '+966 5x xxx xxxx',
  // ── TEMPORARY (private testing) ─────────────────────────────────────
  // All numeric stats zeroed for the testing build so we never show
  // fake counts to private testers. When real backend counts are wired
  // into /profile (followers / following / gifts / wishes endpoints),
  // the page should override these with the live values; until then
  // the UI renders 0, which is the correct default for a fresh user.
  // Restore the demo numbers (or remove this mock entirely) when going
  // to a public marketing build.
  followers: 0,
  following: 0,
  giftsSent: 0,
  giftsReceived: 0,
  // ────────────────────────────────────────────────────────────────────
  privacy: 'followers',
  notifications: true,
}

// Social graph (mock — frontend-only). The display counts on PROFILE
// (followers / following) stay the canonical numbers shown on the stat
// tiles; the arrays below are a sampled subset rendered in the followers /
// following modal. When a real backend ships, swap the imports of USERS /
// FOLLOWERS / FOLLOWING (and the helpers below) with paginated fetches.
//
// Per-user privacy is modelled as boolean flags on each SampleUser. When
// the real backend lands, the server should enforce these and only return
// the visible fields; the client check then becomes "is the field present
// in the response?" rather than "is showX true?".
export type SampleUser = {
  id: string
  fullName: string
  qiftUsername: string
  // Two CSS color stops for the avatar gradient. Same convention used
  // elsewhere (MediaTile.from), so a single helper renders both.
  gradient: string
  bio?: string
  profileVisibility: 'public' | 'private'
  showGiftsReceived: boolean
  showGiftsSent: boolean
  showFollowers: boolean
  showFollowing: boolean
}

// Sensible defaults — most users are fully public. A handful below override
// fields to demonstrate every privacy state.
const PUB = {
  profileVisibility: 'public',
  showGiftsReceived: true,
  showGiftsSent: true,
  showFollowers: true,
  showFollowing: true,
} as const

export const USERS: SampleUser[] = [
  { id: 'u01', fullName: 'سارة المطيري',     qiftUsername: 'sara.m',      gradient: '#7B5CF5,#F472B6', bio: 'محبّة للورد الجوري والقهوة المختصة.', ...PUB },
  // Private profile — used to demo the limited public view.
  { id: 'u02', fullName: 'عبدالله القحطاني', qiftUsername: 'abdullah.q',  gradient: '#6366F1,#22D3EE', ...PUB, profileVisibility: 'private' },
  { id: 'u03', fullName: 'لمى السبيعي',     qiftUsername: 'lamaa',       gradient: '#F472B6,#FBBF24', bio: 'تصوير، طبخ، ورحلات قصيرة.', ...PUB },
  { id: 'u04', fullName: 'فهد الدوسري',     qiftUsername: 'fahd.d',      gradient: '#9478FF,#34D399', ...PUB },
  // Hides followers list — demos a single locked stat.
  { id: 'u05', fullName: 'نوف الزهراني',    qiftUsername: 'nouf.z',      gradient: '#F8A5D0,#C89BFF', bio: 'رسامة وتشاركك ألوانها.', ...PUB, showFollowers: false },
  { id: 'u06', fullName: 'يوسف العتيبي',    qiftUsername: 'youssef.o',   gradient: '#60A5FA,#A78BFA', ...PUB },
  // Hides following list.
  { id: 'u07', fullName: 'ريم الشهري',      qiftUsername: 'reem.s',      gradient: '#F472B6,#7B5CF5', bio: 'كتب، نباتات، وفناجين قهوة.', ...PUB, showFollowing: false },
  { id: 'u08', fullName: 'محمد الغامدي',    qiftUsername: 'm.alghamdi',  gradient: '#22D3EE,#6366F1', ...PUB },
  { id: 'u09', fullName: 'دانة الحربي',     qiftUsername: 'danah',       gradient: '#FBBF24,#F472B6', bio: 'تجاربها مع العطور.', ...PUB },
  { id: 'u10', fullName: 'خالد المالكي',    qiftUsername: 'khalid.k',    gradient: '#34D399,#60A5FA', ...PUB },
  // Private profile — second example.
  { id: 'u11', fullName: 'هند الفايز',      qiftUsername: 'hind.f',      gradient: '#C89BFF,#F8A5D0', ...PUB, profileVisibility: 'private' },
  { id: 'u12', fullName: 'تركي العنزي',     qiftUsername: 'turki.a',     gradient: '#7B5CF5,#22D3EE', ...PUB },
  { id: 'u13', fullName: 'منى السلمي',      qiftUsername: 'mona.s',      gradient: '#F472B6,#9478FF', bio: 'جدة · حياكة، حلويات، وقهوة برد.', ...PUB },
  // Hides received-gifts section.
  { id: 'u14', fullName: 'عمر الشمري',      qiftUsername: 'omar.sh',     gradient: '#A78BFA,#34D399', ...PUB, showGiftsReceived: false },
  { id: 'u15', fullName: 'جوري الخالدي',    qiftUsername: 'jouri',       gradient: '#FBBF24,#7B5CF5', bio: 'أحب الورود والشموع.', ...PUB },
  { id: 'u16', fullName: 'بدر الزهراني',    qiftUsername: 'badr.z',      gradient: '#60A5FA,#F472B6', ...PUB },
  { id: 'u17', fullName: 'أسماء الحارثي',   qiftUsername: 'asma.h',      gradient: '#9478FF,#FBBF24', bio: 'تشكيلات الحرف اليدوية.', ...PUB },
  { id: 'u18', fullName: 'سلمان البقمي',    qiftUsername: 'salman.b',    gradient: '#22D3EE,#F8A5D0', ...PUB },
  { id: 'u19', fullName: 'لارا الراشد',     qiftUsername: 'lara.r',      gradient: '#F8A5D0,#7B5CF5', bio: 'مصممة جرافيك · تشاركك الألوان.', ...PUB },
  // Hides sent-gifts count.
  { id: 'u20', fullName: 'فيصل العمري',     qiftUsername: 'faisal.o',    gradient: '#34D399,#A78BFA', ...PUB, showGiftsSent: false },
  { id: 'u21', fullName: 'رهف الجهني',      qiftUsername: 'rahaf.j',     gradient: '#F472B6,#60A5FA', bio: 'موسيقى، رحلات، وضحك صديقات.', ...PUB },
  { id: 'u22', fullName: 'ناصر الخميس',     qiftUsername: 'naser.k',     gradient: '#6366F1,#FBBF24', ...PUB },
  { id: 'u23', fullName: 'أمل العبدالله',   qiftUsername: 'amal.a',      gradient: '#C89BFF,#34D399', bio: 'صيدلية صغيرة في حقيبتها.', ...PUB },
  { id: 'u24', fullName: 'سعد الفهيد',      qiftUsername: 'saad.f',      gradient: '#7B5CF5,#F8A5D0', ...PUB },
]

// Subset of USERS that follow the viewer.
export const FOLLOWERS: string[] = [
  'u01', 'u03', 'u04', 'u06', 'u07', 'u09', 'u11', 'u13', 'u14',
  'u15', 'u17', 'u19', 'u21', 'u23',
]

// Subset of USERS the viewer follows.
export const FOLLOWING: string[] = [
  'u02', 'u04', 'u05', 'u08', 'u10', 'u12', 'u16', 'u18', 'u20', 'u22',
]

// Stable hash so per-user mock data is deterministic across reloads.
function hashUserId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function rotateSubset<T>(arr: T[], offset: number, size: number): T[] {
  if (arr.length === 0 || size === 0) return []
  const out: T[] = []
  for (let i = 0; i < Math.min(size, arr.length); i++) {
    out.push(arr[(offset + i) % arr.length])
  }
  return out
}

// Look up a user by their @qiftUsername (case-insensitive). Returns
// undefined when nothing matches; callers route to notFound() in that case.
export function getUserByUsername(username: string): SampleUser | undefined {
  const needle = username.trim().toLowerCase()
  return USERS.find((u) => u.qiftUsername.toLowerCase() === needle)
}

// Per-user stats. Deterministic by id so the same numbers show on every
// reload. Counts feel realistic but are not connected to the FOLLOWERS /
// FOLLOWING / PROFILE_GIFTS / WISHES arrays — we'd reconcile when the
// backend lands.
export function getUserStats(userId: string): {
  followers: number
  following: number
  giftsSent: number
  giftsReceived: number
} {
  const seed = hashUserId(userId)
  return {
    followers: 50 + (seed % 950),
    following: 20 + ((seed >> 3) % 480),
    giftsSent: (seed >> 5) % 80,
    giftsReceived: (seed >> 7) % 60,
  }
}

// Per-user follower / following lists. Excludes the user themselves.
export function getFollowersOf(userId: string): SampleUser[] {
  const others = USERS.filter((u) => u.id !== userId)
  if (others.length === 0) return []
  const seed = hashUserId(userId)
  const size = 6 + (seed % 8) // 6–13 entries
  return rotateSubset(others, seed % others.length, size)
}

export function getFollowingOf(userId: string): SampleUser[] {
  const others = USERS.filter((u) => u.id !== userId)
  if (others.length === 0) return []
  const seed = (hashUserId(userId) >> 4) ^ 0x9e3779b1
  const size = 4 + (seed % 8) // 4–11 entries
  return rotateSubset(others, seed % others.length, size)
}

// Per-user content slices. These sample existing arrays so the UI looks
// realistic without bloating the mock data set. Each helper returns 0–N
// items, deterministically.
export function getUserPosts(userId: string): MediaTile[] {
  const seed = hashUserId(userId) >> 2
  const size = seed % 7 // 0–6 items
  return rotateSubset(MEDIA, seed % Math.max(MEDIA.length, 1), size)
}

export function getUserPublicGifts(userId: string): ProfileGift[] {
  const seed = hashUserId(userId) >> 6
  const size = seed % 4 // 0–3 items
  return rotateSubset(PROFILE_GIFTS, seed % Math.max(PROFILE_GIFTS.length, 1), size)
}

export function getUserWishes(userId: string): Wish[] {
  const seed = hashUserId(userId) >> 8
  const size = seed % 4 // 0–3 items
  return rotateSubset(WISHES, seed % Math.max(WISHES.length, 1), size)
}

export type Wish = {
  id: string
  title: string
  store?: string
  visibility: 'public' | 'private'
}

export const WISHES: Wish[] = [
  { id: 'w1', title: 'عطر الرحلة', store: 'ميسون عطر', visibility: 'public' },
  { id: 'w2', title: 'باقة بيوني وردي', store: 'روزاري', visibility: 'public' },
  { id: 'w3', title: 'كتاب: الرحلة', visibility: 'private' },
]

export type Address = {
  id: string
  label: string
  country: string
  details: Record<string, string>
  isDefault: boolean
}

export const ADDRESSES: Address[] = [
  {
    id: 'a1',
    label: 'المنزل',
    country: 'SA',
    details: {
      city: 'الرياض',
      district: 'العليا',
      street: 'طريق الملك فهد',
      buildingNumber: '٣١٢',
      postalCode: '12333',
    },
    isDefault: true,
  },
  {
    id: 'a2',
    label: 'العمل',
    country: 'SA',
    details: {
      city: 'الرياض',
      district: 'الملقا',
      street: 'طريق العروبة',
      buildingNumber: '٢٠',
      postalCode: '13524',
    },
    isDefault: false,
  },
]

export type Sizes = {
  clothes: string
  shoes: string
  ring: string
  preferences: string
}

export const SIZES: Sizes = {
  clothes: 'M',
  shoes: '38',
  ring: '14',
  preferences: 'تحب الألوان الهادئة، روائح الورد، وتفضل التغليف الكلاسيكي.',
}

export type ActivityItem = {
  id: string
  who: string
  username: string
  type: 'sent' | 'received' | 'wished'
  what: string
  whom?: string
  date: string
}

export const ACTIVITY: ActivityItem[] = [
  { id: 'e1', who: 'سارة المطيري', username: 'sarah', type: 'sent', what: 'باقة جوري', whom: '@noura', date: 'قبل ساعة' },
  { id: 'e2', who: 'فهد الدوسري', username: 'fahad', type: 'wished', what: 'عطر الرحلة', date: 'قبل ٣ ساعات' },
  { id: 'e3', who: 'هدى العتيبي', username: 'huda', type: 'received', what: 'صندوق شوكولاتة', whom: '@huda', date: 'اليوم' },
  { id: 'e4', who: 'ريم الحربي', username: 'reem', type: 'sent', what: 'كيك بستاشيو', whom: '@layla', date: 'أمس' },
]

export type SearchResult = {
  username: string
  name: string
  matchedField: 'qift' | 'snapchat' | 'tiktok' | 'instagram' | 'phone' | 'email'
  matchedValue: string
}

export type MediaTile = {
  id: string
  kind: 'post' | 'photo' | 'video'
  caption?: string
  from: string // gradient stops, e.g. '#7B5CF5,#F472B6'
}

export const MEDIA: MediaTile[] = [
  { id: 'm1', kind: 'post', caption: 'ورود الصباح', from: '#FBCFE8,#7B5CF5' },
  { id: 'm2', kind: 'photo', caption: 'مسائي', from: '#C084FC,#F472B6' },
  { id: 'm3', kind: 'video', caption: 'لحظة إهداء', from: '#7B5CF5,#C084FC' },
  { id: 'm4', kind: 'post', caption: 'قهوتي', from: '#FFD6B5,#7B5CF5' },
  { id: 'm5', kind: 'photo', caption: 'في الحديقة', from: '#9AE6B4,#7B5CF5' },
  { id: 'm6', kind: 'photo', caption: 'أنوار', from: '#F472B6,#FDE68A' },
  { id: 'm7', kind: 'video', caption: 'أحلى لحظة', from: '#A78BFA,#F472B6' },
  { id: 'm8', kind: 'post', caption: 'تشاركها', from: '#FBCFE8,#C084FC' },
  { id: 'm9', kind: 'photo', caption: 'خيوط', from: '#C7D2FE,#F472B6' },
]

export function getProduct(storeId: string, productId: string) {
  const store = STORES.find((s) => s.id === storeId)
  if (!store) return null
  const product = store.products.find((p) => p.id === productId)
  if (!product) return null
  // The product can override its category; otherwise it inherits from the
  // store. We compute `isFastDelivery` here so callers don't have to know
  // the category list.
  const category = product.category ?? store.category
  const isFastDelivery = isFastDeliveryCategory(category)
  return { store, product, category, isFastDelivery }
}

// Gift status pipeline (Gift v3 — final tracking flow):
//   pending_address      – waiting on the receiver
//   address_confirmed    – receiver picked an address
//   default_address_used – 24h elapsed; we used their default
//   preparing            – store accepted the order
//   shipped              – courier handed off
//   delivered            – arrived
export type GiftStatus =
  | 'pending_address'
  | 'address_confirmed'
  | 'default_address_used'
  | 'preparing'
  | 'shipped'
  | 'delivered'
  // Terminal: sender cancelled the gift (or admin) before the store
  // accepted it. The UI renders this as a red "Cancelled" badge and
  // suppresses the receiver-side "Confirm address" CTA.
  | 'cancelled'

export type GiftHubItem = {
  id: string
  direction: 'received' | 'sent'
  status: GiftStatus
  product: { name: string; price: string; gradient: string }
  store: string
  other: { name: string; username: string }
  message?: string
  date: string
  isAnonymous?: boolean
  // Sender flagged the gift as a surprise. The receiver's view masks
  // product + store until delivery; sender's view always shows them.
  isSurprise?: boolean
  // Positive flag from the backend (`applySurpriseReveal`). `false` ⇒
  // the receiver shouldn't see product/store yet; `true` (or absent on
  // a stale response) ⇒ render normally.
  productVisible?: boolean
  // Positive flag from the backend (`applyMessageReveal`). `false` ⇒
  // backend stripped messageText / mediaUrl / mediaType because the
  // viewer is the receiver and the gift hasn't been delivered yet;
  // the card renders the locked placeholder. `true` (or absent on a
  // stale response) ⇒ render the real message text.
  messageVisible?: boolean
  hasAddress?: boolean
}

export const GIFTS_HUB: GiftHubItem[] = [
  {
    id: 'h1',
    direction: 'received',
    status: 'pending_address',
    product: { name: 'باقة جوري بلدي', price: '٢٢٠ ر.س', gradient: '#F472B6,#7B5CF5' },
    store: 'روزاري',
    other: { name: 'سارة المطيري', username: 'sarah' },
    message: 'كل عام وأنتِ بخير',
    date: 'قبل ساعة',
  },
  {
    id: 'h2',
    direction: 'received',
    status: 'address_confirmed',
    product: { name: 'صندوق شوكولاتة', price: '١٧٥ ر.س', gradient: '#FFD6B5,#7B5CF5' },
    store: 'كوكوا هاوس',
    other: { name: 'هدى العتيبي', username: 'huda' },
    date: 'أمس',
    hasAddress: true,
  },
  {
    id: 'h3',
    direction: 'sent',
    status: 'delivered',
    product: { name: 'كيك بستاشيو', price: '٢٨٠ ر.س', gradient: '#7B5CF5,#C084FC' },
    store: 'باتسري نوارا',
    other: { name: 'ليلى الزهراني', username: 'layla' },
    message: 'مبارك التخرّج',
    date: 'قبل ٣ أيام',
  },
  {
    id: 'h4',
    direction: 'sent',
    status: 'pending_address',
    product: { name: 'عطر الرحلة', price: '٦٢٠ ر.س', gradient: '#A78BFA,#F472B6' },
    store: 'ميسون عطر',
    other: { name: 'ريم الحربي', username: 'reem' },
    date: 'اليوم',
  },
  {
    id: 'h5',
    direction: 'received',
    status: 'address_confirmed',
    product: { name: 'صندوق صباح', price: '١٩٠ ر.س', gradient: '#9AE6B4,#7B5CF5' },
    store: 'هدايا مختارة',
    other: { name: 'عمر الشهري', username: 'omar' },
    date: '٢٠٢٦/٠٤/١٢',
    hasAddress: true,
  },
]

export type ExploreItem = {
  id: string
  kind: 'photo' | 'video'
  username: string
  name: string
  caption: string
  gradient: string
}

export const EXPLORE_FEED: ExploreItem[] = [
  { id: 'e1', kind: 'photo', username: 'sarah', name: 'سارة المطيري', caption: 'باقة الصباح', gradient: '#FBCFE8,#7B5CF5' },
  { id: 'e2', kind: 'video', username: 'huda', name: 'هدى العتيبي', caption: 'لحظة استلام', gradient: '#7B5CF5,#C084FC' },
  { id: 'e3', kind: 'photo', username: 'reem', name: 'ريم الحربي', caption: 'كيك العيد', gradient: '#FFD6B5,#7B5CF5' },
  { id: 'e4', kind: 'photo', username: 'fahad', name: 'فهد الدوسري', caption: 'تغليف أنيق', gradient: '#A78BFA,#F472B6' },
  { id: 'e5', kind: 'video', username: 'layla', name: 'ليلى الزهراني', caption: 'مفاجأة', gradient: '#9AE6B4,#7B5CF5' },
  { id: 'e6', kind: 'photo', username: 'omar', name: 'عمر الشهري', caption: 'مساء الخير', gradient: '#C084FC,#F472B6' },
  { id: 'e7', kind: 'photo', username: 'sarah', name: 'سارة المطيري', caption: 'نقاء الورد', gradient: '#F472B6,#FDE68A' },
  { id: 'e8', kind: 'video', username: 'huda', name: 'هدى العتيبي', caption: 'تشاركها', gradient: '#FBCFE8,#C084FC' },
  { id: 'e9', kind: 'photo', username: 'reem', name: 'ريم الحربي', caption: 'في الحديقة', gradient: '#C7D2FE,#F472B6' },
]

export type ProfileGift = {
  id: string
  direction: 'sent' | 'received'
  other: string // username
  title: string
  date: string
  from: string
}

export const PROFILE_GIFTS: ProfileGift[] = [
  { id: 'pg1', direction: 'received', other: 'sarah', title: 'باقة جوري', date: '٢٠٢٦/٠٤/٢٠', from: '#F472B6,#7B5CF5' },
  { id: 'pg2', direction: 'sent', other: 'layla', title: 'كيك بستاشيو', date: '٢٠٢٦/٠٤/١٥', from: '#7B5CF5,#C084FC' },
  { id: 'pg3', direction: 'received', other: 'huda', title: 'بطاقة هدية', date: '٢٠٢٦/٠٤/١٢', from: '#FFD6B5,#7B5CF5' },
  { id: 'pg4', direction: 'sent', other: 'reem', title: 'عطر الرحلة', date: '٢٠٢٦/٠٤/٠٨', from: '#A78BFA,#F472B6' },
]

export const SEARCH_INDEX: SearchResult[] = [
  { username: 'sarah', name: 'سارة المطيري', matchedField: 'qift', matchedValue: 'sarah' },
  { username: 'fahad', name: 'فهد الدوسري', matchedField: 'snapchat', matchedValue: 'fahad.snap' },
  { username: 'reem', name: 'ريم الحربي', matchedField: 'instagram', matchedValue: 'reem.h' },
  { username: 'huda', name: 'هدى العتيبي', matchedField: 'tiktok', matchedValue: 'huda.t' },
  { username: 'layla', name: 'ليلى الزهراني', matchedField: 'phone', matchedValue: '0500000000' },
  { username: 'omar', name: 'عمر الشهري', matchedField: 'email', matchedValue: 'omar@example.com' },
]
