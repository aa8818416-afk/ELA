-- ==============================================================================
-- Migration: Configure Production URL & Complete pg_cron Scheduling for ELA
-- Production URL: https://ela-one.vercel.app
-- ==============================================================================

-- 1. Ensure app_cron_config exists and update with actual production URL
CREATE TABLE IF NOT EXISTS public.app_cron_config (
    id TEXT PRIMARY KEY DEFAULT 'default',
    app_base_url TEXT NOT NULL DEFAULT 'https://ela-one.vercel.app',
    cron_secret TEXT DEFAULT '',
    weather_cron_enabled BOOLEAN NOT NULL DEFAULT true,
    agenda_cron_enabled BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Update the default row with the real production URL
INSERT INTO public.app_cron_config (id, app_base_url, cron_secret, updated_at)
VALUES ('default', 'https://ela-one.vercel.app', '', now())
ON CONFLICT (id) DO UPDATE 
SET app_base_url = 'https://ela-one.vercel.app',
    updated_at = now();

-- 2. Clean up any existing scheduled jobs to prevent duplications
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-reset-keys') THEN
        PERFORM cron.unschedule('daily-reset-keys');
    END IF;

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-farmer-memory-synthesis') THEN
        PERFORM cron.unschedule('daily-farmer-memory-synthesis');
    END IF;

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-cleanup-chat-messages-7d') THEN
        PERFORM cron.unschedule('daily-cleanup-chat-messages-7d');
    END IF;

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-fetch-weather') THEN
        PERFORM cron.unschedule('daily-fetch-weather');
    END IF;

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-cleanup-drafts') THEN
        PERFORM cron.unschedule('daily-cleanup-drafts');
    END IF;
END $$;

-- 3. Schedule all background cron jobs via pg_cron (Independent of Vercel Hobby Limits)

-- (A) Reset API keys & model limits at 00:00 UTC (2:00 AM Cairo)
SELECT cron.schedule(
    'daily-reset-keys',
    '0 0 * * *',
    $$SELECT public.invoke_scheduled_endpoint('/api/cron/reset-keys');$$
);

-- (B) Daily Farmer Memory & Chat Synthesis at 01:00 UTC (3:00 AM Cairo)
SELECT cron.schedule(
    'daily-farmer-memory-synthesis',
    '0 1 * * *',
    $$SELECT public.invoke_scheduled_endpoint('/api/cron/memory-synthesis');$$
);

-- (C) Cleanup Chat Messages Older Than 7 Days at 01:30 UTC (3:30 AM Cairo)
SELECT cron.schedule(
    'daily-cleanup-chat-messages-7d',
    '30 1 * * *',
    $$SELECT public.cleanup_old_chat_messages_7d();$$
);

-- (D) Fetch Weather Data every 6 hours (00:00, 06:00, 12:00, 18:00 UTC)
SELECT cron.schedule(
    'daily-fetch-weather',
    '0 */6 * * *',
    $$SELECT public.invoke_scheduled_endpoint('/api/cron/fetch-weather');$$
);

-- (E) Cleanup Draft Fields at 02:00 UTC (4:00 AM Cairo)
SELECT cron.schedule(
    'daily-cleanup-drafts',
    '0 2 * * *',
    $$SELECT public.invoke_scheduled_endpoint('/api/cron/cleanup-drafts');$$
);
