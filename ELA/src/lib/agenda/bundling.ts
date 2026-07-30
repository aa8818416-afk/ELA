// ============================================================
// Agricultural Alert Agenda System — Dual-Level Notification Bundling
// Implements Level 1 (per field card) and Level 2 (per farmer push) bundling (§5.3)
// ============================================================

import type { AlertInstance, CropRiskSeverity } from './types';
import { SEVERITY_ORDER } from './types';

export interface FieldAlertBundle {
  farmerFieldId: string;
  highestSeverity: CropRiskSeverity;
  primaryAlert: AlertInstance;
  subAlerts: AlertInstance[];
}

export interface FarmerPushNotificationPayload {
  farmerId: string;
  title: string;
  body: string;
  fieldCount: number;
  totalAlertCount: number;
}

/**
 * Level 1 Bundling (Field Level):
 * Groups active alerts for a single field into a single UI card titled with the highest severity.
 */
export function bundleFieldAlerts(alerts: AlertInstance[]): FieldAlertBundle[] {
  // Group by farmer_field_id
  const groupedByField = new Map<string, AlertInstance[]>();

  for (const alert of alerts) {
    const existing = groupedByField.get(alert.farmer_field_id) || [];
    existing.push(alert);
    groupedByField.set(alert.farmer_field_id, existing);
  }

  const bundles: FieldAlertBundle[] = [];

  for (const [fieldId, fieldAlerts] of groupedByField.entries()) {
    if (fieldAlerts.length === 0) continue;

    // Sort by severity descending
    const sorted = [...fieldAlerts].sort(
      (a, b) => SEVERITY_ORDER[b.severity_snapshot] - SEVERITY_ORDER[a.severity_snapshot]
    );

    const primaryAlert = sorted[0];
    const subAlerts = sorted.slice(1);

    bundles.push({
      farmerFieldId: fieldId,
      highestSeverity: primaryAlert.severity_snapshot,
      primaryAlert,
      subAlerts,
    });
  }

  return bundles;
}

/**
 * Level 2 Bundling (Farmer Level):
 * Generates ONE single Push notification payload per farmer per day (§5.3).
 */
export function generateFarmerDailyPushPayload(
  farmerId: string,
  fieldBundles: FieldAlertBundle[]
): FarmerPushNotificationPayload | null {
  if (fieldBundles.length === 0) {
    return null;
  }

  const totalAlertCount = fieldBundles.reduce(
    (sum, b) => sum + 1 + b.subAlerts.length,
    0
  );

  if (fieldBundles.length === 1) {
    const bundle = fieldBundles[0];
    return {
      farmerId,
      title: `تحديث زراعي لأرضك`,
      body: `${bundle.primaryAlert.advice_text_snapshot}${totalAlertCount > 1 ? ` (+${totalAlertCount - 1} تنبيهات أخرى)` : ''}`,
      fieldCount: 1,
      totalAlertCount,
    };
  }

  // Multiple fields
  return {
    farmerId,
    title: `تحديثات مهمة في أراضيك الزراعيه`,
    body: `عندك ${totalAlertCount} تنبيهات زراعيه على مستوى ${fieldBundles.length} قطع أراضي اليوم. افتح الأجندة للمتابعة.`,
    fieldCount: fieldBundles.length,
    totalAlertCount,
  };
}
