-- ============================================================
-- ELA DEV — Migration: Create tts_settings Table
-- Target: https://oiacbloedbdkqgcgalry.supabase.co (ELA DEV only)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tts_settings (
  id                    text        PRIMARY KEY DEFAULT 'default',
  voice                 text        NOT NULL DEFAULT 'ar-EG-SalmaNeural',
  rate                  text        NOT NULL DEFAULT '+0%',
  pitch                 text        NOT NULL DEFAULT '+0Hz',
  volume                text        NOT NULL DEFAULT '+0%',
  break_on_comma_ms     integer     NOT NULL DEFAULT 300,
  break_on_period_ms    integer     NOT NULL DEFAULT 600,
  chunk_max_chars       integer     NOT NULL DEFAULT 800,
  auto_breaks_enabled   boolean     NOT NULL DEFAULT true,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Enforce singleton: only one row allowed
CREATE OR REPLACE FUNCTION public.tts_settings_enforce_singleton()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id <> 'default' THEN
    RAISE EXCEPTION 'tts_settings only allows a single row with id = ''default''';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tts_settings_singleton_trigger
  BEFORE INSERT ON public.tts_settings
  FOR EACH ROW EXECUTE FUNCTION public.tts_settings_enforce_singleton();

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION public.tts_settings_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tts_settings_updated_at_trigger
  BEFORE UPDATE ON public.tts_settings
  FOR EACH ROW EXECUTE FUNCTION public.tts_settings_set_updated_at();

-- Enable RLS
ALTER TABLE public.tts_settings ENABLE ROW LEVEL SECURITY;

-- Anon + Authenticated: read-only access (API route needs to read settings)
CREATE POLICY "Public read tts_settings"
  ON public.tts_settings
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only service_role can write (admin API uses service_role)
CREATE POLICY "Admin only write tts_settings"
  ON public.tts_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Seed the default row
INSERT INTO public.tts_settings (
  id,
  voice,
  rate,
  pitch,
  volume,
  break_on_comma_ms,
  break_on_period_ms,
  chunk_max_chars,
  auto_breaks_enabled
) VALUES (
  'default',
  'ar-EG-SalmaNeural',
  '+0%',
  '+0Hz',
  '+0%',
  300,
  600,
  800,
  true
) ON CONFLICT (id) DO NOTHING;
