-- Migration: Set is_seen = true for existing orders so only new incoming orders are unread
UPDATE public.orders SET is_seen = true WHERE is_seen IS NOT TRUE;
