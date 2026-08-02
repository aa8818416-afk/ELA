-- Migration: Add created_by_type to orders table to track order creation source
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS created_by_type text NOT NULL DEFAULT 'platform';

-- Add index on created_by_type for query performance
CREATE INDEX IF NOT EXISTS idx_orders_created_by_type ON public.orders(created_by_type);

COMMENT ON COLUMN public.orders.created_by_type IS 'Source of order creation: platform (farmer/chat) or distributor';
