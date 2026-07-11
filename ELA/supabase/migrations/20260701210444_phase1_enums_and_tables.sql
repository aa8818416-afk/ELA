-- ============================================================
-- DELTA HUB — Phase 1 Migration 1: Enums & Tables
-- ============================================================

-- ENUMS
CREATE TYPE public.user_role AS ENUM ('admin', 'distributor', 'farmer');
CREATE TYPE public.order_status AS ENUM ('pending', 'in_transit', 'delivered', 'cancelled');
CREATE TYPE public.payment_status AS ENUM ('unpaid', 'paid');

-- TABLE: profiles (extends auth.users)
CREATE TABLE public.profiles (
  id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text,
  phone       text,
  role        public.user_role NOT NULL DEFAULT 'farmer',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- TABLE: distributors
CREATE TABLE public.distributors (
  profile_id          uuid        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  village             text,
  active_status       boolean     NOT NULL DEFAULT true,
  wallet_balance      numeric     NOT NULL DEFAULT 0,
  pending_commission  numeric     NOT NULL DEFAULT 0
);

-- TABLE: farmers
CREATE TABLE public.farmers (
  profile_id      uuid        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  land_size       numeric,
  current_crop    text,
  distributor_id  uuid        REFERENCES public.distributors(profile_id) ON DELETE SET NULL
);

-- TABLE: products
CREATE TABLE public.products (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar           text        NOT NULL,
  active_ingredient text,
  price_to_farmer   numeric     NOT NULL DEFAULT 0,
  wholesale_cost    numeric     NOT NULL DEFAULT 0,
  agent_commission  numeric     NOT NULL DEFAULT 0,
  stock_status      boolean     NOT NULL DEFAULT true
);

-- TABLE: diseases
CREATE TABLE public.diseases (
  id       uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en  text  NOT NULL,
  name_ar  text  NOT NULL
);

-- TABLE: treatments (join table: disease <-> product)
CREATE TABLE public.treatments (
  disease_id  uuid  NOT NULL REFERENCES public.diseases(id) ON DELETE CASCADE,
  product_id  uuid  NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  PRIMARY KEY (disease_id, product_id)
);

-- TABLE: orders
CREATE TABLE public.orders (
  id              uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id       uuid                  NOT NULL REFERENCES public.farmers(profile_id) ON DELETE RESTRICT,
  distributor_id  uuid                  NOT NULL REFERENCES public.distributors(profile_id) ON DELETE RESTRICT,
  total_price     numeric               NOT NULL DEFAULT 0,
  status          public.order_status   NOT NULL DEFAULT 'pending',
  payment_status  public.payment_status NOT NULL DEFAULT 'unpaid',
  created_at      timestamptz           NOT NULL DEFAULT now()
);

-- TABLE: order_items
CREATE TABLE public.order_items (
  id          uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid     NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id  uuid     NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity    integer  NOT NULL DEFAULT 1 CHECK (quantity > 0)
);

-- TABLE: trips
CREATE TABLE public.trips (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_name   text    NOT NULL,
  driver_phone  text,
  status        text    NOT NULL DEFAULT 'scheduled',
  created_at    timestamptz NOT NULL DEFAULT now(),
  order_ids     uuid[]
);

-- TABLE: api_keys
CREATE TABLE public.api_keys (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key       text        NOT NULL UNIQUE,
  project_name  text        NOT NULL,
  daily_usage   integer     NOT NULL DEFAULT 0,
  status        text        NOT NULL DEFAULT 'active',
  last_reset    timestamptz NOT NULL DEFAULT now()
);
