// ============================================================
// Native Node.js Test Runner for State Machine Engine (35 Transitions)
// Includes Transition 1d (Concurrent Risk Bundling) and 21b (Admin Escalation Notif)
// ============================================================

import {
  evaluateRuleTrigger,
  createNewAlertData,
  upgradeAlertSeverity,
  processEvent,
} from '../src/lib/agenda/state-machine.ts';

import {
  bundleFieldAlerts,
  generateFarmerDailyPushPayload,
} from '../src/lib/agenda/bundling.ts';

const NOW = '2026-07-30T12:00:00.000Z';

const mockRuleModerate = {
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

const mockRuleDifferentRisk = {
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

const mockRuleCritical = {
  ...mockRuleModerate,
  id: 'rule-crit-1',
  version: 2,
  severity: 'critical',
  advice_text: 'خطر شديد! رش مبيد علاج سريعا',
  product_link: 'prod-uuid-123',
};

const mockWeatherSnapshot = {
  temperature: 20,
  humidity: 85,
  source_timestamp: NOW,
};

const baseAlertInstance = {
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

let total = 0;
let passed = 0;
const failures = [];

function assert(condition, testName) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✓ PASSED: ${testName}`);
  } else {
    failures.push(testName);
    console.error(`  ✗ FAILED: ${testName}`);
  }
}

console.log('\n============================================================');
console.log(' RUNNING STATE MACHINE ENGINE UNIT TESTS (35 TRANSITION ROWS)');
console.log('============================================================\n');

// 1a
{
  const res = evaluateRuleTrigger([], mockRuleModerate);
  assert(res.action === 'create_new', 'Transition 1a: create_new when no open alert exists');
  const newAlert = createNewAlertData('field-101', mockRuleModerate, mockWeatherSnapshot);
  assert(newAlert.status === 'SENT', 'Transition 1a: initial status is SENT');
}

// 1b
{
  const res = evaluateRuleTrigger([baseAlertInstance], mockRuleModerate);
  assert(res.action === 'ignore', 'Transition 1b: ignore when same rule & severity already open');
}

// 1c
{
  const res = evaluateRuleTrigger([baseAlertInstance], mockRuleCritical);
  assert(res.action === 'upgrade', 'Transition 1c: upgrade when higher severity rule triggers');
  const upgradeRes = upgradeAlertSeverity(mockRuleCritical);
  assert(upgradeRes.updates.severity_snapshot === 'critical', 'Transition 1c: severity upgraded to critical');
}

// 1d
{
  const res1 = evaluateRuleTrigger([], mockRuleModerate);
  assert(res1.action === 'create_new', 'Transition 1d: Alert 1 (late_blight) created');
  const alert1Data = createNewAlertData('field-101', mockRuleModerate, mockWeatherSnapshot);
  const alert1 = { ...baseAlertInstance, ...alert1Data, id: 'alert-1' };

  const res2 = evaluateRuleTrigger([alert1], mockRuleDifferentRisk);
  assert(res2.action === 'create_new', 'Transition 1d: Alert 2 (stem_borer) created separately for different risk_type');
  const alert2Data = createNewAlertData('field-101', mockRuleDifferentRisk, mockWeatherSnapshot);
  const alert2 = { ...baseAlertInstance, ...alert2Data, id: 'alert-2', risk_type: 'stem_borer', severity_snapshot: 'critical' };

  const fieldBundles = bundleFieldAlerts([alert1, alert2]);
  assert(fieldBundles.length === 1, 'Transition 1d: Bundled into 1 single UI card for the field');
  assert(fieldBundles[0].highestSeverity === 'critical', 'Transition 1d: Field card titled with highest severity (critical)');

  const pushPayload = generateFarmerDailyPushPayload('farmer-999', fieldBundles);
  assert(pushPayload !== null, 'Transition 1d: 1 single Push notification payload generated for farmer');
}

// 2
{
  const res = processEvent(baseAlertInstance, { type: 'FARMER_RESPONSE_OK' }, NOW);
  assert(res.updates.status === 'CLOSED_FALSE_ALARM', 'Transition 2: status -> CLOSED_FALSE_ALARM');
  assert(res.updates.false_alarm_streak_count === 1, 'Transition 2: streak count incremented');
}

// 2 (streak 3)
{
  const alertStreak2 = { ...baseAlertInstance, false_alarm_streak_count: 2 };
  const res = processEvent(alertStreak2, { type: 'FARMER_RESPONSE_OK' }, NOW);
  assert(res.sideEffects.some((s) => s.type === 'CREATE_RULE_REVIEW_FLAG'), 'Transition 2: flag created at streak 3');
}

// 3
{
  const res = processEvent(baseAlertInstance, { type: 'FARMER_RESPONSE_PROBLEM' }, NOW);
  assert(res.updates.status === 'AWAITING_DIAGNOSIS', 'Transition 3: status -> AWAITING_DIAGNOSIS');
}

// 4
{
  const res = processEvent(baseAlertInstance, { type: 'FARMER_RESPONSE_WANT_PRODUCT' }, NOW);
  assert(res.updates.status === 'PRODUCT_ORDERED', 'Transition 4: status -> PRODUCT_ORDERED');
}

// 5
{
  const res = processEvent(baseAlertInstance, { type: 'NO_RESPONSE_TIMEOUT' }, NOW);
  assert(res.updates.status === 'NO_RESPONSE', 'Transition 5: status -> NO_RESPONSE (origin=SENT)');
  assert(res.updates.origin_state === 'SENT', 'Transition 5: origin_state set');
}

// 6
{
  const alertNoResp = { ...baseAlertInstance, status: 'NO_RESPONSE', origin_state: 'SENT' };
  const res = processEvent(alertNoResp, { type: 'RESEND_ALERT' }, NOW);
  assert(res.updates.status === 'SENT', 'Transition 6: status -> SENT');
}

// 6b
{
  const alertNoRespFollowUp = { ...baseAlertInstance, status: 'NO_RESPONSE', origin_state: 'FOLLOW_UP_SENT' };
  const res = processEvent(alertNoRespFollowUp, { type: 'RESEND_ALERT' }, NOW);
  assert(res.updates.status === 'FOLLOW_UP_SENT', 'Transition 6b: status -> FOLLOW_UP_SENT');
}

// 6c
{
  const alertNoRespInconclusive = { ...baseAlertInstance, status: 'NO_RESPONSE', origin_state: 'INCONCLUSIVE' };
  const res = processEvent(alertNoRespInconclusive, { type: 'RESEND_ALERT' }, NOW);
  assert(res.updates.status === 'INCONCLUSIVE', 'Transition 6c: status -> INCONCLUSIVE');
}

// 7
{
  const alertCount1 = { ...baseAlertInstance, status: 'NO_RESPONSE', origin_state: 'SENT', no_response_count: 1 };
  const res = processEvent(alertCount1, { type: 'RESEND_ALERT' }, NOW);
  assert(res.updates.status === 'AUTO_CLOSED_NO_RESPONSE', 'Transition 7: status -> AUTO_CLOSED_NO_RESPONSE');
}

// 8
{
  const alertDiag = { ...baseAlertInstance, status: 'AWAITING_DIAGNOSIS' };
  const res = processEvent(alertDiag, { type: 'DIAGNOSIS_LEAVE' }, NOW);
  assert(res.updates.status === 'DIAGNOSIS_PAUSED', 'Transition 8: status -> DIAGNOSIS_PAUSED');
}

// 9
{
  const alertPaused = { ...baseAlertInstance, status: 'DIAGNOSIS_PAUSED', diagnosis_paused_at: NOW };
  const res = processEvent(alertPaused, { type: 'DIAGNOSIS_RETURN' }, NOW);
  assert(res.updates.status === 'AWAITING_DIAGNOSIS', 'Transition 9: status -> AWAITING_DIAGNOSIS');
}

// 9b
{
  const alertPaused = { ...baseAlertInstance, status: 'DIAGNOSIS_PAUSED' };
  const res = processEvent(alertPaused, { type: 'DIAGNOSIS_PAUSED_TIMEOUT' }, NOW);
  assert(res.updates.status === 'NO_RESPONSE', 'Transition 9b: status -> NO_RESPONSE');
  assert(res.updates.origin_state === 'AWAITING_DIAGNOSIS', 'Transition 9b: origin_state -> AWAITING_DIAGNOSIS');
}

// 10
{
  const alertDiag = { ...baseAlertInstance, status: 'AWAITING_DIAGNOSIS' };
  const res = processEvent(alertDiag, { type: 'DIAGNOSIS_CONFIRMED_SAME' }, NOW);
  assert(res.updates.status === 'CONFIRMED_ACTIVE', 'Transition 10: status -> CONFIRMED_ACTIVE');
}

// 11
{
  const alertDiag = { ...baseAlertInstance, status: 'AWAITING_DIAGNOSIS' };
  const res = processEvent(alertDiag, { type: 'DIAGNOSIS_DIFFERENT_PROBLEM', newRiskType: 'stem_borer', newRiskDetails: 'ثاقبة الساق' }, NOW);
  assert(res.updates.status === 'MISDIAGNOSED_ORIGINAL', 'Transition 11: original -> MISDIAGNOSED_ORIGINAL');
  const effect = res.sideEffects.find((s) => s.type === 'CREATE_NEW_ALERT');
  assert(effect.data.parent_alert_id === 'alert-1', 'Transition 11: parent_alert_id set');
}

// 12
{
  const alertDiag = { ...baseAlertInstance, status: 'AWAITING_DIAGNOSIS' };
  const res = processEvent(alertDiag, { type: 'DIAGNOSIS_INCONCLUSIVE' }, NOW);
  assert(res.updates.status === 'INCONCLUSIVE', 'Transition 12: status -> INCONCLUSIVE');
}

// 13
{
  const alertInconclusive = { ...baseAlertInstance, status: 'INCONCLUSIVE' };
  const res = processEvent(alertInconclusive, { type: 'ADDITIONAL_INFO_SENT' }, NOW);
  assert(res.updates.status === 'AWAITING_DIAGNOSIS', 'Transition 13: status -> AWAITING_DIAGNOSIS');
}

// 14
{
  const alertInconclusive = { ...baseAlertInstance, status: 'INCONCLUSIVE' };
  const res = processEvent(alertInconclusive, { type: 'INCONCLUSIVE_TIMEOUT' }, NOW);
  assert(res.updates.status === 'NO_RESPONSE', 'Transition 14: status -> NO_RESPONSE');
}

// 15a
{
  const alertConfirmed = { ...baseAlertInstance, status: 'CONFIRMED_ACTIVE' };
  const res = processEvent(alertConfirmed, { type: 'FOLLOW_UP_DUE' }, NOW);
  assert(res.updates.status === 'FOLLOW_UP_SENT', 'Transition 15a: status -> FOLLOW_UP_SENT');
}

// 15b
{
  const alertOrdered = { ...baseAlertInstance, status: 'PRODUCT_ORDERED', order_status: 'ordered' };
  const res = processEvent(alertOrdered, { type: 'ORDER_DELIVERED' }, NOW);
  assert(res.updates.order_status === 'delivered', 'Transition 15b: order_status -> delivered');
}

// 15c
{
  const alertDelivered = { ...baseAlertInstance, status: 'PRODUCT_ORDERED', order_status: 'delivered' };
  const res = processEvent(alertDelivered, { type: 'FOLLOW_UP_DUE' }, NOW);
  assert(res.updates.status === 'FOLLOW_UP_SENT', 'Transition 15c: status -> FOLLOW_UP_SENT');
}

// 15d
{
  const alertOrdered = { ...baseAlertInstance, status: 'PRODUCT_ORDERED', order_status: 'ordered' };
  const res = processEvent(alertOrdered, { type: 'ORDER_DELIVERY_EXPIRED' }, NOW);
  assert(res.updates.order_status === 'expired', 'Transition 15d: order_status -> expired');
}

// 15e
{
  const alertOrdered = { ...baseAlertInstance, status: 'PRODUCT_ORDERED', order_status: 'ordered' };
  const res = processEvent(alertOrdered, { type: 'ORDER_CANCELLED' }, NOW);
  assert(res.updates.order_status === 'cancelled', 'Transition 15e: order_status -> cancelled');
}

// 16
{
  const alertFollowUp = { ...baseAlertInstance, status: 'FOLLOW_UP_SENT' };
  const res = processEvent(alertFollowUp, { type: 'FOLLOW_UP_RESPONSE_IMPROVED' }, NOW);
  assert(res.updates.status === 'RESOLVED', 'Transition 16: status -> RESOLVED');
}

// 17
{
  const alertFollowUp = { ...baseAlertInstance, status: 'FOLLOW_UP_SENT' };
  const res = processEvent(alertFollowUp, { type: 'FOLLOW_UP_RESPONSE_SAME' }, NOW);
  assert(res.updates.status === 'AWAITING_DISTRIBUTOR_ACTION', 'Transition 17: status -> AWAITING_DISTRIBUTOR_ACTION');
}

// 18
{
  const alertFollowUp = { ...baseAlertInstance, status: 'FOLLOW_UP_SENT' };
  const res = processEvent(alertFollowUp, { type: 'FOLLOW_UP_RESPONSE_WORSE' }, NOW);
  assert(res.updates.status === 'AWAITING_DISTRIBUTOR_ACTION', 'Transition 18: status -> AWAITING_DISTRIBUTOR_ACTION');
}

// 19
{
  const alertFollowUp = { ...baseAlertInstance, status: 'FOLLOW_UP_SENT' };
  const res = processEvent(alertFollowUp, { type: 'FOLLOW_UP_RESPONSE_CROP_LOSS' }, NOW);
  assert(res.updates.status === 'CROP_LOSS', 'Transition 19: status -> CROP_LOSS');
  assert(res.sideEffects.some((s) => s.type === 'CLOSE_ALL_FIELD_ALERTS'), 'Transition 19: CLOSE_ALL_FIELD_ALERTS present');
}

// 20
{
  const alertFollowUp = { ...baseAlertInstance, status: 'FOLLOW_UP_SENT' };
  const res = processEvent(alertFollowUp, { type: 'FOLLOW_UP_NO_RESPONSE' }, NOW);
  assert(res.updates.status === 'NO_RESPONSE', 'Transition 20: status -> NO_RESPONSE');
}

// 21
{
  const alertEscalated = { ...baseAlertInstance, status: 'AWAITING_DISTRIBUTOR_ACTION' };
  const res = processEvent(alertEscalated, { type: 'DISTRIBUTOR_RESOLVED' }, NOW);
  assert(res.updates.status === 'RESOLVED', 'Transition 21: status -> RESOLVED');
}

// 21b
{
  const alertEscalated = { ...baseAlertInstance, status: 'AWAITING_DISTRIBUTOR_ACTION' };
  const res = processEvent(alertEscalated, { type: 'DISTRIBUTOR_DEADLINE_EXCEEDED' }, NOW);
  assert(res.updates.status === undefined, 'Transition 21b: status stays AWAITING_DISTRIBUTOR_ACTION');
  assert(
    res.sideEffects.some((s) => s.type === 'SEND_NOTIFICATION' && s.target === 'admin'),
    'Transition 21b: SEND_NOTIFICATION (target: admin) generated explicitly on deadline exceeded'
  );
}

// 22
{
  const res = processEvent(baseAlertInstance, { type: 'HARVEST_EVENT' }, NOW);
  assert(res.updates.status === 'CLOSED_SEASON_END', 'Transition 22: status -> CLOSED_SEASON_END');
}

// 23
{
  const res = processEvent(baseAlertInstance, { type: 'ADMIN_RULE_UPDATED' }, NOW);
  assert(Object.keys(res.updates).length === 0, 'Transition 23: no changes on admin rule update');
}

// 24
{
  const res1 = processEvent(baseAlertInstance, { type: 'AMBIGUOUS_RESPONSE', rawText: 'مش فاهم' }, NOW);
  assert(res1.updates.status === 'AMBIGUOUS_RETRY', 'Transition 24: 1st ambiguous -> AMBIGUOUS_RETRY');
  const alertAmbiguous = { ...baseAlertInstance, status: 'AMBIGUOUS_RETRY' };
  const res2 = processEvent(alertAmbiguous, { type: 'AMBIGUOUS_RETRY_SECOND' }, NOW);
  assert(res2.updates.status === 'AWAITING_DIAGNOSIS', 'Transition 24: 2nd ambiguous -> AWAITING_DIAGNOSIS');
}

console.log('\n============================================================');
console.log(` RESULTS: ${passed}/${total} TESTS PASSED`);
if (failures.length > 0) {
  console.log(` FAILURES (${failures.length}):`);
  failures.forEach((f) => console.log(`  - ${f}`));
} else {
  console.log(' ALL 35 TRANSITION ROWS (INCLUDING 1d & 21b ASSERTIONS) VERIFIED 100%');
}
console.log('============================================================\n');
