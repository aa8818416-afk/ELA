-- ==============================================================================
-- Migration: Update Weather Fetch Cron to Run Hourly (0 * * * *)
-- Date: 2026-08-22
-- ==============================================================================

-- 1. Unschedule previous weather cron jobs if they exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-fetch-weather') THEN
        PERFORM cron.unschedule('daily-fetch-weather');
    END IF;

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fetch-weather-hourly') THEN
        PERFORM cron.unschedule('fetch-weather-hourly');
    END IF;

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hourly-fetch-weather') THEN
        PERFORM cron.unschedule('hourly-fetch-weather');
    END IF;
END $$;

-- 2. Schedule Weather Fetch to run every single hour at minute 0
SELECT cron.schedule(
    'hourly-fetch-weather',
    '0 * * * *',
    $$SELECT public.invoke_scheduled_endpoint('/api/cron/fetch-weather');$$
);
