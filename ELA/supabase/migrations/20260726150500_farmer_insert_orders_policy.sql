-- Migration: Allow farmers to insert their own orders and order items
-- Created At: 2026-07-26

-- Allow farmers to create orders assigned to themselves
CREATE POLICY "farmer_insert_their_orders"
  ON public.orders FOR INSERT
  WITH CHECK (farmer_id = auth.uid() AND public.get_my_role() = 'farmer');

-- Allow farmers to insert items for orders that belong to them
CREATE POLICY "farmer_insert_their_order_items"
  ON public.order_items FOR INSERT
  WITH CHECK (
    public.get_my_role() = 'farmer'
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.farmer_id = auth.uid()
    )
  );
