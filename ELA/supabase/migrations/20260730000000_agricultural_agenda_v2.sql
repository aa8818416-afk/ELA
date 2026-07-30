-- ============================================================
-- AGRICULTURAL ALERT AGENDA SYSTEM v2.0
-- Migration: Enums, Tables, Indexes, RLS Policies
-- ============================================================

-- ============================================================
-- 1. CUSTOM ENUM TYPES
-- ============================================================

-- Severity levels for crop risk rules
CREATE TYPE public.crop_risk_severity AS ENUM (
  'critical',
  'moderate',
  'preventive'
);

-- Alert instance status — 17 states (ESCALATED_TO_DISTRIBUTOR is an event, not a stored state)
-- RULE_FLAGGED_FOR_REVIEW is tracked in separate admin table rule_review_flags
CREATE TYPE public.alert_instance_status AS ENUM (
  'NO_ALERT',
  'SENT',
  'CLOSED_FALSE_ALARM',
  'AWAITING_DIAGNOSIS',
  'DIAGNOSIS_PAUSED',
  'CONFIRMED_ACTIVE',
  'MISDIAGNOSED_ORIGINAL',
  'INCONCLUSIVE',
  'PRODUCT_ORDERED',
  'NO_RESPONSE',
  'AUTO_CLOSED_NO_RESPONSE',
  'FOLLOW_UP_SENT',
  'RESOLVED',
  'CROP_LOSS',
  'CLOSED_SEASON_END',
  'AMBIGUOUS_RETRY',
  'AWAITING_DISTRIBUTOR_ACTION'
);

-- Origin state for NO_RESPONSE — determines which message to re-send
CREATE TYPE public.alert_origin_state AS ENUM (
  'SENT',
  'FOLLOW_UP_SENT',
  'INCONCLUSIVE',
  'AWAITING_DIAGNOSIS'
);

-- Confidence level of the alert
CREATE TYPE public.alert_confidence_level AS ENUM (
  'weather_based',
  'farmer_confirmed',
  'purchase_confirmed',
  'unconfirmed'
);

-- Order status within alert lifecycle
CREATE TYPE public.alert_order_status AS ENUM (
  'ordered',
  'delivered',
  'cancelled',
  'expired'
);

-- Reason for closing an alert
CREATE TYPE public.alert_closed_reason AS ENUM (
  'false_alarm',
  'resolved',
  'auto_closed_no_response',
  'season_end',
  'crop_loss',
  'superseded_by_higher_severity'
);

-- ============================================================
-- 2. PREREQUISITE TABLE: farmer_fields
--    Links a farmer to a specific plot of land with crop + planting info
-- ============================================================

CREATE TABLE public.farmer_fields (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id       uuid        NOT NULL REFERENCES public.farmers(profile_id) ON DELETE CASCADE,
  field_name      text,
  crop_type       text        NOT NULL,
  planting_date   date        NOT NULL,
  latitude        double precision,
  longitude       double precision,
  area_feddan     numeric,
  is_active       boolean     NOT NULL DEFAULT true,
  notifications_enabled boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.farmer_fields.notifications_enabled IS
  'Opt-out control (§5.11): when false, preventive/moderate alerts are suppressed entirely; critical alerts still appear in-app without Push';

-- ============================================================
-- 3. STATIC TABLE: crop_risk_rules (Knowledge Base — versioned)
-- ============================================================

CREATE TABLE public.crop_risk_rules (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  version                 int         NOT NULL DEFAULT 1,
  crop_type               text        NOT NULL,
  stage_from_day          int         NOT NULL,
  stage_to_day            int         NOT NULL,
  risk_type               text        NOT NULL,
  risk_causes             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  condition_duration_days  int         NOT NULL DEFAULT 1,
  severity                public.crop_risk_severity NOT NULL,
  advice_text             text        NOT NULL,
  advice_reason           text,
  follow_up_days          int         NOT NULL DEFAULT 7,
  product_link            uuid        REFERENCES public.products(id) ON DELETE SET NULL,
  source_reference        text,
  is_active               boolean     NOT NULL DEFAULT true,
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT stage_range_valid CHECK (stage_from_day <= stage_to_day),
  CONSTRAINT condition_duration_positive CHECK (condition_duration_days >= 1),
  CONSTRAINT follow_up_days_positive CHECK (follow_up_days >= 1)
);

COMMENT ON COLUMN public.crop_risk_rules.risk_type IS
  'Semantic key for risk grouping (e.g. late_blight, stem_borer). Used for matching "same risk" across rules (§5.9)';
COMMENT ON COLUMN public.crop_risk_rules.risk_causes IS
  'Weather conditions: {humidity_min, humidity_max, temp_min, temp_max, wind_min, wind_max, radiation_min, radiation_max}';
COMMENT ON COLUMN public.crop_risk_rules.version IS
  'Auto-incremented on each edit. Old versions kept for snapshot integrity (§0)';

-- ============================================================
-- 4. STATIC TABLE: crop_quality_tips
-- ============================================================

CREATE TABLE public.crop_quality_tips (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_type       text        NOT NULL,
  stage_from_day  int         NOT NULL,
  stage_to_day    int         NOT NULL,
  tip_text        text        NOT NULL,
  tip_reason      text,
  rotation_order  int         NOT NULL DEFAULT 0,

  CONSTRAINT tip_stage_range_valid CHECK (stage_from_day <= stage_to_day)
);

COMMENT ON COLUMN public.crop_quality_tips.rotation_order IS
  'Display order for rotation when multiple tips match same stage range (§5.6)';

-- ============================================================
-- 5. DYNAMIC TABLE: alert_instances (Live state — one row per alert lifecycle)
-- ============================================================

CREATE TABLE public.alert_instances (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_field_id             uuid        NOT NULL REFERENCES public.farmer_fields(id) ON DELETE CASCADE,
  risk_type                   text        NOT NULL,
  matched_risk_rule_id        uuid        NOT NULL REFERENCES public.crop_risk_rules(id) ON DELETE RESTRICT,

  -- Snapshots frozen at creation time (Principle §0)
  rule_version_snapshot       int         NOT NULL,
  severity_snapshot           public.crop_risk_severity NOT NULL,
  follow_up_days_snapshot     int         NOT NULL,
  advice_text_snapshot        text        NOT NULL,
  advice_reason_snapshot      text,
  product_link_snapshot       uuid        REFERENCES public.products(id) ON DELETE SET NULL,

  -- State machine
  status                      public.alert_instance_status NOT NULL DEFAULT 'SENT',
  origin_state                public.alert_origin_state,
  no_response_count           int         NOT NULL DEFAULT 0,
  false_alarm_streak_count    int         NOT NULL DEFAULT 0,
  parent_alert_id             uuid        REFERENCES public.alert_instances(id) ON DELETE SET NULL,

  -- Confidence & Order tracking
  confidence_level            public.alert_confidence_level NOT NULL DEFAULT 'weather_based',
  order_status                public.alert_order_status,
  order_placed_at             timestamptz,
  order_delivered_at          timestamptz,

  -- Diagnosis tracking
  diagnosis_started_at        timestamptz,
  diagnosis_paused_at         timestamptz,

  -- Follow-up & Escalation
  follow_up_due_at            timestamptz,
  escalated_at                timestamptz,
  escalation_deadline_at      timestamptz,

  -- Weather snapshots
  weather_snapshot_at_trigger jsonb       NOT NULL DEFAULT '{}'::jsonb,
  weather_snapshot_at_response jsonb,

  -- Timestamps
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  closed_at                   timestamptz,
  closed_reason               public.alert_closed_reason
);

COMMENT ON COLUMN public.alert_instances.risk_type IS
  'Copied from rule at creation. Used for "same risk" matching (§5.9) — NOT matched_risk_rule_id';
COMMENT ON COLUMN public.alert_instances.origin_state IS
  'Source of current NO_RESPONSE state — determines which message to re-send (§4 transitions 6/6b/6c)';
COMMENT ON COLUMN public.alert_instances.false_alarm_streak_count IS
  'Per (farmer_field_id + risk_type) streak. Auto-resets on any non-"tamam" outcome (§5.7)';
COMMENT ON COLUMN public.alert_instances.weather_snapshot_at_response IS
  'Captured ONCE at final farmer response/diagnosis decision moment, NOT at every intermediate chat message';

-- ============================================================
-- 6. DYNAMIC TABLE: daily_agenda_log (Append-Only — NEVER modified/deleted)
-- ============================================================

CREATE TABLE public.daily_agenda_log (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_field_id     uuid        NOT NULL REFERENCES public.farmer_fields(id) ON DELETE CASCADE,
  date                date        NOT NULL,
  alert_instance_id   uuid        REFERENCES public.alert_instances(id) ON DELETE SET NULL,
  quality_tip_id      uuid        REFERENCES public.crop_quality_tips(id) ON DELETE SET NULL,
  farmer_feedback_raw text,
  weather_snapshot    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),

  -- One row per field per day — no gaps
  CONSTRAINT daily_log_unique_field_date UNIQUE (farmer_field_id, date)
);

COMMENT ON TABLE public.daily_agenda_log IS
  'Permanent append-only record. One row per field per day regardless of alerts. Foundation for season/harvest database. NEVER cleaned or deleted.';
COMMENT ON COLUMN public.daily_agenda_log.alert_instance_id IS
  'Links to active open alert for this field on this day. NULL only when no alert is open. Stays linked across consecutive days while alert remains open.';

-- ============================================================
-- 7. ADMIN TABLE: rule_review_flags (Separated from farmer alert status)
-- ============================================================

CREATE TABLE public.rule_review_flags (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_field_id       uuid        NOT NULL REFERENCES public.farmer_fields(id) ON DELETE CASCADE,
  risk_type             text        NOT NULL,
  matched_risk_rule_id  uuid        NOT NULL REFERENCES public.crop_risk_rules(id) ON DELETE RESTRICT,
  streak_count          int         NOT NULL DEFAULT 3,
  reviewed              boolean     NOT NULL DEFAULT false,
  admin_notes           text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  reviewed_at           timestamptz
);

COMMENT ON TABLE public.rule_review_flags IS
  'Administrative table — created when false_alarm_streak_count reaches 3 for same field+risk_type (§4 transition 2). Does NOT affect farmer alert status.';

-- ============================================================
-- 8. INDEXES (Performance-critical queries)
-- ============================================================

-- farmer_fields
CREATE INDEX idx_farmer_fields_farmer_id ON public.farmer_fields(farmer_id);
CREATE INDEX idx_farmer_fields_active ON public.farmer_fields(farmer_id) WHERE is_active = true;

-- crop_risk_rules — lookup by crop, stage, and active status
CREATE INDEX idx_crop_risk_rules_lookup ON public.crop_risk_rules(crop_type, is_active)
  WHERE is_active = true;
CREATE INDEX idx_crop_risk_rules_risk_type ON public.crop_risk_rules(risk_type);

-- crop_quality_tips — lookup by crop and stage
CREATE INDEX idx_crop_quality_tips_lookup ON public.crop_quality_tips(crop_type, stage_from_day, stage_to_day);

-- alert_instances — the most critical indexes
-- Find open alerts for a field by risk_type (transitions 1/1a/1b/1c)
CREATE INDEX idx_alert_open_by_field_risk ON public.alert_instances(farmer_field_id, risk_type)
  WHERE status NOT IN ('CLOSED_FALSE_ALARM', 'AUTO_CLOSED_NO_RESPONSE', 'RESOLVED', 'CROP_LOSS', 'CLOSED_SEASON_END', 'MISDIAGNOSED_ORIGINAL');

-- Find alerts awaiting farmer response (timeout checks)
CREATE INDEX idx_alert_awaiting_response ON public.alert_instances(status, updated_at)
  WHERE status IN ('SENT', 'FOLLOW_UP_SENT', 'INCONCLUSIVE');

-- Find paused diagnoses (transition 9b — 72h timeout)
CREATE INDEX idx_alert_diagnosis_paused ON public.alert_instances(status, diagnosis_paused_at)
  WHERE status = 'DIAGNOSIS_PAUSED';

-- Find pending distributor actions (transition 21b — deadline check)
CREATE INDEX idx_alert_awaiting_distributor ON public.alert_instances(status, escalation_deadline_at)
  WHERE status = 'AWAITING_DISTRIBUTOR_ACTION';

-- Find orders pending delivery (transition 15d — 5 day expiry)
CREATE INDEX idx_alert_product_ordered ON public.alert_instances(status, order_placed_at)
  WHERE status = 'PRODUCT_ORDERED' AND order_status = 'ordered';

-- Find confirmed active alerts awaiting follow-up (transitions 15a/15c)
CREATE INDEX idx_alert_follow_up_due ON public.alert_instances(status, follow_up_due_at)
  WHERE status IN ('CONFIRMED_ACTIVE', 'PRODUCT_ORDERED') AND follow_up_due_at IS NOT NULL;

-- All open alerts for a field (for CROP_LOSS cascade close — transition 19)
CREATE INDEX idx_alert_open_by_field ON public.alert_instances(farmer_field_id)
  WHERE status NOT IN ('CLOSED_FALSE_ALARM', 'AUTO_CLOSED_NO_RESPONSE', 'RESOLVED', 'CROP_LOSS', 'CLOSED_SEASON_END', 'MISDIAGNOSED_ORIGINAL');

-- daily_agenda_log — daily evaluation lookups
CREATE INDEX idx_daily_log_field_date ON public.daily_agenda_log(farmer_field_id, date DESC);
CREATE INDEX idx_daily_log_date ON public.daily_agenda_log(date);

-- rule_review_flags — admin dashboard
CREATE INDEX idx_rule_review_unreviewed ON public.rule_review_flags(reviewed, created_at)
  WHERE reviewed = false;

-- ============================================================
-- 9. AUTO-UPDATE updated_at TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_farmer_fields
  BEFORE UPDATE ON public.farmer_fields
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_updated_at_crop_risk_rules
  BEFORE UPDATE ON public.crop_risk_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_updated_at_alert_instances
  BEFORE UPDATE ON public.alert_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 10. APPEND-ONLY PROTECTION FOR daily_agenda_log
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_daily_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'daily_agenda_log is append-only. Updates and deletes are not permitted.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_append_only_daily_log
  BEFORE UPDATE OR DELETE ON public.daily_agenda_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_daily_log_mutation();

-- ============================================================
-- 11. ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE public.farmer_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_risk_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_quality_tips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_agenda_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rule_review_flags ENABLE ROW LEVEL SECURITY;

-- farmer_fields: farmers see own fields, distributors see their farmers' fields, admin sees all
CREATE POLICY "farmer_own_fields" ON public.farmer_fields
  FOR ALL USING (farmer_id = auth.uid());

CREATE POLICY "distributor_farmer_fields" ON public.farmer_fields
  FOR SELECT USING (
    public.get_my_role() = 'distributor'
    AND EXISTS (
      SELECT 1 FROM public.farmers f
      WHERE f.profile_id = farmer_fields.farmer_id
        AND f.distributor_id = auth.uid()
    )
  );

CREATE POLICY "admin_all_farmer_fields" ON public.farmer_fields
  FOR ALL USING (public.get_my_role() = 'admin');

-- crop_risk_rules: readable by all authenticated, writable by admin only
CREATE POLICY "anyone_read_risk_rules" ON public.crop_risk_rules
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "admin_manage_risk_rules" ON public.crop_risk_rules
  FOR ALL USING (public.get_my_role() = 'admin');

-- crop_quality_tips: readable by all authenticated, writable by admin only
CREATE POLICY "anyone_read_quality_tips" ON public.crop_quality_tips
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "admin_manage_quality_tips" ON public.crop_quality_tips
  FOR ALL USING (public.get_my_role() = 'admin');

-- alert_instances: farmers see own alerts, distributors see their farmers', admin sees all
CREATE POLICY "farmer_own_alerts" ON public.alert_instances
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.farmer_fields ff
      WHERE ff.id = alert_instances.farmer_field_id
        AND ff.farmer_id = auth.uid()
    )
  );

CREATE POLICY "distributor_farmer_alerts" ON public.alert_instances
  FOR SELECT USING (
    public.get_my_role() = 'distributor'
    AND EXISTS (
      SELECT 1 FROM public.farmer_fields ff
      JOIN public.farmers f ON f.profile_id = ff.farmer_id
      WHERE ff.id = alert_instances.farmer_field_id
        AND f.distributor_id = auth.uid()
    )
  );

CREATE POLICY "admin_all_alerts" ON public.alert_instances
  FOR ALL USING (public.get_my_role() = 'admin');

-- daily_agenda_log: farmers see own logs, distributors see their farmers', admin sees all
CREATE POLICY "farmer_own_daily_log" ON public.daily_agenda_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.farmer_fields ff
      WHERE ff.id = daily_agenda_log.farmer_field_id
        AND ff.farmer_id = auth.uid()
    )
  );

CREATE POLICY "distributor_farmer_daily_log" ON public.daily_agenda_log
  FOR SELECT USING (
    public.get_my_role() = 'distributor'
    AND EXISTS (
      SELECT 1 FROM public.farmer_fields ff
      JOIN public.farmers f ON f.profile_id = ff.farmer_id
      WHERE ff.id = daily_agenda_log.farmer_field_id
        AND f.distributor_id = auth.uid()
    )
  );

CREATE POLICY "admin_all_daily_log" ON public.daily_agenda_log
  FOR ALL USING (public.get_my_role() = 'admin');

-- rule_review_flags: admin only
CREATE POLICY "admin_only_review_flags" ON public.rule_review_flags
  FOR ALL USING (public.get_my_role() = 'admin');

-- ============================================================
-- 12. ATOMIC RPC FUNCTION FOR CROP_LOSS CASCADE CLOSE (§4 transition 19)
-- Ensures single DB transaction execution for cascade closing all field alerts
-- ============================================================

CREATE OR REPLACE FUNCTION public.close_all_field_alerts_on_crop_loss(
  p_farmer_field_id UUID,
  p_closed_at TIMESTAMPTZ DEFAULT now(),
  p_weather_snapshot JSONB DEFAULT '{}'::jsonb
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_count INT;
BEGIN
  UPDATE public.alert_instances
  SET status = 'CROP_LOSS',
      closed_reason = 'crop_loss',
      closed_at = p_closed_at,
      weather_snapshot_at_response = p_weather_snapshot
  WHERE farmer_field_id = p_farmer_field_id
    AND status NOT IN (
      'CLOSED_FALSE_ALARM',
      'AUTO_CLOSED_NO_RESPONSE',
      'RESOLVED',
      'CROP_LOSS',
      'CLOSED_SEASON_END',
      'MISDIAGNOSED_ORIGINAL'
    );

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$;
