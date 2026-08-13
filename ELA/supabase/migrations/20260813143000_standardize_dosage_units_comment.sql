-- Migration: Add dosage_unit documentation and standards to field_treatments
-- dosage_unit remains TEXT to allow custom user inputs as fallback
COMMENT ON COLUMN public.field_treatments.dosage_unit IS 'Unit of treatment dosage. Standard values: liter, ml, gram, kilogram, ton, cap, spoon, bottle, can, sachet, bag, sack, ampoule, jerrycan, barrel, tank, carton, or custom raw text string if none match.';
