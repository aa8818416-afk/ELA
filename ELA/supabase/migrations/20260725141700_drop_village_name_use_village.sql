-- Migration: توحيد عمود القرية
-- المشكلة: كان في عمودين بنفس الوظيفة:
--   - village_name: كان التسجيل يكتب فيه
--   - village: كانت كل صفحات العرض تقرأ منه
-- الحل: نحذف village_name ونخلي village هو العمود الوحيد
-- ملاحظة: نقل البيانات الموجودة يتم يدوياً

ALTER TABLE distributors
  DROP COLUMN IF EXISTS village_name;
