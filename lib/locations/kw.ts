// Kuwait (دولة الكويت)
//
// Hierarchy: Country → Governorate (محافظة) → Area (منطقة) → Block (قطعة).
//
// All six governorates are covered. Every residential area carries
// a realistic block range: most populated areas have blocks 1–10
// or 1–12; smaller / newer suburbs have 1–6; industrial /
// commercial / port / airport areas skip blocks (the field falls
// back to free entry on the form).
//
// Block ranges are based on Kuwait's PACI (Public Authority for
// Civil Information) numbering scheme — the actual maximum block
// number per area can extend further, but the UI surfaces a
// representative window that covers the bulk of addresses. Free-
// text fallback handles the long tail.

import type { CountryLocationConfig } from './types'

const GOVERNORATES = [
  'العاصمة',
  'حولي',
  'الفروانية',
  'الأحمدي',
  'مبارك الكبير',
  'الجهراء',
] as const

const AREAS: Record<string, string[]> = {
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

// Helper: build a block list "قطعة 1" .. "قطعة N". Used so the
// large block tables stay readable.
function blocks(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `قطعة ${i + 1}`)
}

// Per-area block ranges. Keys cover every area listed in AREAS so
// the dropdown is never empty for a populated residential zone.
// Areas that are inherently single-parcel (industrial, airport,
// port, free-zone, military) are intentionally absent and fall
// back to the free-text input via the form's missing-tier path.
const BLOCKS: Record<string, string[]> = {
  // العاصمة
  'مدينة الكويت': blocks(4),
  'الشرق': blocks(8),
  'القبلة': blocks(8),
  'المرقاب': blocks(6),
  'الدسمة': blocks(7),
  'الشامية': blocks(9),
  'الشويخ': blocks(4),
  'كيفان': blocks(11),
  'الفيحاء': blocks(8),
  'الروضة': blocks(5),
  'العديلية': blocks(4),
  'الخالدية': blocks(7),
  'الصوابر': blocks(2),
  'بنيد القار': blocks(2),
  'الدعية': blocks(4),
  'النزهة': blocks(4),
  'القادسية': blocks(11),
  'دسمان': blocks(2),
  'مرشد': blocks(3),
  'ضاحية عبدالله السالم': blocks(5),
  'الصليبيخات': blocks(7),
  'الدوحة': blocks(5),
  'النهضة': blocks(4),
  'الصبية': blocks(2),
  'سعد العبدالله': blocks(8),

  // حولي
  'حولي': blocks(5),
  'السالمية': blocks(12),
  'الجابرية': blocks(12),
  'الرميثية': blocks(12),
  'بيان': blocks(12),
  'مشرف': blocks(6),
  'سلوى': blocks(12),
  'البدع': blocks(3),
  'حطين': blocks(5),
  'الشعب': blocks(8),
  'النقرة': blocks(4),
  'ميدان حولي': blocks(2),

  // الفروانية
  'الفروانية': blocks(7),
  'العمرية': blocks(7),
  'خيطان': blocks(9),
  'العارضية': blocks(13),
  'الرابية': blocks(8),
  'الأندلس': blocks(10),
  'إشبيلية': blocks(6),
  'الرحاب': blocks(6),
  'الفردوس': blocks(7),
  'العمرية الجنوبية': blocks(5),
  'الرقعي': blocks(7),
  'الضجيج': blocks(4),
  'صباح الناصر': blocks(6),
  'عبدالله المبارك': blocks(7),
  'جليب الشيوخ': blocks(5),
  'الري': blocks(4),
  // مطار الكويت skipped — single airport zone, no blocks.

  // الأحمدي
  'الفحيحيل': blocks(8),
  'المنقف': blocks(7),
  'أبو حليفة': blocks(5),
  'الأحمدي': blocks(6),
  'هدية': blocks(5),
  'الرقة': blocks(8),
  'الفنطاس': blocks(7),
  'العقيلة': blocks(7),
  'المهبولة': blocks(4),
  'الصباحية': blocks(6),
  'الظهر': blocks(3),
  'علي صباح السالم': blocks(8),
  'الوفرة': blocks(3),
  'الخيران': blocks(5),
  'مدينة صباح الأحمد': blocks(8),
  // مينا عبدالله / بنيدر — port / refinery, skipped.

  // مبارك الكبير
  'العدان': blocks(8),
  'القرين': blocks(8),
  'القصور': blocks(7),
  'صبحان': blocks(3),
  'صباح السالم': blocks(12),
  'مبارك الكبير': blocks(7),
  'المسيلة': blocks(5),
  'أبو فطيرة': blocks(5),
  'أبو الحصانية': blocks(5),
  'الفنيطيس': blocks(5),

  // الجهراء
  'الجهراء': blocks(5),
  'النعيم': blocks(7),
  'الواحة': blocks(7),
  'القصر': blocks(6),
  'تيماء': blocks(7),
  'الصليبية': blocks(5),
  'العيون': blocks(5),
  'النسيم': blocks(5),
  'الجهراء الجديدة': blocks(6),
  'كبد': blocks(3),
  'أمغرة': blocks(3),
}

export const KW: CountryLocationConfig = {
  code: 'KW',
  name: { ar: 'الكويت', en: 'Kuwait' },
  flag: '🇰🇼',
  tiers: [
    { field: 'governorate', labelKey: 'addr.governorate' },
    { field: 'city', labelKey: 'addr.area' },
    { field: 'district', labelKey: 'addr.block' },
  ],
  data: {
    tier1: [...GOVERNORATES],
    tier2: AREAS,
    tier3: BLOCKS,
  },
}
