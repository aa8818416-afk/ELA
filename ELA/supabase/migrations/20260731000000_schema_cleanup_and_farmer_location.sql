-- Migration: Clean Legacy Schema & Inherit Location Fields
-- Created At: 2026-07-31

-- 1. Add inherited location columns to farmers table
ALTER TABLE public.farmers
  ADD COLUMN IF NOT EXISTS governorate TEXT,
  ADD COLUMN IF NOT EXISTS center TEXT,
  ADD COLUMN IF NOT EXISTS village TEXT;

-- 2. Drop deprecated columns from farmers table
ALTER TABLE public.farmers
  DROP COLUMN IF EXISTS land_size,
  DROP COLUMN IF EXISTS current_crop;

-- 3. Drop redundant columns from distributors table
ALTER TABLE public.distributors
  DROP COLUMN IF EXISTS full_name,
  DROP COLUMN IF EXISTS email;
