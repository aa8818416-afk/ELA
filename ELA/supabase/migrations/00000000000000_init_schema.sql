-- ============================================================
-- 00000000000000_init_schema.sql
-- INITIAL SCHEMA: Tables, Custom Types, Functions, RLS Policies
-- ============================================================

-- 1. Create Custom Types & Enums
CREATE TYPE public.user_role AS ENUM ('admin', 'distributor', 'farmer');
CREATE TYPE public.order_status AS ENUM ('pending', 'in_transit', 'delivered', 'cancelled');
CREATE TYPE public.payment_status AS ENUM ('unpaid', 'paid');

-- 2. Create Tables

-- public.profiles
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    phone TEXT,
    role public.user_role NOT NULL DEFAULT 'farmer'::public.user_role,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- public.distributors
CREATE TABLE public.distributors (
    profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    village TEXT,
    active_status BOOLEAN DEFAULT true NOT NULL,
    wallet_balance NUMERIC DEFAULT 0 NOT NULL,
    pending_commission NUMERIC DEFAULT 0 NOT NULL
);

-- public.farmers
CREATE TABLE public.farmers (
    profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    land_size NUMERIC,
    current_crop TEXT,
    distributor_id UUID REFERENCES public.distributors(profile_id) ON DELETE SET NULL
);

-- public.products
CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name_ar TEXT NOT NULL,
    active_ingredient TEXT,
    price_to_farmer NUMERIC DEFAULT 0 NOT NULL,
    wholesale_cost NUMERIC DEFAULT 0 NOT NULL,
    agent_commission NUMERIC DEFAULT 0 NOT NULL,
    stock_status BOOLEAN DEFAULT true NOT NULL
);

-- public.diseases
CREATE TABLE public.diseases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name_en TEXT NOT NULL,
    name_ar TEXT NOT NULL
);

-- public.treatments
CREATE TABLE public.treatments (
    disease_id UUID REFERENCES public.diseases(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    PRIMARY KEY (disease_id, product_id)
);

-- public.orders
CREATE TABLE public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id UUID NOT NULL REFERENCES public.farmers(profile_id) ON DELETE CASCADE,
    distributor_id UUID NOT NULL REFERENCES public.distributors(profile_id) ON DELETE CASCADE,
    total_price NUMERIC DEFAULT 0 NOT NULL,
    status public.order_status DEFAULT 'pending'::public.order_status NOT NULL,
    payment_status public.payment_status DEFAULT 'unpaid'::public.payment_status NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- public.order_items
CREATE TABLE public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity INTEGER DEFAULT 1 NOT NULL CHECK (quantity > 0)
);

-- public.trips
CREATE TABLE public.trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_name TEXT NOT NULL,
    driver_phone TEXT,
    status TEXT DEFAULT 'scheduled'::text NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    order_ids UUID[]
);

-- public.api_keys
CREATE TABLE public.api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key TEXT NOT NULL UNIQUE,
    project_name TEXT NOT NULL,
    daily_usage INTEGER DEFAULT 0 NOT NULL,
    status TEXT DEFAULT 'active'::text NOT NULL,
    last_reset TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 3. Create Functions
CREATE OR REPLACE FUNCTION public.get_my_role()
 RETURNS public.user_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$function$;

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farmers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diseases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies

-- Profiles Policies
CREATE POLICY "admin_all_profiles" ON public.profiles FOR ALL TO public USING (get_my_role() = 'admin'::public.user_role) WITH CHECK (get_my_role() = 'admin'::public.user_role);
CREATE POLICY "distributor_own_profile_select" ON public.profiles FOR SELECT TO public USING (id = auth.uid() AND get_my_role() = 'distributor'::public.user_role);
CREATE POLICY "distributor_own_profile_update" ON public.profiles FOR UPDATE TO public USING (id = auth.uid() AND get_my_role() = 'distributor'::public.user_role) WITH CHECK (id = auth.uid() AND get_my_role() = 'distributor'::public.user_role);
CREATE POLICY "distributor_read_their_farmers_profiles" ON public.profiles FOR SELECT TO public USING (id IN (SELECT f.profile_id FROM public.farmers f WHERE f.distributor_id = auth.uid()) AND role = 'farmer'::public.user_role);
CREATE POLICY "farmer_own_profile_select" ON public.profiles FOR SELECT TO public USING (id = auth.uid() AND get_my_role() = 'farmer'::public.user_role);

-- Distributors Policies
CREATE POLICY "admin_all_distributors" ON public.distributors FOR ALL TO public USING (get_my_role() = 'admin'::public.user_role) WITH CHECK (get_my_role() = 'admin'::public.user_role);
CREATE POLICY "distributor_own_select" ON public.distributors FOR SELECT TO public USING (profile_id = auth.uid() AND get_my_role() = 'distributor'::public.user_role);
CREATE POLICY "distributor_own_update" ON public.distributors FOR UPDATE TO public USING (profile_id = auth.uid() AND get_my_role() = 'distributor'::public.user_role) WITH CHECK (profile_id = auth.uid() AND get_my_role() = 'distributor'::public.user_role);

-- Farmers Policies
CREATE POLICY "admin_all_farmers" ON public.farmers FOR ALL TO public USING (get_my_role() = 'admin'::public.user_role) WITH CHECK (get_my_role() = 'admin'::public.user_role);
CREATE POLICY "distributor_insert_their_farmers" ON public.farmers FOR INSERT TO public WITH CHECK (distributor_id = auth.uid() AND get_my_role() = 'distributor'::public.user_role);
CREATE POLICY "distributor_read_their_farmers" ON public.farmers FOR SELECT TO public USING (distributor_id = auth.uid() AND get_my_role() = 'distributor'::public.user_role);
CREATE POLICY "farmer_own_select" ON public.farmers FOR SELECT TO public USING (profile_id = auth.uid() AND get_my_role() = 'farmer'::public.user_role);

-- Diseases Policies
CREATE POLICY "admin_all_diseases" ON public.diseases FOR ALL TO public USING (get_my_role() = 'admin'::public.user_role) WITH CHECK (get_my_role() = 'admin'::public.user_role);
CREATE POLICY "distributor_read_diseases" ON public.diseases FOR SELECT TO public USING (get_my_role() = 'distributor'::public.user_role);
CREATE POLICY "farmer_read_diseases" ON public.diseases FOR SELECT TO public USING (get_my_role() = 'farmer'::public.user_role);

-- Treatments Policies
CREATE POLICY "admin_all_treatments" ON public.treatments FOR ALL TO public USING (get_my_role() = 'admin'::public.user_role) WITH CHECK (get_my_role() = 'admin'::public.user_role);
CREATE POLICY "distributor_read_treatments" ON public.treatments FOR SELECT TO public USING (get_my_role() = 'distributor'::public.user_role);
CREATE POLICY "farmer_read_treatments" ON public.treatments FOR SELECT TO public USING (get_my_role() = 'farmer'::public.user_role);

-- Products Policies
CREATE POLICY "admin_all_products" ON public.products FOR ALL TO public USING (get_my_role() = 'admin'::public.user_role) WITH CHECK (get_my_role() = 'admin'::public.user_role);
CREATE POLICY "distributor_read_products" ON public.products FOR SELECT TO public USING (get_my_role() = 'distributor'::public.user_role);
CREATE POLICY "farmer_read_products" ON public.products FOR SELECT TO public USING (get_my_role() = 'farmer'::public.user_role);

-- Api Keys Policies
CREATE POLICY "admin_all_api_keys" ON public.api_keys FOR ALL TO public USING (get_my_role() = 'admin'::public.user_role) WITH CHECK (get_my_role() = 'admin'::public.user_role);

-- Orders Policies
CREATE POLICY "admin_all_orders" ON public.orders FOR ALL TO public USING (get_my_role() = 'admin'::public.user_role) WITH CHECK (get_my_role() = 'admin'::public.user_role);
CREATE POLICY "distributor_insert_their_orders" ON public.orders FOR INSERT TO public WITH CHECK (distributor_id = auth.uid() AND get_my_role() = 'distributor'::public.user_role);
CREATE POLICY "distributor_read_their_orders" ON public.orders FOR SELECT TO public USING (distributor_id = auth.uid() AND get_my_role() = 'distributor'::public.user_role);
CREATE POLICY "distributor_update_their_orders" ON public.orders FOR UPDATE TO public USING (distributor_id = auth.uid() AND get_my_role() = 'distributor'::public.user_role) WITH CHECK (distributor_id = auth.uid() AND get_my_role() = 'distributor'::public.user_role);
CREATE POLICY "farmer_read_their_orders" ON public.orders FOR SELECT TO public USING (farmer_id = auth.uid() AND get_my_role() = 'farmer'::public.user_role);

-- Order Items Policies
CREATE POLICY "admin_all_order_items" ON public.order_items FOR ALL TO public USING (get_my_role() = 'admin'::public.user_role) WITH CHECK (get_my_role() = 'admin'::public.user_role);
CREATE POLICY "distributor_insert_their_order_items" ON public.order_items FOR INSERT TO public WITH CHECK (get_my_role() = 'distributor'::public.user_role AND (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND o.distributor_id = auth.uid())));
CREATE POLICY "distributor_read_their_order_items" ON public.order_items FOR SELECT TO public USING (get_my_role() = 'distributor'::public.user_role AND (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND o.distributor_id = auth.uid())));
CREATE POLICY "farmer_read_their_order_items" ON public.order_items FOR SELECT TO public USING (get_my_role() = 'farmer'::public.user_role AND (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND o.farmer_id = auth.uid())));

-- Trips Policies
CREATE POLICY "admin_all_trips" ON public.trips FOR ALL TO public USING (get_my_role() = 'admin'::public.user_role) WITH CHECK (get_my_role() = 'admin'::public.user_role);
