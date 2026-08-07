-- Migration: Add sprayer_count column to field_treatments table
ALTER TABLE public.field_treatments
  ADD COLUMN sprayer_count integer;
