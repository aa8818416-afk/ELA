-- ==============================================================================
-- Migration: Remove Obsolete Draft Cleanup Cron Job
-- Date: 2026-08-22
-- ==============================================================================

-- Unschedule obsolete cleanup-drafts cron job
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-cleanup-drafts') THEN
        PERFORM cron.unschedule('daily-cleanup-drafts');
    END IF;
END $$;
