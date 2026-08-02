-- Migration: Add is_seen column to orders table to track distributor read status
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS is_seen boolean NOT NULL DEFAULT false;

-- Add index on is_seen for quick filtering/checking unread orders
CREATE INDEX IF NOT EXISTS idx_orders_is_seen ON public.orders(is_seen);

COMMENT ON COLUMN public.orders.is_seen IS 'Indicates whether the order has been seen by the assigned distributor';
