-- ============================================================
-- Farmers & Farmer Fields Extensions
-- Migration: 20260730030000_farmer_fields_extended.sql
-- ============================================================

-- 1. إضافة المحافظة والمركز المبدئي لجدول الفلاحين (للتخصيص الأولي)
ALTER TABLE public.farmers
  ADD COLUMN IF NOT EXISTS default_governorate text,
  ADD COLUMN IF NOT EXISTS default_center      text;

-- 2. إضافة حقول التفاصيل الإدارية والفيزيائية لجدول حقول الفلاحين (farmer_fields)
ALTER TABLE public.farmer_fields
  ADD COLUMN IF NOT EXISTS governorate     text,
  ADD COLUMN IF NOT EXISTS center          text,
  ADD COLUMN IF NOT EXISTS soil_type       text,
  ADD COLUMN IF NOT EXISTS irrigation_type text;

COMMENT ON COLUMN public.farmer_fields.governorate IS 'اسم المحافظة التابع لها الحقل';
COMMENT ON COLUMN public.farmer_fields.center IS 'اسم المركز التابع له الحقل وتُحدد إحداثيات الطقس بناء عليه';
COMMENT ON COLUMN public.farmer_fields.soil_type IS 'نوع تربة الحقل (طينية، رملية، صفراء)';
COMMENT ON COLUMN public.farmer_fields.irrigation_type IS 'طريقة الري (غمر، تنقيط، رش)';
