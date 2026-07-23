-- ============================================================
-- B2B2C Auth Phase: Extend distributors & farmers tables
-- with NO conflicts (all changes use IF NOT EXISTS / DO blocks)
-- ============================================================

-- 1. Add distributor_status ENUM (safe: check first)
DO $$ BEGIN
  CREATE TYPE public.distributor_status AS ENUM (
    'PENDING_APPROVAL',
    'APPROVED',
    'REJECTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Extend distributors table — add new columns (all safe with IF NOT EXISTS)
ALTER TABLE public.distributors
  ADD COLUMN IF NOT EXISTS full_name        text,
  ADD COLUMN IF NOT EXISTS email            text,
  ADD COLUMN IF NOT EXISTS governorate      text,
  ADD COLUMN IF NOT EXISTS center           text,
  ADD COLUMN IF NOT EXISTS main_road        text,
  ADD COLUMN IF NOT EXISTS village_name     text,
  ADD COLUMN IF NOT EXISTS landmark         text,
  ADD COLUMN IF NOT EXISTS latitude         double precision,
  ADD COLUMN IF NOT EXISTS longitude        double precision,
  ADD COLUMN IF NOT EXISTS supervised_villages text[],
  ADD COLUMN IF NOT EXISTS total_acres      numeric,
  ADD COLUMN IF NOT EXISTS status           public.distributor_status NOT NULL DEFAULT 'PENDING_APPROVAL';

-- 3. Extend farmers table — add pin_code column (stored as hashed text in auth, 
--    plain PIN shown to distributor only once at creation)
ALTER TABLE public.farmers
  ADD COLUMN IF NOT EXISTS pin_hash         text;

-- Make distributor_id mandatory on new rows (NOT NULL constraint via CHECK — avoids breaking existing rows)
-- We use a deferred trigger approach instead of ALTER COLUMN to avoid breaking existing data
CREATE OR REPLACE FUNCTION public.enforce_farmer_distributor_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.distributor_id IS NULL THEN
    RAISE EXCEPTION 'يجب ربط الفلاح بموزع معتمد. distributor_id لا يمكن أن يكون فارغاً.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger first to avoid duplicate errors on re-run
DROP TRIGGER IF EXISTS enforce_farmer_distributor ON public.farmers;
CREATE TRIGGER enforce_farmer_distributor
  BEFORE INSERT ON public.farmers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_farmer_distributor_id();

-- 4. Ensure phone uniqueness in profiles (phone is the farmer's login identifier)
-- Add unique index on phone but only where phone is not null
DROP INDEX IF EXISTS public.profiles_phone_unique_idx;
CREATE UNIQUE INDEX profiles_phone_unique_idx
  ON public.profiles(phone)
  WHERE phone IS NOT NULL AND phone != '';

-- 5. Add RLS policy: distributor can only see their own distributor row + update status-related fields
--    (existing policies from phase1 already cover admin_all and distributor_own_update)
--    Add missing INSERT policy for distributor to insert their own row (during registration)
DROP POLICY IF EXISTS "distributor_insert_own" ON public.distributors;
CREATE POLICY "distributor_insert_own"
  ON public.distributors FOR INSERT
  WITH CHECK (profile_id = auth.uid());

-- 6. Allow distributor to read profiles of their own farmers (needed for farmer list page)
DROP POLICY IF EXISTS "distributor_read_farmer_profiles" ON public.profiles;
CREATE POLICY "distributor_read_farmer_profiles"
  ON public.profiles FOR SELECT
  USING (
    public.get_my_role() = 'distributor'
    AND (
      -- Own profile
      id = auth.uid()
      OR
      -- Profile of a farmer that belongs to this distributor
      EXISTS (
        SELECT 1 FROM public.farmers f
        WHERE f.profile_id = profiles.id
          AND f.distributor_id = auth.uid()
      )
    )
  );

-- 7. Helper function: get distributor status (used in middleware/server checks)
CREATE OR REPLACE FUNCTION public.get_my_distributor_status()
RETURNS public.distributor_status
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT status FROM public.distributors WHERE profile_id = auth.uid() LIMIT 1;
$$;
