-- ==============================================================================
-- Migration: Schedule Daily Memory Synthesis and 7-Day Chat Cleanup via pg_cron
-- Date: 2026-08-21
-- ==============================================================================

-- 1. Unschedule old jobs if exist to prevent duplication
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-farmer-memory-synthesis') THEN
        PERFORM cron.unschedule('daily-farmer-memory-synthesis');
    END IF;

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-cleanup-chat-messages-7d') THEN
        PERFORM cron.unschedule('daily-cleanup-chat-messages-7d');
    END IF;
END $$;

-- 2. Schedule Daily Memory Synthesis at 3:00 AM Cairo time (01:00 UTC)
-- Invokes Next.js /api/cron/memory-synthesis endpoint via pg_net
SELECT cron.schedule(
    'daily-farmer-memory-synthesis',
    '0 1 * * *',
    $$SELECT public.invoke_scheduled_endpoint('/api/cron/memory-synthesis');$$
);

-- 3. Schedule 7-Day Chat Messages Cleanup at 3:30 AM Cairo time (01:30 UTC)
-- Runs the internal SQL function to clean up messages older than 7 days
SELECT cron.schedule(
    'daily-cleanup-chat-messages-7d',
    '30 1 * * *',
    $$SELECT public.cleanup_old_chat_messages_7d();$$
);
