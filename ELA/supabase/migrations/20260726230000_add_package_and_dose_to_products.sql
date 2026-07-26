-- ============================================================
-- Migration: Add Package Size & Dose Fields to products
-- Description: يضيف حقول حجم العبوة ونوع الجرعة ومقدارها
--              لجدول products لتغذية حسابات الـ AI بشكل دقيق
-- ============================================================

-- حقل حجم العبوة (Package Size) بالرقم فقط (مثلاً: 250)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS package_size numeric NULL;

-- حقل وحدة حجم العبوة (مثلاً: جرام، سم3، لتر)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS package_unit text NULL;

-- حقل نوع الجرعة: إما 'per_feddan' أو 'per_100L'
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS dose_unit text NULL
  CONSTRAINT products_dose_unit_check CHECK (
    dose_unit IS NULL OR dose_unit IN ('per_feddan', 'per_100L')
  );

-- حقل مقدار الجرعة (مثلاً: 500 للفدان، أو 50 لكل 100 لتر ماء)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS dose_amount numeric NULL;

-- تعليق توضيحي على الأعمدة للمطورين
COMMENT ON COLUMN public.products.package_size IS 'حجم العبوة بالأرقام فقط (مثال: 250)';
COMMENT ON COLUMN public.products.package_unit IS 'وحدة حجم العبوة: جرام، سم3، لتر';
COMMENT ON COLUMN public.products.dose_unit IS 'نوع الجرعة: per_feddan = للفدان, per_100L = لكل 100 لتر ماء';
COMMENT ON COLUMN public.products.dose_amount IS 'مقدار الجرعة الموصى بها بالرقم (مثال: 500 أو 50)';
