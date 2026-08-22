-- ==============================================================================
-- Migration: Offset Weather Fetch Cron Timing (7 * * * *) to avoid global peak
-- Date: 2026-08-22
-- ==============================================================================

-- 1. Unschedule previous weather cron jobs
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hourly-fetch-weather') THEN
        PERFORM cron.unschedule('hourly-fetch-weather');
    END IF;

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-fetch-weather') THEN
        PERFORM cron.unschedule('daily-fetch-weather');
    END IF;

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fetch-weather-hourly') THEN
        PERFORM cron.unschedule('fetch-weather-hourly');
    END IF;
END $$;

-- 2. Schedule Weather Fetch at minute 7 of every hour (e.g. 01:07, 02:07, 03:07...)
SELECT cron.schedule(
    'hourly-fetch-weather',
    '7 * * * *',
    $$SELECT public.invoke_scheduled_endpoint('/api/cron/fetch-weather');$$
);
