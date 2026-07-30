// ============================================================
// Agricultural Alert Agenda System — State Machine Unit Tests
// Tests ALL 35 Transition Rows Line-by-Line (§4 of specification v2.0)
// Includes 1d (Concurrent Risk Bundling) and 21b (Admin Escalation Notification)
// ============================================================

import {
  evaluateRuleTrigger,
  createNewAlertData,
  upgradeAlertSeverity,
  processEvent,
  isOpenStatus,
  isHigherSeverity,
} from './state-machine';

import {
  bundleFieldAlerts,
  generateFarmerDailyPushPayload,
} from './bundling';

import type {
  AlertInstance,
  CropRiskRule,
  WeatherSnapshot,
  AlertEvent,
} from './types';

// Mock baseline data
const NOW = '2026-07-30T12:00:00.000Z';

const mockRuleModerate: CropRiskRule = {
  id: 'rule-mod-1',
  version: 1,
  crop_type: 'قمح',
  stage_from_day: 10,
  stage_to_day: 40,
  risk_type: 'late_blight',
  risk_causes: { temp_min: 15, temp_max: 25, humidity_min: 80 },
  condition_duration_days: 2,
  severity: 'moderate',
  advice_text: 'رش مبيد وقائي للفطريات',
  advice_reason: 'رطوبة عالية مع حرارة معتدلة',
  follow_up_days: 5,
  product_link: null,
  source_reference: 'نشرة الزراعة 2026',
  is_active: true,
  updated_at: NOW,
};

const mockRuleDifferentRisk: CropRiskRule = {
  id: 'rule-mod-2',
  version: 1,
  crop_type: 'قمح',
  stage_from_day: 10,
  stage_to_day: 40,
  risk_type: 'stem_borer',
  risk_causes: { temp_min: 20, temp_max: 30 },
  condition_duration_days: 1,
  severity: 'critical',
  advice_text: 'رصد حشرة ثاقبة الساق — رش حشري عاجل',
  advice_reason: 'ارتفاع الحرارة',
  follow_up_days: 3,
  product_link: 'prod-uuid-456',
  source_reference: 'نشرة الزراعة 2026',
  is_active: true,
  updated_at: NOW,
};

const mockRuleCritical: CropRiskRule = {
  ...mockRuleModerate,
  id: 'rule-crit-1',
  version: 2,
  severity: 'critical',
  advice_text: 'خطر شديد! رش مبيد علاج سريعا',
  product_link: 'prod-uuid-123',
};

const mockWeatherSnapshot: WeatherSnapshot = {
  temperature: 20,
  humidity: 85,
  source_timestamp: NOW,
};

const baseAlertInstance: AlertInstance = {
  id: 'alert-1',
  farmer_field_id: 'field-101',
  risk_type: 'late_blight',
  matched_risk_rule_id: 'rule-mod-1',
  rule_version_snapshot: 1,
  severity_snapshot: 'moderate',
  follow_up_days_snapshot: 5,
  advice_text_snapshot: 'رش مبيد وقائي للفطريات',
  advice_reason_snapshot: 'رطوبة عالية',
  product_link_snapshot: null,
  status: 'SENT',
  origin_state: null,
  no_response_count: 0,
  false_alarm_streak_count: 0,
  parent_alert_id: null,
  confidence_level: 'weather_based',
  order_status: null,
  order_placed_at: null,
  order_delivered_at: null,
  diagnosis_started_at: null,
  diagnosis_paused_at: null,
  follow_up_due_at: null,
  escalated_at: null,
  escalation_deadline_at: null,
  weather_snapshot_at_trigger: mockWeatherSnapshot,
  weather_snapshot_at_response: null,
  created_at: NOW,
  updated_at: NOW,
  closed_at: null,
  closed_reason: null,
};

// ============================================================
// TEST SUITE: 35 TRANSITIONS
// ============================================================

export function runAllStateMachineTests(): { total: number; passed: number; failures: string[] } {
  const failures: string[] = [];
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string) {
    total++;
    if (condition) {
      passed++;
    } else {
      failures.push(`FAILED: ${testName}`);
    }
  }

  // ----------------------------------------------------------
  // Transition 1 / 1a: Rule triggered when no open alert exists
  // ----------------------------------------------------------
  {
    const res = evaluateRuleTrigger([], mockRuleModerate);
    assert(res.action === 'create_new', 'Transition 1a: create_new when no open alert exists');

    const newAlert = createNewAlertData('field-101', mockRuleModerate, mockWeatherSnapshot);
    assert(newAlert.status === 'SENT', 'Transition 1a: initial status is SENT');
    assert(newAlert.rule_version_snapshot === 1, 'Transition 1a: rule_version_snapshot frozen');
    assert(newAlert.severity_snapshot === 'moderate', 'Transition 1a: severity_snapshot frozen');
  }

  // ----------------------------------------------------------
  // Transition 1b: Rule triggered for SAME rule & severity → ignore
  // ----------------------------------------------------------
  {
    const res = evaluateRuleTrigger([baseAlertInstance], mockRuleModerate);
    assert(res.action === 'ignore', 'Transition 1b: ignore when same rule & severity already open');
  }

  // ----------------------------------------------------------
  // Transition 1c: Rule triggered for HIGHER severity → upgrade
  // ----------------------------------------------------------
  {
    const res = evaluateRuleTrigger([baseAlertInstance], mockRuleCritical);
    assert(res.action === 'upgrade', 'Transition 1c: upgrade when higher severity rule triggers');

    const upgradeRes = upgradeAlertSeverity(mockRuleCritical);
    assert(upgradeRes.updates.severity_snapshot === 'critical', 'Transition 1c: severity upgraded to critical');
    assert(upgradeRes.updates.product_link_snapshot === 'prod-uuid-123', 'Transition 1c: product_link_snapshot updated');
    assert(
      upgradeRes.sideEffects.some((s) => s.type === 'SEND_NOTIFICATION'),
      'Transition 1c: notification sent on upgrade'
    );
  }

  // ----------------------------------------------------------
  // Transition 1d: Multiple rules (different risk_type) fire on same day for same field
  // Creates separate alert_instance rows, but bundled into 1 notification card & 1 push payload
  // ----------------------------------------------------------
  {
    // Rule 1 (late_blight) creates alert 1
    const res1 = evaluateRuleTrigger([], mockRuleModerate);
    assert(res1.action === 'create_new', 'Transition 1d: Alert 1 (late_blight) created');
    const alert1Data = createNewAlertData('field-101', mockRuleModerate, mockWeatherSnapshot);
    const alert1: AlertInstance = { ...baseAlertInstance, ...alert1Data, id: 'alert-1' };

    // Rule 2 (stem_borer - different risk_type) fires for same field
    const res2 = evaluateRuleTrigger([alert1], mockRuleDifferentRisk);
    assert(res2.action === 'create_new', 'Transition 1d: Alert 2 (stem_borer) created separately for different risk_type');
    const alert2Data = createNewAlertData('field-101', mockRuleDifferentRisk, mockWeatherSnapshot);
    const alert2: AlertInstance = { ...baseAlertInstance, ...alert2Data, id: 'alert-2', risk_type: 'stem_borer', severity_snapshot: 'critical' };

    // Verify Bundling Level 1 (Field Card)
    const fieldBundles = bundleFieldAlerts([alert1, alert2]);
    assert(fieldBundles.length === 1, 'Transition 1d: Bundled into 1 single UI card for the field');
    assert(fieldBundles[0].highestSeverity === 'critical', 'Transition 1d: Field card titled with highest severity (critical)');
    assert(fieldBundles[0].subAlerts.length === 1, 'Transition 1d: Other risk added as sub-item');

    // Verify Bundling Level 2 (Farmer Daily Push)
    const pushPayload = generateFarmerDailyPushPayload('farmer-999', fieldBundles);
    assert(pushPayload !== null, 'Transition 1d: 1 single Push notification payload generated for farmer');
    assert(pushPayload?.totalAlertCount === 2, 'Transition 1d: Push payload references total alert count of 2');
  }

  // ----------------------------------------------------------
  // Transition 2: SENT + "تمام" → CLOSED_FALSE_ALARM & increment streak
  // ----------------------------------------------------------
  {
    const res = processEvent(baseAlertInstance, { type: 'FARMER_RESPONSE_OK' }, NOW);
    assert(res.updates.status === 'CLOSED_FALSE_ALARM', 'Transition 2: status -> CLOSED_FALSE_ALARM');
    assert(res.updates.closed_reason === 'false_alarm', 'Transition 2: closed_reason -> false_alarm');
    assert(res.updates.false_alarm_streak_count === 1, 'Transition 2: streak count incremented to 1');
  }

  // Transition 2 (Streak reaches 3 → create rule_review_flag)
  {
    const alertStreak2 = { ...baseAlertInstance, false_alarm_streak_count: 2 };
    const res = processEvent(alertStreak2, { type: 'FARMER_RESPONSE_OK' }, NOW);
    assert(res.updates.false_alarm_streak_count === 3, 'Transition 2: streak count reaches 3');
    assert(
      res.sideEffects.some((s) => s.type === 'CREATE_RULE_REVIEW_FLAG'),
      'Transition 2: CREATE_RULE_REVIEW_FLAG side effect created when streak reaches 3'
    );
  }

  // ----------------------------------------------------------
  // Transition 3: SENT + "في مشكلة" → AWAITING_DIAGNOSIS
  // ----------------------------------------------------------
  {
    const res = processEvent(baseAlertInstance, { type: 'FARMER_RESPONSE_PROBLEM' }, NOW);
    assert(res.updates.status === 'AWAITING_DIAGNOSIS', 'Transition 3: status -> AWAITING_DIAGNOSIS');
    assert(res.updates.diagnosis_started_at === NOW, 'Transition 3: diagnosis_started_at recorded');
    assert(
      res.sideEffects.some((s) => s.type === 'START_DIAGNOSIS_CHAT'),
      'Transition 3: START_DIAGNOSIS_CHAT side effect triggered'
    );
  }

  // ----------------------------------------------------------
  // Transition 4: SENT + "عايز المنتج" → PRODUCT_ORDERED
  // ----------------------------------------------------------
  {
    const res = processEvent(baseAlertInstance, { type: 'FARMER_RESPONSE_WANT_PRODUCT' }, NOW);
    assert(res.updates.status === 'PRODUCT_ORDERED', 'Transition 4: status -> PRODUCT_ORDERED');
    assert(res.updates.order_status === 'ordered', 'Transition 4: order_status -> ordered');
    assert(res.updates.confidence_level === 'purchase_confirmed', 'Transition 4: confidence_level -> purchase_confirmed');
    assert(
      res.sideEffects.some((s) => s.type === 'OPEN_PRODUCT_CATALOG'),
      'Transition 4: OPEN_PRODUCT_CATALOG triggered when severity is non-critical'
    );
  }

  // ----------------------------------------------------------
  // Transition 5: SENT + timeout → NO_RESPONSE (origin_state = SENT)
  // ----------------------------------------------------------
  {
    const res = processEvent(baseAlertInstance, { type: 'NO_RESPONSE_TIMEOUT' }, NOW);
    assert(res.updates.status === 'NO_RESPONSE', 'Transition 5: status -> NO_RESPONSE');
    assert(res.updates.origin_state === 'SENT', 'Transition 5: origin_state -> SENT');
  }

  // ----------------------------------------------------------
  // Transition 6: NO_RESPONSE (origin=SENT) + RESEND → SENT (softer wording)
  // ----------------------------------------------------------
  {
    const alertNoResp = { ...baseAlertInstance, status: 'NO_RESPONSE' as const, origin_state: 'SENT' as const };
    const res = processEvent(alertNoResp, { type: 'RESEND_ALERT' }, NOW);
    assert(res.updates.status === 'SENT', 'Transition 6: status -> SENT');
    assert(res.updates.no_response_count === 1, 'Transition 6: no_response_count incremented to 1');
  }

  // ----------------------------------------------------------
  // Transition 6b: NO_RESPONSE (origin=FOLLOW_UP_SENT) + RESEND → FOLLOW_UP_SENT
  // ----------------------------------------------------------
  {
    const alertNoRespFollowUp = { ...baseAlertInstance, status: 'NO_RESPONSE' as const, origin_state: 'FOLLOW_UP_SENT' as const };
    const res = processEvent(alertNoRespFollowUp, { type: 'RESEND_ALERT' }, NOW);
    assert(res.updates.status === 'FOLLOW_UP_SENT', 'Transition 6b: status -> FOLLOW_UP_SENT (resends follow-up question)');
  }

  // ----------------------------------------------------------
  // Transition 6c: NO_RESPONSE (origin=INCONCLUSIVE) + RESEND → INCONCLUSIVE
  // ----------------------------------------------------------
  {
    const alertNoRespInconclusive = { ...baseAlertInstance, status: 'NO_RESPONSE' as const, origin_state: 'INCONCLUSIVE' as const };
    const res = processEvent(alertNoRespInconclusive, { type: 'RESEND_ALERT' }, NOW);
    assert(res.updates.status === 'INCONCLUSIVE', 'Transition 6c: status -> INCONCLUSIVE (resends photo request)');
  }

  // ----------------------------------------------------------
  // Transition 7: no_response_count reaches 2 → AUTO_CLOSED_NO_RESPONSE
  // ----------------------------------------------------------
  {
    const alertCount1 = { ...baseAlertInstance, status: 'NO_RESPONSE' as const, origin_state: 'SENT' as const, no_response_count: 1 };
    const res = processEvent(alertCount1, { type: 'RESEND_ALERT' }, NOW);
    assert(res.updates.status === 'AUTO_CLOSED_NO_RESPONSE', 'Transition 7: status -> AUTO_CLOSED_NO_RESPONSE');
    assert(res.updates.closed_reason === 'auto_closed_no_response', 'Transition 7: closed_reason -> auto_closed_no_response');
  }

  // ----------------------------------------------------------
  // Transition 8: AWAITING_DIAGNOSIS → DIAGNOSIS_PAUSED
  // ----------------------------------------------------------
  {
    const alertDiag = { ...baseAlertInstance, status: 'AWAITING_DIAGNOSIS' as const };
    const res = processEvent(alertDiag, { type: 'DIAGNOSIS_LEAVE' }, NOW);
    assert(res.updates.status === 'DIAGNOSIS_PAUSED', 'Transition 8: status -> DIAGNOSIS_PAUSED');
    assert(res.updates.diagnosis_paused_at === NOW, 'Transition 8: diagnosis_paused_at recorded');
  }

  // ----------------------------------------------------------
  // Transition 9: DIAGNOSIS_PAUSED → AWAITING_DIAGNOSIS (farmer returns)
  // ----------------------------------------------------------
  {
    const alertPaused = { ...baseAlertInstance, status: 'DIAGNOSIS_PAUSED' as const, diagnosis_paused_at: NOW };
    const res = processEvent(alertPaused, { type: 'DIAGNOSIS_RETURN' }, NOW);
    assert(res.updates.status === 'AWAITING_DIAGNOSIS', 'Transition 9: status -> AWAITING_DIAGNOSIS');
    assert(res.updates.diagnosis_paused_at === null, 'Transition 9: diagnosis_paused_at cleared');
  }

  // ----------------------------------------------------------
  // Transition 9b: DIAGNOSIS_PAUSED + 72h timeout → NO_RESPONSE (origin = AWAITING_DIAGNOSIS)
  // ----------------------------------------------------------
  {
    const alertPaused = { ...baseAlertInstance, status: 'DIAGNOSIS_PAUSED' as const };
    const res = processEvent(alertPaused, { type: 'DIAGNOSIS_PAUSED_TIMEOUT' }, NOW);
    assert(res.updates.status === 'NO_RESPONSE', 'Transition 9b: status -> NO_RESPONSE');
    assert(res.updates.origin_state === 'AWAITING_DIAGNOSIS', 'Transition 9b: origin_state -> AWAITING_DIAGNOSIS');
  }

  // ----------------------------------------------------------
  // Transition 10: AWAITING_DIAGNOSIS + confirmed same → CONFIRMED_ACTIVE
  // ----------------------------------------------------------
  {
    const alertDiag = { ...baseAlertInstance, status: 'AWAITING_DIAGNOSIS' as const };
    const res = processEvent(alertDiag, { type: 'DIAGNOSIS_CONFIRMED_SAME' }, NOW);
    assert(res.updates.status === 'CONFIRMED_ACTIVE', 'Transition 10: status -> CONFIRMED_ACTIVE');
    assert(res.updates.confidence_level === 'farmer_confirmed', 'Transition 10: confidence -> farmer_confirmed');
    assert(res.updates.follow_up_due_at !== null, 'Transition 10: follow_up_due_at calculated from NOW');
  }

  // ----------------------------------------------------------
  // Transition 11: AWAITING_DIAGNOSIS + different problem → MISDIAGNOSED_ORIGINAL + parent_alert_id
  // ----------------------------------------------------------
  {
    const alertDiag = { ...baseAlertInstance, status: 'AWAITING_DIAGNOSIS' as const };
    const res = processEvent(alertDiag, { type: 'DIAGNOSIS_DIFFERENT_PROBLEM', newRiskType: 'stem_borer', newRiskDetails: 'ثاقبة الساق' }, NOW);
    assert(res.updates.status === 'MISDIAGNOSED_ORIGINAL', 'Transition 11: original status -> MISDIAGNOSED_ORIGINAL');

    const createEffect = res.sideEffects.find((s) => s.type === 'CREATE_NEW_ALERT') as any;
    assert(createEffect !== undefined, 'Transition 11: CREATE_NEW_ALERT side effect present');
    assert(createEffect?.data?.parent_alert_id === 'alert-1', 'Transition 11: parent_alert_id points to original alert id');
    assert(createEffect?.data?.risk_type === 'stem_borer', 'Transition 11: new risk_type assigned');
    assert(createEffect?.data?.status === 'AWAITING_DIAGNOSIS', 'Transition 11: new alert starts at AWAITING_DIAGNOSIS');
  }

  // ----------------------------------------------------------
  // Transition 12: AWAITING_DIAGNOSIS → INCONCLUSIVE
  // ----------------------------------------------------------
  {
    const alertDiag = { ...baseAlertInstance, status: 'AWAITING_DIAGNOSIS' as const };
    const res = processEvent(alertDiag, { type: 'DIAGNOSIS_INCONCLUSIVE' }, NOW);
    assert(res.updates.status === 'INCONCLUSIVE', 'Transition 12: status -> INCONCLUSIVE');
    assert(res.updates.confidence_level === 'unconfirmed', 'Transition 12: confidence -> unconfirmed');
  }

  // ----------------------------------------------------------
  // Transition 13: INCONCLUSIVE + additional info → AWAITING_DIAGNOSIS
  // ----------------------------------------------------------
  {
    const alertInconclusive = { ...baseAlertInstance, status: 'INCONCLUSIVE' as const };
    const res = processEvent(alertInconclusive, { type: 'ADDITIONAL_INFO_SENT' }, NOW);
    assert(res.updates.status === 'AWAITING_DIAGNOSIS', 'Transition 13: status -> AWAITING_DIAGNOSIS');
    assert(res.updates.no_response_count === 0, 'Transition 13: no_response_count reset on response');
  }

  // ----------------------------------------------------------
  // Transition 14: INCONCLUSIVE + 48h timeout → NO_RESPONSE (origin = INCONCLUSIVE)
  // ----------------------------------------------------------
  {
    const alertInconclusive = { ...baseAlertInstance, status: 'INCONCLUSIVE' as const };
    const res = processEvent(alertInconclusive, { type: 'INCONCLUSIVE_TIMEOUT' }, NOW);
    assert(res.updates.status === 'NO_RESPONSE', 'Transition 14: status -> NO_RESPONSE');
    assert(res.updates.origin_state === 'INCONCLUSIVE', 'Transition 14: origin_state -> INCONCLUSIVE');
  }

  // ----------------------------------------------------------
  // Transition 15a: CONFIRMED_ACTIVE + follow_up_due → FOLLOW_UP_SENT
  // ----------------------------------------------------------
  {
    const alertConfirmed = { ...baseAlertInstance, status: 'CONFIRMED_ACTIVE' as const };
    const res = processEvent(alertConfirmed, { type: 'FOLLOW_UP_DUE' }, NOW);
    assert(res.updates.status === 'FOLLOW_UP_SENT', 'Transition 15a: status -> FOLLOW_UP_SENT');
  }

  // ----------------------------------------------------------
  // Transition 15b: PRODUCT_ORDERED + delivered → order_status = delivered & set follow_up_due_at from delivery
  // ----------------------------------------------------------
  {
    const alertOrdered = { ...baseAlertInstance, status: 'PRODUCT_ORDERED' as const, order_status: 'ordered' as const };
    const res = processEvent(alertOrdered, { type: 'ORDER_DELIVERED' }, NOW);
    assert(res.updates.order_status === 'delivered', 'Transition 15b: order_status -> delivered');
    assert(res.updates.order_delivered_at === NOW, 'Transition 15b: order_delivered_at recorded');
    assert(res.updates.follow_up_due_at !== null, 'Transition 15b: follow_up_due_at calculated from delivery time');
  }

  // ----------------------------------------------------------
  // Transition 15c: PRODUCT_ORDERED (delivered) + follow_up_due → FOLLOW_UP_SENT
  // ----------------------------------------------------------
  {
    const alertDelivered = { ...baseAlertInstance, status: 'PRODUCT_ORDERED' as const, order_status: 'delivered' as const };
    const res = processEvent(alertDelivered, { type: 'FOLLOW_UP_DUE' }, NOW);
    assert(res.updates.status === 'FOLLOW_UP_SENT', 'Transition 15c: status -> FOLLOW_UP_SENT after product delivery');
  }

  // ----------------------------------------------------------
  // Transition 15d: PRODUCT_ORDERED + 5 days no delivery → order_status = expired
  // ----------------------------------------------------------
  {
    const alertOrdered = { ...baseAlertInstance, status: 'PRODUCT_ORDERED' as const, order_status: 'ordered' as const };
    const res = processEvent(alertOrdered, { type: 'ORDER_DELIVERY_EXPIRED' }, NOW);
    assert(res.updates.order_status === 'expired', 'Transition 15d: order_status -> expired');
    assert(
      res.sideEffects.some((s) => s.type === 'SEND_NOTIFICATION' && s.target === 'distributor'),
      'Transition 15d: notification sent to distributor'
    );
  }

  // ----------------------------------------------------------
  // Transition 15e: PRODUCT_ORDERED + distributor cancels → order_status = cancelled
  // ----------------------------------------------------------
  {
    const alertOrdered = { ...baseAlertInstance, status: 'PRODUCT_ORDERED' as const, order_status: 'ordered' as const };
    const res = processEvent(alertOrdered, { type: 'ORDER_CANCELLED' }, NOW);
    assert(res.updates.order_status === 'cancelled', 'Transition 15e: order_status -> cancelled');
  }

  // ----------------------------------------------------------
  // Transition 16: FOLLOW_UP_SENT + "اتحسن" → RESOLVED
  // ----------------------------------------------------------
  {
    const alertFollowUp = { ...baseAlertInstance, status: 'FOLLOW_UP_SENT' as const };
    const res = processEvent(alertFollowUp, { type: 'FOLLOW_UP_RESPONSE_IMPROVED' }, NOW);
    assert(res.updates.status === 'RESOLVED', 'Transition 16: status -> RESOLVED');
    assert(res.updates.closed_reason === 'resolved', 'Transition 16: closed_reason -> resolved');
  }

  // ----------------------------------------------------------
  // Transition 17: FOLLOW_UP_SENT + "لسه زي ما هو" → AWAITING_DISTRIBUTOR_ACTION
  // (ESCALATED_TO_DISTRIBUTOR is event, AWAITING_DISTRIBUTOR_ACTION is stored status)
  // ----------------------------------------------------------
  {
    const alertFollowUp = { ...baseAlertInstance, status: 'FOLLOW_UP_SENT' as const };
    const res = processEvent(alertFollowUp, { type: 'FOLLOW_UP_RESPONSE_SAME' }, NOW);
    assert(res.updates.status === 'AWAITING_DISTRIBUTOR_ACTION', 'Transition 17: status -> AWAITING_DISTRIBUTOR_ACTION');
    assert(res.updates.escalation_deadline_at !== null, 'Transition 17: escalation_deadline_at set (+3 days)');
  }

  // ----------------------------------------------------------
  // Transition 18: FOLLOW_UP_SENT + "زاد سوء" → AWAITING_DISTRIBUTOR_ACTION (Urgent)
  // ----------------------------------------------------------
  {
    const alertFollowUp = { ...baseAlertInstance, status: 'FOLLOW_UP_SENT' as const };
    const res = processEvent(alertFollowUp, { type: 'FOLLOW_UP_RESPONSE_WORSE' }, NOW);
    assert(res.updates.status === 'AWAITING_DISTRIBUTOR_ACTION', 'Transition 18: status -> AWAITING_DISTRIBUTOR_ACTION');
    const notif = res.sideEffects.find((s) => s.type === 'SEND_NOTIFICATION') as any;
    assert(notif?.priority === 'urgent', 'Transition 18: priority is urgent');
  }

  // ----------------------------------------------------------
  // Transition 19: FOLLOW_UP_SENT + "فقدت المحصول بالكامل" → CROP_LOSS & cascade close
  // ----------------------------------------------------------
  {
    const alertFollowUp = { ...baseAlertInstance, status: 'FOLLOW_UP_SENT' as const };
    const res = processEvent(alertFollowUp, { type: 'FOLLOW_UP_RESPONSE_CROP_LOSS' }, NOW);
    assert(res.updates.status === 'CROP_LOSS', 'Transition 19: status -> CROP_LOSS');
    assert(res.updates.closed_reason === 'crop_loss', 'Transition 19: closed_reason -> crop_loss');
    assert(
      res.sideEffects.some((s) => s.type === 'CLOSE_ALL_FIELD_ALERTS'),
      'Transition 19: CLOSE_ALL_FIELD_ALERTS side effect present'
    );
  }

  // ----------------------------------------------------------
  // Transition 20: FOLLOW_UP_SENT + 48h timeout → NO_RESPONSE (origin = FOLLOW_UP_SENT)
  // ----------------------------------------------------------
  {
    const alertFollowUp = { ...baseAlertInstance, status: 'FOLLOW_UP_SENT' as const };
    const res = processEvent(alertFollowUp, { type: 'FOLLOW_UP_NO_RESPONSE' }, NOW);
    assert(res.updates.status === 'NO_RESPONSE', 'Transition 20: status -> NO_RESPONSE');
    assert(res.updates.origin_state === 'FOLLOW_UP_SENT', 'Transition 20: origin_state -> FOLLOW_UP_SENT');
  }

  // ----------------------------------------------------------
  // Transition 21: AWAITING_DISTRIBUTOR_ACTION + distributor resolves → RESOLVED
  // ----------------------------------------------------------
  {
    const alertEscalated = { ...baseAlertInstance, status: 'AWAITING_DISTRIBUTOR_ACTION' as const };
    const res = processEvent(alertEscalated, { type: 'DISTRIBUTOR_RESOLVED' }, NOW);
    assert(res.updates.status === 'RESOLVED', 'Transition 21: status -> RESOLVED');
    assert(res.updates.closed_reason === 'resolved', 'Transition 21: closed_reason -> resolved');
  }

  // ----------------------------------------------------------
  // Transition 21b: AWAITING_DISTRIBUTOR_ACTION + deadline exceeded → escalate to admin
  // ----------------------------------------------------------
  {
    const alertEscalated = { ...baseAlertInstance, status: 'AWAITING_DISTRIBUTOR_ACTION' as const };
    const res = processEvent(alertEscalated, { type: 'DISTRIBUTOR_DEADLINE_EXCEEDED' }, NOW);
    assert(res.updates.status === undefined, 'Transition 21b: status stays AWAITING_DISTRIBUTOR_ACTION');
    assert(
      res.sideEffects.some((s) => s.type === 'SEND_NOTIFICATION' && s.target === 'admin'),
      'Transition 21b: SEND_NOTIFICATION (target: admin) generated explicitly on deadline exceeded'
    );
  }

  // ----------------------------------------------------------
  // Transition 22: Any open alert + harvest event → CLOSED_SEASON_END
  // ----------------------------------------------------------
  {
    const res = processEvent(baseAlertInstance, { type: 'HARVEST_EVENT' }, NOW);
    assert(res.updates.status === 'CLOSED_SEASON_END', 'Transition 22: status -> CLOSED_SEASON_END');
    assert(res.updates.closed_reason === 'season_end', 'Transition 22: closed_reason -> season_end');
  }

  // ----------------------------------------------------------
  // Transition 23: Admin rule updated → no-op on open alerts
  // ----------------------------------------------------------
  {
    const res = processEvent(baseAlertInstance, { type: 'ADMIN_RULE_UPDATED' }, NOW);
    assert(Object.keys(res.updates).length === 0, 'Transition 23: no changes to open alerts on admin rule update');
  }

  // ----------------------------------------------------------
  // Transition 24: Ambiguous response → AMBIGUOUS_RETRY (1st) and AWAITING_DIAGNOSIS (2nd)
  // ----------------------------------------------------------
  {
    const res1 = processEvent(baseAlertInstance, { type: 'AMBIGUOUS_RESPONSE', rawText: 'مش عارف' }, NOW);
    assert(res1.updates.status === 'AMBIGUOUS_RETRY', 'Transition 24: 1st ambiguous -> AMBIGUOUS_RETRY');

    const alertAmbiguous = { ...baseAlertInstance, status: 'AMBIGUOUS_RETRY' as const };
    const res2 = processEvent(alertAmbiguous, { type: 'AMBIGUOUS_RETRY_SECOND' }, NOW);
    assert(res2.updates.status === 'AWAITING_DIAGNOSIS', 'Transition 24: 2nd ambiguous -> AWAITING_DIAGNOSIS');
  }

  return { total, passed, failures };
}
