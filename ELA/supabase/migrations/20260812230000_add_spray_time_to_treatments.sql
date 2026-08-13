-- Migration: Add spray_time_of_day column to field_treatments table
ALTER TABLE public.field_treatments
  ADD COLUMN IF NOT EXISTS spray_time_of_day text;
