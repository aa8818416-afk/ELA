-- ============================================================
-- DELTA HUB — Phase 1 Migration 3: RLS Policies
-- ============================================================

-- Helper function: get current user's role from profiles table
-- SECURITY DEFINER so it bypasses RLS on profiles for internal lookup
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ============================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================
ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farmers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diseases     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys     ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TABLE: profiles
-- ============================================================
-- Admin: full access
CREATE POLICY "admin_all_profiles"
  ON public.profiles FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- Distributor: read + update own row
CREATE POLICY "distributor_own_profile_select"
  ON public.profiles FOR SELECT
  USING (id = auth.uid() AND public.get_my_role() = 'distributor');

-- Distributor: update own row
CREATE POLICY "distributor_own_profile_update"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid() AND public.get_my_role() = 'distributor')
  WITH CHECK (id = auth.uid() AND public.get_my_role() = 'distributor');

-- Farmer: read own row only
CREATE POLICY "farmer_own_profile_select"
  ON public.profiles FOR SELECT
  USING (id = auth.uid() AND public.get_my_role() = 'farmer');

-- ============================================================
-- TABLE: distributors
-- ============================================================
CREATE POLICY "admin_all_distributors"
  ON public.distributors FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "distributor_own_select"
  ON public.distributors FOR SELECT
  USING (profile_id = auth.uid() AND public.get_my_role() = 'distributor');

CREATE POLICY "distributor_own_update"
  ON public.distributors FOR UPDATE
  USING (profile_id = auth.uid() AND public.get_my_role() = 'distributor')
  WITH CHECK (profile_id = auth.uid() AND public.get_my_role() = 'distributor');

-- ============================================================
-- TABLE: farmers
-- ============================================================
CREATE POLICY "admin_all_farmers"
  ON public.farmers FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- Distributor: read farmers assigned to them
CREATE POLICY "distributor_read_their_farmers"
  ON public.farmers FOR SELECT
  USING (distributor_id = auth.uid() AND public.get_my_role() = 'distributor');

-- Distributor: insert a new farmer assigned to themselves
CREATE POLICY "distributor_insert_their_farmers"
  ON public.farmers FOR INSERT
  WITH CHECK (distributor_id = auth.uid() AND public.get_my_role() = 'distributor');

-- Farmer: read own row
CREATE POLICY "farmer_own_select"
  ON public.farmers FOR SELECT
  USING (profile_id = auth.uid() AND public.get_my_role() = 'farmer');

-- ============================================================
-- TABLE: products
-- ============================================================
CREATE POLICY "admin_all_products"
  ON public.products FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- Distributors and Farmers can read all products
CREATE POLICY "distributor_read_products"
  ON public.products FOR SELECT
  USING (public.get_my_role() = 'distributor');

CREATE POLICY "farmer_read_products"
  ON public.products FOR SELECT
  USING (public.get_my_role() = 'farmer');

-- ============================================================
-- TABLE: diseases
-- ============================================================
CREATE POLICY "admin_all_diseases"
  ON public.diseases FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "distributor_read_diseases"
  ON public.diseases FOR SELECT
  USING (public.get_my_role() = 'distributor');

CREATE POLICY "farmer_read_diseases"
  ON public.diseases FOR SELECT
  USING (public.get_my_role() = 'farmer');

-- ============================================================
-- TABLE: treatments
-- ============================================================
CREATE POLICY "admin_all_treatments"
  ON public.treatments FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "distributor_read_treatments"
  ON public.treatments FOR SELECT
  USING (public.get_my_role() = 'distributor');

CREATE POLICY "farmer_read_treatments"
  ON public.treatments FOR SELECT
  USING (public.get_my_role() = 'farmer');

-- ============================================================
-- TABLE: orders
-- ============================================================
CREATE POLICY "admin_all_orders"
  ON public.orders FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- Distributor: see and create orders assigned to them
CREATE POLICY "distributor_read_their_orders"
  ON public.orders FOR SELECT
  USING (distributor_id = auth.uid() AND public.get_my_role() = 'distributor');

-- Distributor: insert orders assigned to themselves
CREATE POLICY "distributor_insert_their_orders"
  ON public.orders FOR INSERT
  WITH CHECK (distributor_id = auth.uid() AND public.get_my_role() = 'distributor');

-- Farmer: see their own orders
CREATE POLICY "farmer_read_their_orders"
  ON public.orders FOR SELECT
  USING (farmer_id = auth.uid() AND public.get_my_role() = 'farmer');

-- ============================================================
-- TABLE: order_items
-- ============================================================
CREATE POLICY "admin_all_order_items"
  ON public.order_items FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- Distributor: see order_items for orders they manage
CREATE POLICY "distributor_read_their_order_items"
  ON public.order_items FOR SELECT
  USING (
    public.get_my_role() = 'distributor'
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.distributor_id = auth.uid()
    )
  );

-- Distributor: insert order_items for orders they own
CREATE POLICY "distributor_insert_their_order_items"
  ON public.order_items FOR INSERT
  WITH CHECK (
    public.get_my_role() = 'distributor'
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.distributor_id = auth.uid()
    )
  );

-- Farmer: see order_items for their own orders
CREATE POLICY "farmer_read_their_order_items"
  ON public.order_items FOR SELECT
  USING (
    public.get_my_role() = 'farmer'
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.farmer_id = auth.uid()
    )
  );

-- ============================================================
-- TABLE: trips (admin only)
-- ============================================================
CREATE POLICY "admin_all_trips"
  ON public.trips FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ============================================================
-- TABLE: api_keys (admin only)
-- ============================================================
CREATE POLICY "admin_all_api_keys"
  ON public.api_keys FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');
