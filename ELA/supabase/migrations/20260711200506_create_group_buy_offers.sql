CREATE TABLE IF NOT EXISTS public.group_buy_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID UNIQUE NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    tier1_qty INTEGER NOT NULL CHECK (tier1_qty > 0),
    tier1_discount NUMERIC NOT NULL CHECK (tier1_discount >= 0 AND tier1_discount <= 100),
    tier2_qty INTEGER CHECK (tier2_qty > tier1_qty),
    tier2_discount NUMERIC CHECK (tier2_discount >= 0 AND tier2_discount <= 100),
    tier3_qty INTEGER CHECK (tier3_qty > tier2_qty),
    tier3_discount NUMERIC CHECK (tier3_discount >= 0 AND tier3_discount <= 100),
    active_status BOOLEAN DEFAULT true NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

ALTER TABLE public.group_buy_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_group_buy_offers" ON public.group_buy_offers;
DROP POLICY IF EXISTS "distributor_read_group_buy_offers" ON public.group_buy_offers;
DROP POLICY IF EXISTS "farmer_read_group_buy_offers" ON public.group_buy_offers;

CREATE POLICY "admin_all_group_buy_offers" ON public.group_buy_offers FOR ALL TO public
  USING (get_my_role() = 'admin'::public.user_role)
  WITH CHECK (get_my_role() = 'admin'::public.user_role);

CREATE POLICY "distributor_read_group_buy_offers" ON public.group_buy_offers FOR SELECT TO public
  USING (get_my_role() = 'distributor'::public.user_role);

CREATE POLICY "farmer_read_group_buy_offers" ON public.group_buy_offers FOR SELECT TO public
  USING (get_my_role() = 'farmer'::public.user_role);
