-- Migration: farmer_memory table & enum

CREATE TYPE public.farmer_memory_category AS ENUM (
  'budget_level',
  'risk_tolerance',
  'communication_style',
  'crop_preference',
  'trusted_source'
);

CREATE TYPE public.farmer_memory_confidence AS ENUM (
  'low',
  'medium',
  'high'
);

CREATE TABLE public.farmer_memory (
  id            uuid                          PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id     uuid                          NOT NULL REFERENCES public.farmers(profile_id) ON DELETE CASCADE,
  category      public.farmer_memory_category NOT NULL,
  fact          text                          NOT NULL,
  source        text                          DEFAULT 'conversation',
  confidence    public.farmer_memory_confidence,
  is_active     boolean                       NOT NULL DEFAULT true,
  superseded_by uuid                          REFERENCES public.farmer_memory(id) ON DELETE SET NULL,
  created_at    timestamptz                   NOT NULL DEFAULT now()
);

CREATE INDEX idx_farmer_memory_farmer_category ON public.farmer_memory(farmer_id, category) WHERE is_active = true;

ALTER TABLE public.farmer_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "farmer_own_memory" ON public.farmer_memory
  FOR ALL USING (farmer_id = auth.uid());

CREATE POLICY "admin_all_memory" ON public.farmer_memory
  FOR ALL USING (public.get_my_role() = 'admin');
