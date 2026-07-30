-- ============================================================
-- Farmer Fields: Draft + Crop History + Abandoned Soft-Delete
-- Migration: 20260730040000_farmer_fields_draft_history_v5.sql
-- ============================================================

-- 1. crop_type nullable للمسودات
ALTER TABLE public.farmer_fields
  ALTER COLUMN crop_type DROP NOT NULL;

-- 2. planting_date nullable للمسودات
ALTER TABLE public.farmer_fields
  ALTER COLUMN planting_date DROP NOT NULL;

-- 3. registration_status — يشمل 'draft', 'active', 'abandoned'
ALTER TABLE public.farmer_fields
  ADD COLUMN IF NOT EXISTS registration_status text NOT NULL DEFAULT 'active'
  CHECK (registration_status IN ('draft', 'active', 'abandoned'));

COMMENT ON COLUMN public.farmer_fields.registration_status IS
  'draft = ناقص. active = مكتمل ومؤكد. abandoned = أُلغي بتأكيد صريح من الفلاح (soft-delete).';

-- 4. الوحدة الأصلية للمساحة
ALTER TABLE public.farmer_fields
  ADD COLUMN IF NOT EXISTS area_unit text DEFAULT 'فدان';

COMMENT ON COLUMN public.farmer_fields.area_unit IS
  'الوحدة الأصلية التي ذكرها الفلاح. area_feddan دائمًا محوّلة للفدان.';

-- 5. JSONB لتتبع الحقول المجموعة في المسودة
ALTER TABLE public.farmer_fields
  ADD COLUMN IF NOT EXISTS draft_collected_fields jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.farmer_fields.draft_collected_fields IS
  '{field_name: bool, crop_type: bool, planting_date: bool, area: bool}';

-- 6. المسودات الموجودة: is_active = false دائمًا
UPDATE public.farmer_fields
  SET is_active = false
  WHERE registration_status = 'draft' AND is_active = true;

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_farmer_fields_draft
  ON public.farmer_fields(registration_status, created_at)
  WHERE registration_status = 'draft';

CREATE INDEX IF NOT EXISTS idx_farmer_fields_abandoned
  ON public.farmer_fields(registration_status, updated_at)
  WHERE registration_status = 'abandoned';

-- ============================================================
-- 8. جدول أرشيف المحاصيل التاريخية
-- ============================================================

CREATE TABLE IF NOT EXISTS public.farmer_field_crop_history (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_field_id uuid        NOT NULL REFERENCES public.farmer_fields(id) ON DELETE CASCADE,
  crop_type       text        NOT NULL,
  planting_date   date,
  archived_at     timestamptz NOT NULL DEFAULT now(),
  replaced_by     text        NOT NULL,
  notes           text
);

COMMENT ON TABLE public.farmer_field_crop_history IS
  'سجل تاريخي للمحاصيل السابقة. يُكتب فيه قبل كل تغيير. لا يُحذف أبدًا.';

CREATE INDEX IF NOT EXISTS idx_crop_history_field
  ON public.farmer_field_crop_history(farmer_field_id, archived_at DESC);

ALTER TABLE public.farmer_field_crop_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'farmer_own_crop_history' AND tablename = 'farmer_field_crop_history'
  ) THEN
    CREATE POLICY "farmer_own_crop_history" ON public.farmer_field_crop_history
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.farmer_fields ff
          WHERE ff.id = farmer_field_crop_history.farmer_field_id
            AND ff.farmer_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'admin_all_crop_history' AND tablename = 'farmer_field_crop_history'
  ) THEN
    CREATE POLICY "admin_all_crop_history" ON public.farmer_field_crop_history
      FOR ALL USING (public.get_my_role() = 'admin');
  END IF;
END $$;

-- ============================================================
-- 9. Atomic RPC: أرشفة + تحديث المحصول في Transaction واحدة
-- ============================================================

CREATE OR REPLACE FUNCTION public.archive_and_change_crop(
  p_field_id      uuid,
  p_farmer_id     uuid,
  p_new_crop      text,
  p_new_planting  date
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_crop     text;
  v_old_planting date;
BEGIN
  -- 1. جلب مع قفل الصف + التحقق من الملكية
  SELECT crop_type, planting_date
    INTO v_old_crop, v_old_planting
    FROM public.farmer_fields
    WHERE id = p_field_id AND farmer_id = p_farmer_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Field % not found or not owned by farmer %', p_field_id, p_farmer_id;
  END IF;

  -- 2. أرشفة القديم (INSERT أولًا)
  INSERT INTO public.farmer_field_crop_history
    (farmer_field_id, crop_type, planting_date, replaced_by)
  VALUES
    (p_field_id, COALESCE(v_old_crop, 'غير محدد'), v_old_planting, p_new_crop);

  -- 3. تحديث بالجديد (UPDATE ثانيًا)
  UPDATE public.farmer_fields
    SET crop_type     = p_new_crop,
        planting_date = p_new_planting,
        updated_at    = now()
    WHERE id = p_field_id;
END;
$$;

-- ============================================================
-- 10. Cleanup دوري للمسودات والمُلغاة
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_stale_fields()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  deleted_count int := 0;
  d int;
BEGIN
  -- حذف المسودات المنتهية (30 يوم)
  DELETE FROM public.farmer_fields
  WHERE registration_status = 'draft'
    AND created_at < now() - interval '30 days';
  GET DIAGNOSTICS d = ROW_COUNT;
  deleted_count := deleted_count + d;

  -- حذف المُلغاة بعد 7 أيام (نافذة استرداد)
  DELETE FROM public.farmer_fields
  WHERE registration_status = 'abandoned'
    AND updated_at < now() - interval '7 days';
  GET DIAGNOSTICS d = ROW_COUNT;
  deleted_count := deleted_count + d;

  RETURN deleted_count;
END;
$$;
