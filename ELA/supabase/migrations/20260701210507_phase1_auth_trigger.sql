-- ============================================================
-- DELTA HUB — Phase 1 Migration 2: Auth User Trigger
-- ============================================================

-- Function: auto-create profile row on new auth.users signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.user_role;
BEGIN
  -- Allow role override via user metadata (e.g. admin onboarding)
  BEGIN
    v_role := (NEW.raw_user_meta_data->>'role')::public.user_role;
  EXCEPTION WHEN OTHERS THEN
    v_role := 'farmer';
  END;

  -- Fallback to default 'farmer' if metadata had no valid role
  IF v_role IS NULL THEN
    v_role := 'farmer';
  END IF;

  INSERT INTO public.profiles (id, full_name, phone, role, created_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    v_role,
    NOW()
  );

  RETURN NEW;
END;
$$;

-- Trigger: fire after every new user signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
