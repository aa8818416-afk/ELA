-- ============================================================
-- Migration: Fix Order Payments, Multi-tier Settlement & Atomic Wallet
-- ============================================================

-- 1. Add delivered_at and settlement tracking columns to orders table
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
ADD COLUMN IF NOT EXISTS collected_from_farmer boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS settled_to_admin boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS settled_at timestamptz;

-- 2. Backfill existing data
-- Any orders already marked 'delivered' are considered collected from farmer
UPDATE public.orders
SET 
  collected_from_farmer = true,
  delivered_at = COALESCE(delivered_at, created_at)
WHERE status = 'delivered';

-- Any orders already marked 'delivered' AND payment_status = 'paid' were settled with admin
UPDATE public.orders
SET 
  settled_to_admin = true,
  settled_at = COALESCE(settled_at, created_at)
WHERE status = 'delivered' AND payment_status = 'paid';

-- 3. Create performance indices
CREATE INDEX IF NOT EXISTS idx_orders_delivery_settlement 
ON public.orders(distributor_id, status, settled_to_admin);

CREATE INDEX IF NOT EXISTS idx_orders_status_settled 
ON public.orders(status, settled_to_admin);

-- 4. PostgreSQL Function: Atomic wallet increment / settlement
CREATE OR REPLACE FUNCTION public.increment_distributor_wallet(
  p_profile_id uuid,
  p_amount numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance numeric;
BEGIN
  UPDATE public.distributors
  SET wallet_balance = COALESCE(wallet_balance, 0) + p_amount
  WHERE profile_id = p_profile_id
  RETURNING wallet_balance INTO v_new_balance;

  RETURN v_new_balance;
END;
$$;

-- Grant execution to authenticated users and service role
GRANT EXECUTE ON FUNCTION public.increment_distributor_wallet(uuid, numeric) TO authenticated, service_role;

COMMENT ON COLUMN public.orders.collected_from_farmer IS 'Indicates if the farmer paid cash upon receiving the delivery';
COMMENT ON COLUMN public.orders.settled_to_admin IS 'Indicates if the distributor remitted collected funds to the platform admin';
COMMENT ON COLUMN public.orders.delivered_at IS 'Timestamp when the order was delivered to the farmer';
COMMENT ON COLUMN public.orders.settled_at IS 'Timestamp when sales were settled with the platform admin';
