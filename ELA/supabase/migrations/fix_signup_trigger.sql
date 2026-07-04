-- ============================================================
-- FIX: Auto-create profile on new user sign-up (DB Trigger)
-- ============================================================
-- The client-side profile insert was failing due to RLS.
-- This trigger runs in the DB with elevated privileges,
-- so it bypasses RLS and works reliably every time.
-- ============================================================

-- 1. Create the trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER  -- Runs as the DB owner, bypasses RLS
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'farmer')
  )
  ON CONFLICT (id) DO NOTHING;  -- Safe: won't fail if profile already exists
  RETURN NEW;
END;
$$;

-- 2. Attach the trigger to auth.users (fires after every new sign-up)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- ALSO: Make sure profiles table has correct RLS policies
-- ============================================================

-- Enable RLS on profiles (if not already)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Allow users to update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- The trigger (SECURITY DEFINER) handles INSERT — no client-side INSERT policy needed.
