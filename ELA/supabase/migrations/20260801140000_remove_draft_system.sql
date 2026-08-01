-- ============================================================
-- Remove Draft System from Farmer Fields
-- Migration: 20260801140000_remove_draft_system.sql
-- ============================================================
-- المطلوب: إزالة نظام المسودة بالكامل.
-- التسجيل يصبح "كله أو لا شيء" — لا مسودات، لا حفظ جزئي.
-- ============================================================

-- 1. حذف المسودات الحالية (بيانات ناقصة لا قيمة لها)
DELETE FROM public.farmer_fields
WHERE registration_status = 'draft';

-- 2. حذف المُلغاة أيضاً (abandoned) إن وُجدت
DELETE FROM public.farmer_fields
WHERE registration_status = 'abandoned';

-- 3. إعادة crop_type إلى NOT NULL (لا يُسمح بأرض بدون محصول)
ALTER TABLE public.farmer_fields
  ALTER COLUMN crop_type SET NOT NULL;

-- 4. إعادة planting_date إلى NOT NULL (لا يُسمح بأرض بدون تاريخ زراعة)
ALTER TABLE public.farmer_fields
  ALTER COLUMN planting_date SET NOT NULL;

-- 5. حذف عمود registration_status (لم يعد له وجود)
ALTER TABLE public.farmer_fields
  DROP COLUMN IF EXISTS registration_status;

-- 6. حذف عمود draft_collected_fields (لم يعد له وجود)
ALTER TABLE public.farmer_fields
  DROP COLUMN IF EXISTS draft_collected_fields;

-- 7. حذف indexes الخاصة بالمسودة والمُلغاة
DROP INDEX IF EXISTS public.idx_farmer_fields_draft;
DROP INDEX IF EXISTS public.idx_farmer_fields_abandoned;

-- 8. حذف دالة تنظيف المسودات (لم تعد مطلوبة)
DROP FUNCTION IF EXISTS public.cleanup_stale_fields();

-- ============================================================
-- النتيجة: farmer_fields تحتوي فقط على أراضٍ نشطة ومكتملة.
-- is_active = true يعني الأرض مُفعّلة، false يعني موقوفة (لا محذوفة).
-- ============================================================
