-- Migration: Add soil_type column to farmers table
-- Values allowed: 'طينية' or 'رملية'
ALTER TABLE public.farmers
  ADD COLUMN IF NOT EXISTS soil_type text CHECK (soil_type IN ('طينية', 'رملية'));
