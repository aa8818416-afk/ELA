-- Migration: RLS policies for field activity tables

ALTER TABLE public.field_treatments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_irrigation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_harvest_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_labor_logs ENABLE ROW LEVEL SECURITY;

-- 1. field_treatments RLS
CREATE POLICY "farmer_own_treatments" ON public.field_treatments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.farmer_fields ff
      WHERE ff.id = field_treatments.field_id
        AND ff.farmer_id = auth.uid()
    )
  );

CREATE POLICY "admin_all_treatments" ON public.field_treatments
  FOR ALL USING (public.get_my_role() = 'admin');

-- 2. field_irrigation_logs RLS
CREATE POLICY "farmer_own_irrigation" ON public.field_irrigation_logs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.farmer_fields ff
      WHERE ff.id = field_irrigation_logs.field_id
        AND ff.farmer_id = auth.uid()
    )
  );

CREATE POLICY "admin_all_irrigation" ON public.field_irrigation_logs
  FOR ALL USING (public.get_my_role() = 'admin');

-- 3. field_harvest_records RLS
CREATE POLICY "farmer_own_harvest" ON public.field_harvest_records
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.farmer_fields ff
      WHERE ff.id = field_harvest_records.field_id
        AND ff.farmer_id = auth.uid()
    )
  );

CREATE POLICY "admin_all_harvest" ON public.field_harvest_records
  FOR ALL USING (public.get_my_role() = 'admin');

-- 4. field_labor_logs RLS
CREATE POLICY "farmer_own_labor" ON public.field_labor_logs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.farmer_fields ff
      WHERE ff.id = field_labor_logs.field_id
        AND ff.farmer_id = auth.uid()
    )
  );

CREATE POLICY "admin_all_labor" ON public.field_labor_logs
  FOR ALL USING (public.get_my_role() = 'admin');
