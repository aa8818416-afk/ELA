ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type text[] DEFAULT '{}'; ALTER TABLE products ADD COLUMN IF NOT EXISTS target_crops text[] DEFAULT '{}';
