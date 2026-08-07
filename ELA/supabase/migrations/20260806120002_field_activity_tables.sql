-- Migration: 4 field activity tables (treatments, irrigation, harvest, labor) with status enum

CREATE TYPE public.field_activity_status AS ENUM (
  'pending_outcome',
  'completed'
);

CREATE TYPE public.field_outcome_rating AS ENUM (
  'ممتاز',
  'متوسط',
  'فاشل'
);

CREATE TYPE public.field_treatment_category AS ENUM (
  'مبيد',
  'سماد'
);

-- 1. field_treatments
CREATE TABLE public.field_treatments (
  id                  uuid                          PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id            uuid                          NOT NULL REFERENCES public.farmer_fields(id) ON DELETE CASCADE,
  activity_date       timestamptz,
  category            public.field_treatment_category,
  product_id          uuid                          REFERENCES public.products(id) ON DELETE SET NULL,
  product_name_text   text,
  dosage              numeric,
  dosage_unit         text,
  unit_price          numeric,
  pest_disease_id     uuid                          REFERENCES public.pests_diseases(id) ON DELETE SET NULL,
  symptom_description text,
  weather_snapshot    jsonb,
  status              public.field_activity_status  NOT NULL DEFAULT 'pending_outcome',
  outcome_rating      public.field_outcome_rating,
  notes               text,
  photo_url           text,
  created_at          timestamptz                   NOT NULL DEFAULT now()
);

-- 2. field_irrigation_logs
CREATE TABLE public.field_irrigation_logs (
  id               uuid                         PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id         uuid                         NOT NULL REFERENCES public.farmer_fields(id) ON DELETE CASCADE,
  activity_date    timestamptz,
  description      text,
  weather_snapshot jsonb,
  status           public.field_activity_status NOT NULL DEFAULT 'pending_outcome',
  outcome_rating   public.field_outcome_rating,
  notes            text,
  created_at       timestamptz                  NOT NULL DEFAULT now()
);

-- 3. field_harvest_records
CREATE TABLE public.field_harvest_records (
  id             uuid                         PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id       uuid                         NOT NULL REFERENCES public.farmer_fields(id) ON DELETE CASCADE,
  activity_date  timestamptz,
  quantity       numeric,
  quantity_unit  text,
  unit_price     numeric,
  description    text,
  status         public.field_activity_status NOT NULL DEFAULT 'pending_outcome',
  outcome_rating public.field_outcome_rating,
  notes          text,
  created_at     timestamptz                  NOT NULL DEFAULT now()
);

-- 4. field_labor_logs
CREATE TABLE public.field_labor_logs (
  id              uuid                         PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id        uuid                         NOT NULL REFERENCES public.farmer_fields(id) ON DELETE CASCADE,
  activity_date   timestamptz,
  worker_count    integer,
  contractor_name text,
  unit_price      numeric,
  status          public.field_activity_status NOT NULL DEFAULT 'pending_outcome',
  outcome_rating  public.field_outcome_rating,
  notes           text,
  created_at      timestamptz                  NOT NULL DEFAULT now()
);

-- Indexes for pending status queries
CREATE INDEX idx_field_treatments_pending ON public.field_treatments(field_id, status) WHERE status = 'pending_outcome';
CREATE INDEX idx_field_irrigation_pending ON public.field_irrigation_logs(field_id, status) WHERE status = 'pending_outcome';
CREATE INDEX idx_field_harvest_pending ON public.field_harvest_records(field_id, status) WHERE status = 'pending_outcome';
CREATE INDEX idx_field_labor_pending ON public.field_labor_logs(field_id, status) WHERE status = 'pending_outcome';
