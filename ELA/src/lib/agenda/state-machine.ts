// ============================================================
// Agricultural Alert Agenda System — State Machine Engine
// Implements ALL 35 transition rows from specification v2.0
// ============================================================

import {
  type AlertInstance,
  type AlertInstanceStatus,
  type AlertEvent,
  type TransitionResult,
  type SideEffect,
  type CropRiskRule,
  type CropRiskSeverity,
  type WeatherSnapshot,
  CLOSED_STATUSES,
  SEVERITY_ORDER,
} from './types';

// ============================================================
// Helper: Check if a status is considered "open" (not closed)
// ============================================================

export function isOpenStatus(status: AlertInstanceStatus): boolean {
  return !CLOSED_STATUSES.has(status);
}

// ============================================================
// Helper: Compare severity levels
// ============================================================

export function isHigherSeverity(a: CropRiskSeverity, b: CropRiskSeverity): boolean {
  return SEVERITY_ORDER[a] > SEVERITY_ORDER[b];
}

// ============================================================
// TRANSITION 1: Rule triggered — check for existing open alerts
// Returns: 'create_new' | 'ignore' | 'upgrade' | null
// ============================================================

export interface RuleTriggerResult {
  action: 'create_new' | 'ignore' | 'upgrade';
  existingAlert?: AlertInstance;
}

/**
 * Transition 1 (with sub-transitions 1a, 1b, 1c):
 * Determines what to do when a crop_risk_rule fires.
 *
 * @param openAlerts - All open alerts for the same farmer_field_id
 * @param triggeringRule - The rule that just fired
 */
export function evaluateRuleTrigger(
  openAlerts: AlertInstance[],
  triggeringRule: CropRiskRule
): RuleTriggerResult {
  // Find open alert with same risk_type (§5.9: match on risk_type, NOT rule id)
  const sameRiskAlert = openAlerts.find(
    (a) => a.risk_type === triggeringRule.risk_type && isOpenStatus(a.status)
  );

  if (!sameRiskAlert) {
    // Transition 1a: No open alert for this risk → create new
    return { action: 'create_new' };
  }

  // There IS an open alert with same risk_type
  if (
    sameRiskAlert.matched_risk_rule_id === triggeringRule.id &&
    sameRiskAlert.severity_snapshot === triggeringRule.severity
  ) {
    // Transition 1b: Same rule, same severity → ignore completely
    return { action: 'ignore', existingAlert: sameRiskAlert };
  }

  if (isHigherSeverity(triggeringRule.severity, sameRiskAlert.severity_snapshot)) {
    // Transition 1c: Higher severity → upgrade existing alert
    return { action: 'upgrade', existingAlert: sameRiskAlert };
  }

  // Same or lower severity from different rule → ignore
  return { action: 'ignore', existingAlert: sameRiskAlert };
}

/**
 * Transition 1a: Create a new alert instance with all snapshots frozen.
 */
export function createNewAlertData(
  farmerFieldId: string,
  rule: CropRiskRule,
  weatherSnapshot: WeatherSnapshot
): Partial<AlertInstance> {
  return {
    farmer_field_id: farmerFieldId,
    risk_type: rule.risk_type,
    matched_risk_rule_id: rule.id,
    rule_version_snapshot: rule.version,
    severity_snapshot: rule.severity,
    follow_up_days_snapshot: rule.follow_up_days,
    advice_text_snapshot: rule.advice_text,
    advice_reason_snapshot: rule.advice_reason,
    product_link_snapshot: rule.product_link,
    status: 'SENT',
    confidence_level: 'weather_based',
    weather_snapshot_at_trigger: weatherSnapshot,
    no_response_count: 0,
    false_alarm_streak_count: 0,
  };
}

/**
 * Transition 1c: Upgrade an existing open alert to higher severity.
 * Updates snapshots to the more severe rule. Does NOT create a new row.
 */
export function upgradeAlertSeverity(
  rule: CropRiskRule
): TransitionResult {
  return {
    updates: {
      matched_risk_rule_id: rule.id,
      rule_version_snapshot: rule.version,
      severity_snapshot: rule.severity,
      follow_up_days_snapshot: rule.follow_up_days,
      advice_text_snapshot: rule.advice_text,
      advice_reason_snapshot: rule.advice_reason,
      product_link_snapshot: rule.product_link,
    },
    sideEffects: [
      {
        type: 'SEND_NOTIFICATION',
        target: 'farmer',
        message: `الوضع بقى أخطر: ${rule.advice_text}`,
        priority: 'urgent',
      },
    ],
  };
}

// ============================================================
// MAIN STATE MACHINE: processEvent
// Handles transitions 2-24 (with all sub-transitions)
// ============================================================

/**
 * Process a state machine event on an alert instance.
 * Returns the DB updates and side effects to apply.
 *
 * @param alert - Current alert instance state
 * @param event - The event to process
 * @param now - Current timestamp (ISO string, Cairo TZ)
 */
export function processEvent(
  alert: AlertInstance,
  event: AlertEvent,
  now: string
): TransitionResult {
  const currentStatus = alert.status;

  switch (event.type) {
    // ========================================================
    // Transition 2: SENT → CLOSED_FALSE_ALARM ("تمام")
    // ========================================================
    case 'FARMER_RESPONSE_OK': {
      if (currentStatus !== 'SENT') {
        return noOp();
      }
      const newStreakCount = alert.false_alarm_streak_count + 1;
      const sideEffects: SideEffect[] = [];

      // §5.7 / §4 transition 2: If streak reaches 3, create admin review flag
      if (newStreakCount >= 3) {
        sideEffects.push({
          type: 'CREATE_RULE_REVIEW_FLAG',
          farmerFieldId: alert.farmer_field_id,
          riskType: alert.risk_type,
          ruleId: alert.matched_risk_rule_id,
          streakCount: newStreakCount,
        });
      }

      return {
        updates: {
          status: 'CLOSED_FALSE_ALARM',
          closed_reason: 'false_alarm',
          closed_at: now,
          false_alarm_streak_count: newStreakCount,
        },
        sideEffects,
      };
    }

    // ========================================================
    // Transition 3: SENT → AWAITING_DIAGNOSIS ("في مشكلة")
    // ========================================================
    case 'FARMER_RESPONSE_PROBLEM': {
      if (currentStatus !== 'SENT') {
        return noOp();
      }
      return {
        updates: {
          status: 'AWAITING_DIAGNOSIS',
          diagnosis_started_at: now,
        },
        sideEffects: [
          { type: 'START_DIAGNOSIS_CHAT', alertInstanceId: alert.id },
          { type: 'CAPTURE_WEATHER_SNAPSHOT' },
        ],
      };
    }

    // ========================================================
    // Transition 4: SENT → PRODUCT_ORDERED ("عايز المنتج")
    // ========================================================
    case 'FARMER_RESPONSE_WANT_PRODUCT': {
      if (currentStatus !== 'SENT') {
        return noOp();
      }
      const sideEffects: SideEffect[] = [];

      // §5.5: If severity ≠ critical (no product_link_snapshot), open general catalog
      if (alert.severity_snapshot !== 'critical' || !alert.product_link_snapshot) {
        sideEffects.push({
          type: 'OPEN_PRODUCT_CATALOG',
          cropType: alert.risk_type, // Will be resolved from farmer_field crop_type at API layer
        });
      }

      return {
        updates: {
          status: 'PRODUCT_ORDERED',
          order_status: 'ordered',
          order_placed_at: now,
          confidence_level: 'purchase_confirmed',
        },
        sideEffects,
      };
    }

    // ========================================================
    // Transition 5: SENT → NO_RESPONSE (48h timeout)
    // ========================================================
    case 'NO_RESPONSE_TIMEOUT': {
      if (currentStatus === 'SENT') {
        // Transition 5: from SENT
        return {
          updates: {
            status: 'NO_RESPONSE',
            origin_state: 'SENT',
          },
          sideEffects: [],
        };
      }
      return noOp();
    }

    // ========================================================
    // Transitions 6, 6b, 6c: NO_RESPONSE → re-send based on origin_state
    // ========================================================
    case 'RESEND_ALERT': {
      if (currentStatus !== 'NO_RESPONSE') {
        return noOp();
      }

      const newCount = alert.no_response_count + 1;

      // Transition 7: If no_response_count reaches 2 → auto close
      if (newCount >= 2) {
        return {
          updates: {
            status: 'AUTO_CLOSED_NO_RESPONSE',
            closed_reason: 'auto_closed_no_response',
            closed_at: now,
            no_response_count: newCount,
          },
          sideEffects: [],
        };
      }

      // Determine target state based on origin_state
      switch (alert.origin_state) {
        case 'SENT':
          // Transition 6: Re-send alert with softer wording
          return {
            updates: {
              status: 'SENT',
              no_response_count: newCount,
            },
            sideEffects: [
              { type: 'SEND_NOTIFICATION', target: 'farmer', message: 'تذكير: فيه تنبيه مهم لأرضك' },
            ],
          };

        case 'FOLLOW_UP_SENT':
          // Transition 6b: Re-send the SAME follow-up question (not original alert)
          return {
            updates: {
              status: 'FOLLOW_UP_SENT',
              no_response_count: newCount,
            },
            sideEffects: [
              { type: 'SEND_NOTIFICATION', target: 'farmer', message: 'تذكير: إن شاء الله الدواء نفع؟' },
            ],
          };

        case 'INCONCLUSIVE':
          // Transition 6c: Re-send the request for missing info/photo
          return {
            updates: {
              status: 'INCONCLUSIVE',
              no_response_count: newCount,
            },
            sideEffects: [
              { type: 'SEND_NOTIFICATION', target: 'farmer', message: 'تذكير: محتاجين الصورة أو المعلومة الناقصة' },
            ],
          };

        case 'AWAITING_DIAGNOSIS':
          // From transition 9b path: re-send diagnosis prompt
          return {
            updates: {
              status: 'AWAITING_DIAGNOSIS',
              no_response_count: newCount,
            },
            sideEffects: [
              { type: 'START_DIAGNOSIS_CHAT', alertInstanceId: alert.id },
            ],
          };

        default:
          return noOp();
      }
    }

    // ========================================================
    // Transition 8: AWAITING_DIAGNOSIS → DIAGNOSIS_PAUSED
    // ========================================================
    case 'DIAGNOSIS_LEAVE': {
      if (currentStatus !== 'AWAITING_DIAGNOSIS') {
        return noOp();
      }
      return {
        updates: {
          status: 'DIAGNOSIS_PAUSED',
          diagnosis_paused_at: now,
        },
        sideEffects: [
          { type: 'SEND_NOTIFICATION', target: 'farmer', message: 'لسه مستنينك تكمل التشخيص' },
        ],
      };
    }

    // ========================================================
    // Transition 9: DIAGNOSIS_PAUSED → AWAITING_DIAGNOSIS (farmer returns)
    // ========================================================
    case 'DIAGNOSIS_RETURN': {
      if (currentStatus !== 'DIAGNOSIS_PAUSED') {
        return noOp();
      }
      return {
        updates: {
          status: 'AWAITING_DIAGNOSIS',
          diagnosis_paused_at: null,
        },
        sideEffects: [
          { type: 'START_DIAGNOSIS_CHAT', alertInstanceId: alert.id },
        ],
      };
    }

    // ========================================================
    // Transition 9b: DIAGNOSIS_PAUSED → NO_RESPONSE (72h timeout)
    // ========================================================
    case 'DIAGNOSIS_PAUSED_TIMEOUT': {
      if (currentStatus !== 'DIAGNOSIS_PAUSED') {
        return noOp();
      }
      return {
        updates: {
          status: 'NO_RESPONSE',
          origin_state: 'AWAITING_DIAGNOSIS',
        },
        sideEffects: [],
      };
    }

    // ========================================================
    // Transition 10: AWAITING_DIAGNOSIS → CONFIRMED_ACTIVE
    // (Diagnosis matches original risk)
    // ========================================================
    case 'DIAGNOSIS_CONFIRMED_SAME': {
      if (currentStatus !== 'AWAITING_DIAGNOSIS') {
        return noOp();
      }
      // follow_up_due_at starts from NOW (diagnosis confirmation moment) — §5.2
      const followUpDueAt = addDays(now, alert.follow_up_days_snapshot);

      return {
        updates: {
          status: 'CONFIRMED_ACTIVE',
          confidence_level: 'farmer_confirmed',
          follow_up_due_at: followUpDueAt,
        },
        sideEffects: [
          {
            type: 'LOG_FARMER_JSONB',
            data: {
              event: 'risk_confirmed',
              risk_type: alert.risk_type,
              confirmed_at: now,
              source: 'AI diagnosis',
            },
          },
          { type: 'CAPTURE_WEATHER_SNAPSHOT' },
        ],
      };
    }

    // ========================================================
    // Transition 11: AWAITING_DIAGNOSIS → MISDIAGNOSED_ORIGINAL
    // (Diagnosis found a completely different problem)
    // ========================================================
    case 'DIAGNOSIS_DIFFERENT_PROBLEM': {
      if (currentStatus !== 'AWAITING_DIAGNOSIS') {
        return noOp();
      }
      return {
        updates: {
          status: 'MISDIAGNOSED_ORIGINAL',
          closed_at: now,
        },
        sideEffects: [
          {
            type: 'CREATE_NEW_ALERT',
            data: {
              farmer_field_id: alert.farmer_field_id,
              risk_type: event.newRiskType,
              matched_risk_rule_id: alert.matched_risk_rule_id,
              rule_version_snapshot: alert.rule_version_snapshot,
              severity_snapshot: alert.severity_snapshot,
              follow_up_days_snapshot: alert.follow_up_days_snapshot,
              advice_text_snapshot: event.newRiskDetails,
              advice_reason_snapshot: null,
              product_link_snapshot: null,
              status: 'AWAITING_DIAGNOSIS',
              parent_alert_id: alert.id,
              confidence_level: 'farmer_confirmed',
              diagnosis_started_at: now,
              weather_snapshot_at_trigger: alert.weather_snapshot_at_trigger,
            },
          },
          { type: 'CAPTURE_WEATHER_SNAPSHOT' },
        ],
      };
    }

    // ========================================================
    // Transition 12: AWAITING_DIAGNOSIS → INCONCLUSIVE
    // ========================================================
    case 'DIAGNOSIS_INCONCLUSIVE': {
      if (currentStatus !== 'AWAITING_DIAGNOSIS') {
        return noOp();
      }
      return {
        updates: {
          status: 'INCONCLUSIVE',
          confidence_level: 'unconfirmed',
        },
        sideEffects: [
          { type: 'SEND_NOTIFICATION', target: 'farmer', message: 'محتاجين صورة أو معلومة إضافية عشان نقدر نساعدك' },
          { type: 'CAPTURE_WEATHER_SNAPSHOT' },
        ],
      };
    }

    // ========================================================
    // Transition 13: INCONCLUSIVE → AWAITING_DIAGNOSIS
    // (Farmer sends additional info/photo)
    // ========================================================
    case 'ADDITIONAL_INFO_SENT': {
      if (currentStatus !== 'INCONCLUSIVE') {
        return noOp();
      }
      return {
        updates: {
          status: 'AWAITING_DIAGNOSIS',
          no_response_count: 0, // §5.7: reset on actual response
        },
        sideEffects: [
          { type: 'START_DIAGNOSIS_CHAT', alertInstanceId: alert.id },
        ],
      };
    }

    // ========================================================
    // Transition 14: INCONCLUSIVE → NO_RESPONSE (48h timeout)
    // ========================================================
    case 'INCONCLUSIVE_TIMEOUT': {
      if (currentStatus !== 'INCONCLUSIVE') {
        return noOp();
      }
      return {
        updates: {
          status: 'NO_RESPONSE',
          origin_state: 'INCONCLUSIVE',
        },
        sideEffects: [],
      };
    }

    // ========================================================
    // Transition 15a: CONFIRMED_ACTIVE → FOLLOW_UP_SENT
    // (follow_up_days elapsed from diagnosis, no product order)
    // ========================================================
    case 'FOLLOW_UP_DUE': {
      if (
        currentStatus === 'CONFIRMED_ACTIVE' ||
        (currentStatus === 'PRODUCT_ORDERED' && alert.order_status === 'delivered')
      ) {
        // Transition 15a (CONFIRMED_ACTIVE) or 15c (PRODUCT_ORDERED + delivered)
        return {
          updates: {
            status: 'FOLLOW_UP_SENT',
          },
          sideEffects: [
            {
              type: 'SEND_NOTIFICATION',
              target: 'farmer',
              message: 'إن شاء الله الدواء نفع؟',
            },
          ],
        };
      }
      return noOp();
    }

    // ========================================================
    // Transition 15b: PRODUCT_ORDERED → update follow_up_due_at on delivery
    // ========================================================
    case 'ORDER_DELIVERED': {
      if (currentStatus !== 'PRODUCT_ORDERED' || alert.order_status !== 'ordered') {
        return noOp();
      }
      // §5.2: follow_up starts from DELIVERY, not order placement
      const followUpDueAt = addDays(now, alert.follow_up_days_snapshot);
      return {
        updates: {
          order_status: 'delivered',
          order_delivered_at: now,
          follow_up_due_at: followUpDueAt,
        },
        sideEffects: [],
      };
    }

    // ========================================================
    // Transition 15d: PRODUCT_ORDERED → order_status = expired (5 days no delivery)
    // ========================================================
    case 'ORDER_DELIVERY_EXPIRED': {
      if (currentStatus !== 'PRODUCT_ORDERED' || alert.order_status !== 'ordered') {
        return noOp();
      }
      return {
        updates: {
          order_status: 'expired',
        },
        sideEffects: [
          {
            type: 'SEND_NOTIFICATION',
            target: 'distributor',
            message: `طلب معلق من 5 أيام للفلاح — يرجى المتابعة`,
            priority: 'urgent',
          },
          {
            type: 'SEND_NOTIFICATION',
            target: 'admin',
            message: `تنبيه تشغيلي: طلب منتج معلق بدون تسليم`,
          },
        ],
      };
    }

    // ========================================================
    // Transition 15e: PRODUCT_ORDERED → order cancelled by distributor
    // ========================================================
    case 'ORDER_CANCELLED': {
      if (currentStatus !== 'PRODUCT_ORDERED') {
        return noOp();
      }
      return {
        updates: {
          order_status: 'cancelled',
        },
        sideEffects: [
          {
            type: 'SEND_NOTIFICATION',
            target: 'farmer',
            message: 'للأسف الطلب اتلغى — تقدر تطلب من موزع تاني',
          },
        ],
      };
    }

    // ========================================================
    // Transition 16: FOLLOW_UP_SENT → RESOLVED ("اتحسن")
    // ========================================================
    case 'FOLLOW_UP_RESPONSE_IMPROVED': {
      if (currentStatus !== 'FOLLOW_UP_SENT') {
        return noOp();
      }
      return {
        updates: {
          status: 'RESOLVED',
          closed_reason: 'resolved',
          closed_at: now,
        },
        sideEffects: [
          {
            type: 'LOG_FARMER_JSONB',
            data: {
              event: 'risk_resolved',
              risk_type: alert.risk_type,
              resolved_at: now,
              days_to_resolve: daysBetween(alert.created_at, now),
            },
          },
          { type: 'CAPTURE_WEATHER_SNAPSHOT' },
        ],
      };
    }

    // ========================================================
    // Transition 17: FOLLOW_UP_SENT → AWAITING_DISTRIBUTOR_ACTION ("لسه زي ما هو")
    // ESCALATED_TO_DISTRIBUTOR is the EVENT name, AWAITING_DISTRIBUTOR_ACTION is the stored STATUS
    // ========================================================
    case 'FOLLOW_UP_RESPONSE_SAME': {
      if (currentStatus !== 'FOLLOW_UP_SENT') {
        return noOp();
      }
      const escalationDeadline = addDays(now, 3);
      return {
        updates: {
          status: 'AWAITING_DISTRIBUTOR_ACTION',
          escalated_at: now,
          escalation_deadline_at: escalationDeadline,
        },
        sideEffects: [
          {
            type: 'SEND_NOTIFICATION',
            target: 'distributor',
            message: `فلاح محتاج مساعدة — العلاج لم يحل المشكلة`,
            priority: 'normal',
          },
          { type: 'CAPTURE_WEATHER_SNAPSHOT' },
        ],
      };
    }

    // ========================================================
    // Transition 18: FOLLOW_UP_SENT → AWAITING_DISTRIBUTOR_ACTION ("زاد سوء")
    // Same as 17 but with URGENT priority
    // ========================================================
    case 'FOLLOW_UP_RESPONSE_WORSE': {
      if (currentStatus !== 'FOLLOW_UP_SENT') {
        return noOp();
      }
      const escalationDeadline = addDays(now, 3);
      return {
        updates: {
          status: 'AWAITING_DISTRIBUTOR_ACTION',
          escalated_at: now,
          escalation_deadline_at: escalationDeadline,
        },
        sideEffects: [
          {
            type: 'SEND_NOTIFICATION',
            target: 'distributor',
            message: `عاجل: الحالة زادت سوء — يحتاج تدخل فوري`,
            priority: 'urgent',
          },
          { type: 'CAPTURE_WEATHER_SNAPSHOT' },
        ],
      };
    }

    // ========================================================
    // Transition 19: FOLLOW_UP_SENT → CROP_LOSS ("فقدت المحصول بالكامل")
    // Cascades: close ALL open alerts for same farmer_field_id
    // ========================================================
    case 'FOLLOW_UP_RESPONSE_CROP_LOSS': {
      if (currentStatus !== 'FOLLOW_UP_SENT') {
        return noOp();
      }
      return {
        updates: {
          status: 'CROP_LOSS',
          closed_reason: 'crop_loss',
          closed_at: now,
        },
        sideEffects: [
          // Cascade close ALL open alerts for same field (§4 transition 19)
          {
            type: 'CLOSE_ALL_FIELD_ALERTS',
            farmerFieldId: alert.farmer_field_id,
            reason: 'crop_loss',
          },
          {
            type: 'SEND_NOTIFICATION',
            target: 'distributor',
            message: `فلاح فقد المحصول بالكامل — فرصة بيع تقاوي/شتلات جديدة`,
            priority: 'urgent',
          },
          {
            type: 'LOG_FARMER_JSONB',
            data: {
              event: 'crop_loss',
              risk_type: alert.risk_type,
              loss_date: now,
            },
          },
          { type: 'CAPTURE_WEATHER_SNAPSHOT' },
        ],
      };
    }

    // ========================================================
    // Transition 20: FOLLOW_UP_SENT → NO_RESPONSE (48h timeout)
    // ========================================================
    case 'FOLLOW_UP_NO_RESPONSE': {
      if (currentStatus !== 'FOLLOW_UP_SENT') {
        return noOp();
      }
      return {
        updates: {
          status: 'NO_RESPONSE',
          origin_state: 'FOLLOW_UP_SENT',
        },
        sideEffects: [],
      };
    }

    // ========================================================
    // Transition 21: AWAITING_DISTRIBUTOR_ACTION → RESOLVED
    // (Distributor intervenes and resolves within deadline)
    // ========================================================
    case 'DISTRIBUTOR_RESOLVED': {
      if (currentStatus !== 'AWAITING_DISTRIBUTOR_ACTION') {
        return noOp();
      }
      return {
        updates: {
          status: 'RESOLVED',
          closed_reason: 'resolved',
          closed_at: now,
        },
        sideEffects: [
          {
            type: 'LOG_FARMER_JSONB',
            data: {
              event: 'risk_resolved',
              risk_type: alert.risk_type,
              resolved_at: now,
              resolved_by: 'distributor',
            },
          },
        ],
      };
    }

    // ========================================================
    // Transition 21b: AWAITING_DISTRIBUTOR_ACTION → escalate higher
    // (Distributor exceeds escalation_deadline_at without action)
    // ========================================================
    case 'DISTRIBUTOR_DEADLINE_EXCEEDED': {
      if (currentStatus !== 'AWAITING_DISTRIBUTOR_ACTION') {
        return noOp();
      }
      return {
        // Status stays AWAITING_DISTRIBUTOR_ACTION — burden does NOT return to farmer
        updates: {},
        sideEffects: [
          {
            type: 'SEND_NOTIFICATION',
            target: 'admin',
            message: `تصعيد: موزع لم يتحرك خلال 3 أيام — يحتاج تدخل مشرف`,
            priority: 'urgent',
          },
        ],
      };
    }

    // ========================================================
    // Transition 22: Any open status → CLOSED_SEASON_END
    // (Harvest event — manual button or automatic safety net)
    // ========================================================
    case 'HARVEST_EVENT': {
      if (!isOpenStatus(currentStatus)) {
        return noOp();
      }
      return {
        updates: {
          status: 'CLOSED_SEASON_END',
          closed_reason: 'season_end',
          closed_at: now,
        },
        sideEffects: [],
      };
    }

    // ========================================================
    // Transition 23: Admin updates a rule
    // Creates new version in crop_risk_rules. No effect on open alerts.
    // This is handled at the API/admin layer, not in alert state machine.
    // ========================================================
    case 'ADMIN_RULE_UPDATED': {
      // No changes to alert_instances — principle §0
      return noOp();
    }

    // ========================================================
    // Transition 24: Ambiguous response → AMBIGUOUS_RETRY
    // ========================================================
    case 'AMBIGUOUS_RESPONSE': {
      // Valid from any status that expects a farmer response
      const responsiveStatuses: AlertInstanceStatus[] = [
        'SENT', 'AWAITING_DIAGNOSIS', 'FOLLOW_UP_SENT', 'INCONCLUSIVE',
      ];
      if (!responsiveStatuses.includes(currentStatus)) {
        return noOp();
      }
      return {
        updates: {
          status: 'AMBIGUOUS_RETRY',
        },
        sideEffects: [
          {
            type: 'SEND_NOTIFICATION',
            target: 'farmer',
            message: 'معلش مش فاهم، اختار من دول 👇',
          },
        ],
      };
    }

    // Transition 24 continued: 2nd ambiguous → default to AWAITING_DIAGNOSIS
    case 'AMBIGUOUS_RETRY_SECOND': {
      if (currentStatus !== 'AMBIGUOUS_RETRY') {
        return noOp();
      }
      return {
        updates: {
          status: 'AWAITING_DIAGNOSIS',
          diagnosis_started_at: now,
        },
        sideEffects: [
          { type: 'START_DIAGNOSIS_CHAT', alertInstanceId: alert.id },
        ],
      };
    }

    default:
      return noOp();
  }
}

// ============================================================
// HELPERS
// ============================================================

function noOp(): TransitionResult {
  return { updates: {}, sideEffects: [] };
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function daysBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso);
  const end = new Date(endIso);
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}
