BEGIN;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_products_store_archived
  ON products (tenant_id, store_id, is_archived, is_active);

COMMIT;
