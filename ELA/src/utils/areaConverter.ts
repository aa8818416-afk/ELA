/**
 * Utility for converting area units to standard feddans and formatting for UI display
 */

const UNITS = {
  'فدان': 1,
  'قيراط': 1 / 24,       // 1 feddan = 24 kirat
  'متر مربع': 1 / 4200,  // 1 feddan ≈ 4200 sqm
} as const;

export type AreaUnit = keyof typeof UNITS;

/**
 * Converts value in given unit to Feddan (rounded to 3 decimals)
 */
export function toFeddan(value: number, unit: string = 'فدان'): number {
  const normUnit = (unit in UNITS ? unit : 'فدان') as AreaUnit;
  const factor = UNITS[normUnit] || 1;
  return Math.round(value * factor * 1000) / 1000;
}

/**
 * Formats area for display in original user unit
 */
export function displayArea(feddan: number, originalUnit: string = 'فدان'): string {
  const normUnit = (originalUnit in UNITS ? originalUnit : 'فدان') as AreaUnit;
  if (normUnit === 'قيراط') {
    return `${Math.round(feddan * 24)} قيراط`;
  }
  if (normUnit === 'متر مربع') {
    return `${Math.round(feddan * 4200)} متر مربع`;
  }
  return `${feddan} فدان`;
}
