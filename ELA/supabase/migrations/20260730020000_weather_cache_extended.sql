-- ============================================================
-- Weather Cache Extended: adds daily/hourly forecasts, ET0, dew point, sunrise/sunset
-- Migration: 20260730020000_weather_cache_extended.sql
-- ============================================================

ALTER TABLE public.weather_cache
  ADD COLUMN IF NOT EXISTS dew_point_2m                 numeric,
  ADD COLUMN IF NOT EXISTS et0_fao_evapotranspiration   numeric,
  ADD COLUMN IF NOT EXISTS daily_forecast               jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS hourly_today                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sunrise                      text,
  ADD COLUMN IF NOT EXISTS sunset                       text;

COMMENT ON COLUMN public.weather_cache.dew_point_2m IS
  'نقطة الندى (°م) — تستخدم في حسابات تحذير الفطريات داخل crop_risk_rules';

COMMENT ON COLUMN public.weather_cache.et0_fao_evapotranspiration IS
  'التبخر-نتح المرجعي FAO-56 (مم/يوم) — يوم الجلب الحالي — لحساب توصية الري';

COMMENT ON COLUMN public.weather_cache.daily_forecast IS
  'توقعات 6 ايام (اليوم + 5 قادمة): [{date,wmo,temp_max,temp_min,precip_prob}]';

COMMENT ON COLUMN public.weather_cache.hourly_today IS
  'ساعات اليوم من 6ص الى 8م: [{time,temp,wind,precip_prob}] — يستخدم لتفصيل الفترات وبانر الحر';

COMMENT ON COLUMN public.weather_cache.sunrise IS
  'وقت شروق الشمس لليوم الحالي (ISO8601 string)';

COMMENT ON COLUMN public.weather_cache.sunset IS
  'وقت غروب الشمس لليوم الحالي (ISO8601 string)';
