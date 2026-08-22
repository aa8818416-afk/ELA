-- ==============================================================================
-- Performance Optimization: Missing Indexes for Queries & Foreign Key Lookups
-- ==============================================================================

-- 1. Index on farmers(distributor_id) for distributor dashboard & lookup
CREATE INDEX IF NOT EXISTS idx_farmers_distributor_id 
  ON public.farmers(distributor_id);

-- 2. Composite index on orders(distributor_id, status) for pending/delivered counts & settlements
CREATE INDEX IF NOT EXISTS idx_orders_distributor_status 
  ON public.orders(distributor_id, status);

-- 3. Composite index on orders(farmer_id, created_at DESC) for farmer orders page
CREATE INDEX IF NOT EXISTS idx_orders_farmer_created 
  ON public.orders(farmer_id, created_at DESC);

-- 4. Index on order_items(product_id) for village group buy volume aggregation
CREATE INDEX IF NOT EXISTS idx_order_items_product_id 
  ON public.order_items(product_id);

-- 5. Partial index on profiles(phone) for phone-based login lookups
CREATE INDEX IF NOT EXISTS idx_profiles_phone 
  ON public.profiles(phone) WHERE phone IS NOT NULL;

-- 6. Indexes for API key models rotation in crop-chat and memory synthesis
CREATE INDEX IF NOT EXISTS idx_api_key_models_rotation 
  ON public.api_key_models(status, daily_usage) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_api_key_models_key_id 
  ON public.api_key_models(key_id);
