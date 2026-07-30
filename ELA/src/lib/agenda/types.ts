// ============================================================
// Agricultural Alert Agenda System — Core Types
// ============================================================

// --- Enums (mirror PostgreSQL enums exactly) ---

export type CropRiskSeverity = 'critical' | 'moderate' | 'preventive';

// 17 states — ESCALATED_TO_DISTRIBUTOR is an event not a stored state
// RULE_FLAGGED_FOR_REVIEW is tracked in separate admin table
export type AlertInstanceStatus =
  | 'NO_ALERT'
  | 'SENT'
  | 'CLOSED_FALSE_ALARM'
  | 'AWAITING_DIAGNOSIS'
  | 'DIAGNOSIS_PAUSED'
  | 'CONFIRMED_ACTIVE'
  | 'MISDIAGNOSED_ORIGINAL'
  | 'INCONCLUSIVE'
  | 'PRODUCT_ORDERED'
  | 'NO_RESPONSE'
  | 'AUTO_CLOSED_NO_RESPONSE'
  | 'FOLLOW_UP_SENT'
  | 'RESOLVED'
  | 'CROP_LOSS'
  | 'CLOSED_SEASON_END'
  | 'AMBIGUOUS_RETRY'
  | 'AWAITING_DISTRIBUTOR_ACTION';

// 4 values — determines which message to re-send from NO_RESPONSE
export type AlertOriginState =
  | 'SENT'
  | 'FOLLOW_UP_SENT'
  | 'INCONCLUSIVE'
  | 'AWAITING_DIAGNOSIS';

export type AlertConfidenceLevel =
  | 'weather_based'
  | 'farmer_confirmed'
  | 'purchase_confirmed'
  | 'unconfirmed';

export type AlertOrderStatus = 'ordered' | 'delivered' | 'cancelled' | 'expired';

export type AlertClosedReason =
  | 'false_alarm'
  | 'resolved'
  | 'auto_closed_no_response'
  | 'season_end'
  | 'crop_loss'
  | 'superseded_by_higher_severity';

// --- Closed states set (for open-alert matching) ---

export const CLOSED_STATUSES: ReadonlySet<AlertInstanceStatus> = new Set([
  'CLOSED_FALSE_ALARM',
  'AUTO_CLOSED_NO_RESPONSE',
  'RESOLVED',
  'CROP_LOSS',
  'CLOSED_SEASON_END',
  'MISDIAGNOSED_ORIGINAL',
]);

// Severity ordering for comparison (higher number = higher severity)
export const SEVERITY_ORDER: Record<CropRiskSeverity, number> = {
  preventive: 1,
  moderate: 2,
  critical: 3,
};

// --- Weather Conditions (from risk_causes jsonb) ---

export interface WeatherConditions {
  humidity_min?: number;
  humidity_max?: number;
  temp_min?: number;
  temp_max?: number;
  wind_min?: number;
  wind_max?: number;
  radiation_min?: number;
  radiation_max?: number;
}

// --- Weather Snapshot (daily weather data) ---

export interface WeatherSnapshot {
  temperature?: number;
  humidity?: number;
  wind_speed?: number;
  radiation?: number;
  stale?: boolean;
  source_timestamp?: string;
  [key: string]: unknown;
}

// --- Database Row Types ---

export interface FarmerField {
  id: string;
  farmer_id: string;
  field_name: string | null;
  crop_type: string | null;
  planting_date: string | null; // ISO date or null for drafts
  latitude: number | null;
  longitude: number | null;
  area_feddan: number | null;
  area_unit?: string | null;
  registration_status?: 'draft' | 'active' | 'abandoned';
  draft_collected_fields?: Record<string, boolean> | null;
  is_active: boolean;
  notifications_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CropHistoryEntry {
  id: string;
  farmer_field_id: string;
  crop_type: string;
  planting_date: string | null;
  archived_at: string;
  replaced_by: string;
  notes?: string | null;
}

export interface CropRiskRule {
  id: string;
  version: number;
  crop_type: string;
  stage_from_day: number;
  stage_to_day: number;
  risk_type: string;
  risk_causes: WeatherConditions;
  condition_duration_days: number;
  severity: CropRiskSeverity;
  advice_text: string;
  advice_reason: string | null;
  follow_up_days: number;
  product_link: string | null;
  source_reference: string | null;
  is_active: boolean;
  updated_at: string;
}

export interface CropQualityTip {
  id: string;
  crop_type: string;
  stage_from_day: number;
  stage_to_day: number;
  tip_text: string;
  tip_reason: string | null;
  rotation_order: number;
}

export interface AlertInstance {
  id: string;
  farmer_field_id: string;
  risk_type: string;
  matched_risk_rule_id: string;

  // Snapshots
  rule_version_snapshot: number;
  severity_snapshot: CropRiskSeverity;
  follow_up_days_snapshot: number;
  advice_text_snapshot: string;
  advice_reason_snapshot: string | null;
  product_link_snapshot: string | null;

  // State machine
  status: AlertInstanceStatus;
  origin_state: AlertOriginState | null;
  no_response_count: number;
  false_alarm_streak_count: number;
  parent_alert_id: string | null;

  // Confidence & Order
  confidence_level: AlertConfidenceLevel;
  order_status: AlertOrderStatus | null;
  order_placed_at: string | null;
  order_delivered_at: string | null;

  // Diagnosis
  diagnosis_started_at: string | null;
  diagnosis_paused_at: string | null;

  // Follow-up & Escalation
  follow_up_due_at: string | null;
  escalated_at: string | null;
  escalation_deadline_at: string | null;

  // Weather snapshots
  weather_snapshot_at_trigger: WeatherSnapshot;
  weather_snapshot_at_response: WeatherSnapshot | null;

  // Timestamps
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  closed_reason: AlertClosedReason | null;
}

export interface DailyAgendaLog {
  id: string;
  farmer_field_id: string;
  date: string; // ISO date, Cairo timezone
  alert_instance_id: string | null;
  quality_tip_id: string | null;
  farmer_feedback_raw: string | null;
  weather_snapshot: WeatherSnapshot;
  created_at: string;
}

export interface RuleReviewFlag {
  id: string;
  farmer_field_id: string;
  risk_type: string;
  matched_risk_rule_id: string;
  streak_count: number;
  reviewed: boolean;
  admin_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
}

// --- State Machine Event Types ---

/** Events that trigger state transitions */
export type AlertEvent =
  | { type: 'RULE_TRIGGERED'; rule: CropRiskRule; weatherSnapshot: WeatherSnapshot }
  | { type: 'FARMER_RESPONSE_OK' }       // "تمام"
  | { type: 'FARMER_RESPONSE_PROBLEM' }    // "في مشكلة"
  | { type: 'FARMER_RESPONSE_WANT_PRODUCT' } // "عايز المنتج"
  | { type: 'NO_RESPONSE_TIMEOUT' }
  | { type: 'RESEND_ALERT' }
  | { type: 'DIAGNOSIS_LEAVE' }
  | { type: 'DIAGNOSIS_RETURN' }
  | { type: 'DIAGNOSIS_PAUSED_TIMEOUT' }   // 72h timeout
  | { type: 'DIAGNOSIS_CONFIRMED_SAME' }   // matches original risk
  | { type: 'DIAGNOSIS_DIFFERENT_PROBLEM'; newRiskType: string; newRiskDetails: string }
  | { type: 'DIAGNOSIS_INCONCLUSIVE' }
  | { type: 'ADDITIONAL_INFO_SENT' }       // farmer sends photo/info after INCONCLUSIVE
  | { type: 'INCONCLUSIVE_TIMEOUT' }       // 48h timeout
  | { type: 'FOLLOW_UP_DUE' }             // follow_up_days_snapshot elapsed
  | { type: 'ORDER_DELIVERED' }
  | { type: 'ORDER_DELIVERY_EXPIRED' }     // 5 days no delivery
  | { type: 'ORDER_CANCELLED' }
  | { type: 'FOLLOW_UP_RESPONSE_IMPROVED' }  // "اتحسن"
  | { type: 'FOLLOW_UP_RESPONSE_SAME' }      // "لسه زي ما هو"
  | { type: 'FOLLOW_UP_RESPONSE_WORSE' }     // "زاد سوء"
  | { type: 'FOLLOW_UP_RESPONSE_CROP_LOSS' } // "فقدت المحصول بالكامل"
  | { type: 'FOLLOW_UP_NO_RESPONSE' }        // 48h timeout on follow-up
  | { type: 'DISTRIBUTOR_RESOLVED' }
  | { type: 'DISTRIBUTOR_DEADLINE_EXCEEDED' }
  | { type: 'HARVEST_EVENT' }                // manual or automatic season end
  | { type: 'ADMIN_RULE_UPDATED' }
  | { type: 'AMBIGUOUS_RESPONSE'; rawText: string }
  | { type: 'AMBIGUOUS_RETRY_SECOND' };      // 2nd ambiguous → default to AWAITING_DIAGNOSIS

/** Result of a state transition */
export interface TransitionResult {
  /** Updated alert instance (partial — only changed fields) */
  updates: Partial<AlertInstance>;
  /** Side effects to execute after DB update */
  sideEffects: SideEffect[];
}

/** Side effects produced by state transitions */
export type SideEffect =
  | { type: 'CREATE_NEW_ALERT'; data: Partial<AlertInstance> }
  | { type: 'CLOSE_ALL_FIELD_ALERTS'; farmerFieldId: string; reason: AlertClosedReason }
  | { type: 'CREATE_RULE_REVIEW_FLAG'; farmerFieldId: string; riskType: string; ruleId: string; streakCount: number }
  | { type: 'SEND_NOTIFICATION'; target: 'farmer' | 'distributor' | 'admin'; message: string; priority?: 'normal' | 'urgent' }
  | { type: 'START_DIAGNOSIS_CHAT'; alertInstanceId: string }
  | { type: 'OPEN_PRODUCT_CATALOG'; cropType: string }
  | { type: 'CAPTURE_WEATHER_SNAPSHOT' }
  | { type: 'LOG_FARMER_JSONB'; data: Record<string, unknown> };
