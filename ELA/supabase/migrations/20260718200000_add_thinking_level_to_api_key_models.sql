-- Migration: Add thinking_level column to api_key_models
-- This column controls the reasoning/thinking level for models that support it.
-- Supported models and their valid levels:
--   gemini-3.1-flash-lite: MINIMAL, LOW, MEDIUM, HIGH
--   gemma-4-31b-it:        MINIMAL, HIGH
--   gemma-4-26b-a4b-it:    MINIMAL, HIGH

ALTER TABLE public.api_key_models
  ADD COLUMN IF NOT EXISTS thinking_level TEXT DEFAULT NULL;

-- Add a check constraint to allow only valid thinking level values (or NULL for unsupported models)
ALTER TABLE public.api_key_models
  ADD CONSTRAINT chk_thinking_level
  CHECK (thinking_level IS NULL OR thinking_level IN ('MINIMAL', 'LOW', 'MEDIUM', 'HIGH'));

COMMENT ON COLUMN public.api_key_models.thinking_level IS
  'Controls the reasoning/thinking level for supported models. NULL means not applicable. '
  'gemini-3.1-flash-lite supports: MINIMAL, LOW, MEDIUM, HIGH. '
  'gemma-4-31b-it and gemma-4-26b-a4b-it support: MINIMAL, HIGH.';
