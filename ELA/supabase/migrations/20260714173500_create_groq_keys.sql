-- ============================================================
-- ELA DEV — Migration: Create groq_keys Table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.groq_keys (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key       text        NOT NULL UNIQUE,
  daily_usage   integer     NOT NULL DEFAULT 0,
  status        text        NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.groq_keys ENABLE ROW LEVEL SECURITY;

-- Create policy to prevent all public access (only read/write via service_role / Admin Client)
CREATE POLICY "Admin only read write on groq_keys"
  ON public.groq_keys
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
