-- Migration: Add farm_profile JSONB column to public.farmers and atomic merge RPC function

-- 1. Add farm_profile JSONB column to farmers table
ALTER TABLE public.farmers
  ADD COLUMN IF NOT EXISTS farm_profile JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.farmers.farm_profile IS
  'Stores farmer profile information as structured JSONB categorized by scope (e.g. general, قمح, طماطم)';

-- 2. Function to safely merge new profile data (Atomic Deep Merge with FOR UPDATE lock)
CREATE OR REPLACE FUNCTION public.merge_farm_profile(
  farmer_id UUID, 
  target_scope TEXT, 
  new_data JSONB
) RETURNS VOID AS $$
DECLARE
  current_profile JSONB;
  current_scope_data JSONB;
BEGIN
  -- 1. Read current profile with Row-Level Lock (FOR UPDATE)
  SELECT farm_profile INTO current_profile 
  FROM public.farmers 
  WHERE profile_id = farmer_id 
  FOR UPDATE;

  -- 2. Handle NULL initial profile
  IF current_profile IS NULL THEN
    current_profile := '{}'::jsonb;
  END IF;

  -- 3. Merge data within target scope
  current_scope_data := COALESCE(current_profile->target_scope, '{}'::jsonb);
  current_scope_data := current_scope_data || new_data;

  -- 4. Reconstruct JSONB profile
  current_profile := jsonb_set(current_profile, ARRAY[target_scope], current_scope_data);

  -- 5. Save updated profile
  UPDATE public.farmers 
  SET farm_profile = current_profile 
  WHERE profile_id = farmer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
