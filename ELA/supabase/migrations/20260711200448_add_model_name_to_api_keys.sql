ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS model_name TEXT DEFAULT 'gemini-3.5-flash';
