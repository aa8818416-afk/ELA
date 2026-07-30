-- ============================================================
-- Weather Cache Table: stores fetched Open-Meteo data every 6h
-- ============================================================

CREATE TABLE public.weather_cache (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  location_name         text        NOT NULL,
  latitude              double precision NOT NULL,
  longitude             double precision NOT NULL,
  temperature_2m        numeric,
  relative_humidity_2m  numeric,
  wind_speed_10m        numeric,
  weather_code          int,
  apparent_temperature  numeric,
  precipitation         numeric,
  fetched_at            timestamptz NOT NULL DEFAULT now(),
  raw_data              jsonb       NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT weather_cache_unique_location UNIQUE (latitude, longitude)
);

COMMENT ON TABLE public.weather_cache IS
  'Cache for Open-Meteo weather data. Refreshed every 6 hours via GitHub Actions cron. One row per location (upsert on lat/lon).';

CREATE INDEX idx_weather_cache_location ON public.weather_cache(latitude, longitude);
CREATE INDEX idx_weather_cache_fetched_at ON public.weather_cache(fetched_at DESC);

ALTER TABLE public.weather_cache ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read weather cache (public weather data)
CREATE POLICY "anyone_read_weather" ON public.weather_cache
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only service role can write (via cron API route)
CREATE POLICY "service_write_weather" ON public.weather_cache
  FOR ALL USING (auth.role() = 'service_role');
