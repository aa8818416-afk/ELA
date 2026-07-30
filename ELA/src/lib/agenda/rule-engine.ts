// ============================================================
// Agricultural Alert Agenda System — Rule Evaluation Engine
// Deterministic rule engine for daily weather & crop risk evaluation
// All date calculations enforced in Africa/Cairo timezone (§5.1)
// ============================================================

import type {
  CropRiskRule,
  FarmerField,
  WeatherSnapshot,
  WeatherConditions,
  CropRiskSeverity,
} from './types';

// Cairo Timezone identifier (§5.1)
export const CAIRO_TIMEZONE = 'Africa/Cairo';

/**
 * Get current date in Cairo timezone as ISO YYYY-MM-DD string (§5.1)
 */
export function getCairoDateString(dateObj: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CAIRO_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(dateObj);
}

/**
 * Calculate crop age in days from planting date to given date in Cairo time
 */
export function calculateCropAgeDays(plantingDateIso: string, targetDateIso: string = getCairoDateString()): number {
  const planting = new Date(plantingDateIso);
  const target = new Date(targetDateIso);
  const diffTime = target.getTime() - planting.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Evaluate if a set of weather conditions match the rule's risk_causes
 */
export function evaluateWeatherConditions(
  conditions: WeatherConditions,
  weather: WeatherSnapshot
): boolean {
  if (conditions.humidity_min !== undefined && (weather.humidity ?? 0) < conditions.humidity_min) {
    return false;
  }
  if (conditions.humidity_max !== undefined && (weather.humidity ?? 0) > conditions.humidity_max) {
    return false;
  }
  if (conditions.temp_min !== undefined && (weather.temperature ?? 0) < conditions.temp_min) {
    return false;
  }
  if (conditions.temp_max !== undefined && (weather.temperature ?? 0) > conditions.temp_max) {
    return false;
  }
  if (conditions.wind_min !== undefined && (weather.wind_speed ?? 0) < conditions.wind_min) {
    return false;
  }
  if (conditions.wind_max !== undefined && (weather.wind_speed ?? 0) > conditions.wind_max) {
    return false;
  }
  if (conditions.radiation_min !== undefined && (weather.radiation ?? 0) < conditions.radiation_min) {
    return false;
  }
  if (conditions.radiation_max !== undefined && (weather.radiation ?? 0) > conditions.radiation_max) {
    return false;
  }
  return true;
}

/**
 * Filter active rules that apply to a specific crop type and current age
 */
export function getApplicableRules(
  rules: CropRiskRule[],
  cropType: string,
  cropAgeDays: number
): CropRiskRule[] {
  return rules.filter(
    (rule) =>
      rule.is_active &&
      rule.crop_type === cropType &&
      cropAgeDays >= rule.stage_from_day &&
      cropAgeDays <= rule.stage_to_day
  );
}

/**
 * Check if farmer has opted out of notifications (§5.11)
 * Returns whether an alert of given severity should produce a Push notification or be skipped.
 */
export interface OptOutCheckResult {
  shouldCreateAlert: boolean;
  sendPushNotification: boolean;
}

export function checkNotificationOptOut(
  field: FarmerField,
  severity: CropRiskSeverity
): OptOutCheckResult {
  if (field.notifications_enabled) {
    return { shouldCreateAlert: true, sendPushNotification: true };
  }

  // Opt-out enabled:
  // Critical alerts STILL created in-app, but NO push notification
  if (severity === 'critical') {
    return { shouldCreateAlert: true, sendPushNotification: false };
  }

  // Preventive & Moderate alerts are skipped completely
  return { shouldCreateAlert: false, sendPushNotification: false };
}

/**
 * Check automatic end-of-season safety net (§5.4)
 * Returns true if crop age exceeds the maximum stage_to_day of all crop rules + 14 grace days.
 */
export function isAutomaticSeasonEnd(
  rulesForCrop: CropRiskRule[],
  cropAgeDays: number,
  graceDays: number = 14
): boolean {
  if (rulesForCrop.length === 0) {
    return false;
  }
  const maxStageToDay = Math.max(...rulesForCrop.map((r) => r.stage_to_day));
  return cropAgeDays > maxStageToDay + graceDays;
}
