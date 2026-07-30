// ============================================================
// Agricultural Alert Agenda System — Quality Tips Service
// Implements quality tip rotation (§5.6) based on rotation_order
// ============================================================

import type { CropQualityTip } from './types';

/**
 * Select the next quality tip for a field based on stage age and rotation history
 *
 * @param matchingTips - All tips matching the current crop and stage age
 * @param lastDisplayedTipId - ID of the last tip displayed for this field in daily_agenda_log
 */
export function selectRotatedQualityTip(
  matchingTips: CropQualityTip[],
  lastDisplayedTipId: string | null
): CropQualityTip | null {
  if (matchingTips.length === 0) {
    return null;
  }

  if (matchingTips.length === 1) {
    return matchingTips[0];
  }

  // Sort by rotation_order ascending
  const sortedTips = [...matchingTips].sort((a, b) => a.rotation_order - b.rotation_order);

  if (!lastDisplayedTipId) {
    return sortedTips[0];
  }

  // Find index of last displayed tip
  const lastIndex = sortedTips.findIndex((t) => t.id === lastDisplayedTipId);

  if (lastIndex === -1 || lastIndex === sortedTips.length - 1) {
    // If not found or was the last one, loop back to index 0
    return sortedTips[0];
  }

  // Pick the next tip in rotation order
  return sortedTips[lastIndex + 1];
}
