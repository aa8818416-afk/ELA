-- Create api_key_models table
CREATE TABLE IF NOT EXISTS public.api_key_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_id UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
    model_name TEXT NOT NULL,
    daily_usage INTEGER DEFAULT 0 NOT NULL,
    daily_limit INTEGER DEFAULT 1450 NOT NULL,
    status TEXT DEFAULT 'active' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE (key_id, model_name)
);

-- Enable RLS
ALTER TABLE public.api_key_models ENABLE ROW LEVEL SECURITY;

-- Add RLS policy for admin only
CREATE POLICY "admin_all_api_key_models"
  ON public.api_key_models FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- Populate from existing data in public.api_keys
INSERT INTO public.api_key_models (key_id, model_name, daily_limit, daily_usage, status)
SELECT id, model_name, 1450, daily_usage, status
FROM public.api_keys
WHERE model_name IS NOT NULL AND model_name != ''
ON CONFLICT (key_id, model_name) DO NOTHING;
