CREATE OR REPLACE FUNCTION public.handle_profile_role_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.role = 'distributor'::user_role
     AND (OLD.role IS DISTINCT FROM NEW.role)
  THEN
    INSERT INTO public.distributors (
      profile_id,
      village,
      active_status,
      wallet_balance,
      pending_commission
    )
    VALUES (
      NEW.id,
      NULL,
      true,
      0,
      0
    )
    ON CONFLICT (profile_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_role_update ON public.profiles;
CREATE TRIGGER on_profile_role_update
  AFTER UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_profile_role_change();

DROP POLICY IF EXISTS "distributor_read_their_farmers_profiles" ON public.profiles;
CREATE POLICY "distributor_read_their_farmers_profiles" 
  ON public.profiles FOR SELECT 
  USING (id IN (SELECT f.profile_id FROM public.farmers f WHERE f.distributor_id = auth.uid()) AND role = 'farmer'::public.user_role);

DROP POLICY IF EXISTS "distributor_update_their_orders" ON public.orders;
CREATE POLICY "distributor_update_their_orders" 
  ON public.orders FOR UPDATE 
  USING (distributor_id = auth.uid() AND get_my_role() = 'distributor'::public.user_role)
  WITH CHECK (distributor_id = auth.uid() AND get_my_role() = 'distributor'::public.user_role);
