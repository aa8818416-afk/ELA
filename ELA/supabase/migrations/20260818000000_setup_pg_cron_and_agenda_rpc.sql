-- ==============================================================================
-- Migration: Enable pg_cron and pg_net extensions for automated tasks
-- Date: 2026-08-18
-- ==============================================================================

-- 1. Enable pg_net extension (for async HTTP requests from DB)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Enable pg_cron extension (for cron scheduling inside Postgres)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Grant permissions on cron and net schema
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- 3. Create a helper table to store app configuration for cron jobs (like base URL & secret)
CREATE TABLE IF NOT EXISTS public.app_cron_config (
    id TEXT PRIMARY KEY DEFAULT 'default',
    app_base_url TEXT NOT NULL DEFAULT 'https://ela-agri.vercel.app',
    cron_secret TEXT DEFAULT '',
    weather_cron_enabled BOOLEAN NOT NULL DEFAULT true,
    agenda_cron_enabled BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on app_cron_config (service role / postgres only)
ALTER TABLE public.app_cron_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access to cron config"
    ON public.app_cron_config
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Insert default row if not exists
INSERT INTO public.app_cron_config (id, app_base_url, cron_secret)
VALUES ('default', 'https://ela-agri.vercel.app', '')
ON CONFLICT (id) DO NOTHING;

-- 4. RPC Function to invoke Next.js Cron APIs directly via pg_net
CREATE OR REPLACE FUNCTION public.invoke_scheduled_endpoint(endpoint_path TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_base_url TEXT;
    v_secret TEXT;
    v_full_url TEXT;
    v_headers JSONB;
BEGIN
    SELECT app_base_url, cron_secret INTO v_base_url, v_secret FROM public.app_cron_config WHERE id = 'default';
    IF v_base_url IS NULL THEN
        v_base_url := 'https://ela-agri.vercel.app';
    END IF;

    v_full_url := rtrim(v_base_url, '/') || endpoint_path;
    
    IF v_secret IS NOT NULL AND length(v_secret) > 0 THEN
        v_headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_secret
        );
    ELSE
        v_headers := jsonb_build_object(
            'Content-Type', 'application/json'
        );
    END IF;

    -- Execute non-blocking POST request using pg_net
    PERFORM net.http_post(
        url := v_full_url,
        headers := v_headers,
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
    );
END;
$$;
