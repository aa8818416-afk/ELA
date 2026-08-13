/**
 * Spray & Fertilizer Dosage Units
 * -------------------------------
 * Standardized units for field treatments in field_treatments table.
 * If the farmer uses a non-standard custom term (e.g., فنجان، كوباية),
 * it falls back to storing the raw string.
 */

export type StandardSprayUnit =
  // --- وحدات حجم ووزن قياسية (Standard Metrics) ---
  | 'liter'        // لتر (L)
  | 'ml'           // مل / سم3 (mL / cm³)
  | 'gram'         // جرام (g)
  | 'kilogram'     // كيلو (kg)
  | 'ton'          // طن (Ton)

  // --- وحدات معايرة ميدانية (Field Dose Estimators) ---
  | 'cap'          // غطاء العبوة (Bottle Cap)
  | 'spoon'        // ملعقة / معلقة (Spoon)

  // --- عبوات تجارية (Commercial Packages) ---
  | 'bottle'       // زجاجة / إزازة (Bottle)
  | 'can'          // علبة / صفيحة (Can/Tin)
  | 'sachet'       // باكو / ظرف (Packet/Sachet)
  | 'bag'          // كيس (Bag)
  | 'sack'         // شكارة (Sack)
  | 'ampoule'      // أمبول / أمبولة (Ampoule)
  | 'jerrycan'     // جركن (Jerrycan)
  | 'barrel'       // برميل (Barrel)
  | 'tank'         // تانك / خزان (Tank)
  | 'carton';      // كرتونة (Carton)

export type SprayUnit = StandardSprayUnit | (string & {});

/**
 * Map of standard spray units to user-friendly Arabic labels
 */
export const SPRAY_UNIT_LABELS: Record<string, string> = {
  liter: 'لتر',
  ml: 'مل / سم³',
  gram: 'جرام',
  kilogram: 'كيلو',
  ton: 'طن',
  cap: 'غطاء',
  spoon: 'معلقة',
  bottle: 'زجاجة',
  can: 'علبة',
  sachet: 'ظرف / باكو',
  bag: 'كيس',
  sack: 'شكارة',
  ampoule: 'أمبول',
  jerrycan: 'جركن',
  barrel: 'برميل',
  tank: 'تانك',
  carton: 'كرتونة',
};

/**
 * Format dosage unit for display in UI (returns Arabic label if standard key, or raw string if custom)
 */
export function formatDosageUnit(unit?: string | null): string {
  if (!unit) return '';
  return SPRAY_UNIT_LABELS[unit.toLowerCase()] || unit;
}
