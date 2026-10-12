BEGIN;

CREATE TABLE delivery_pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  store_id uuid NOT NULL,
  version text NOT NULL,
  base_fee_cents integer NOT NULL CHECK (base_fee_cents >= 0),
  included_meters integer NOT NULL CHECK (included_meters >= 0),
  price_per_extra_km_cents integer NOT NULL CHECK (price_per_extra_km_cents >= 0),
  standard_radius_meters integer NOT NULL CHECK (standard_radius_meters >= included_meters),
  maximum_radius_meters integer NOT NULL CHECK (maximum_radius_meters >= standard_radius_meters),
  exception_fee_cents integer NOT NULL DEFAULT 0 CHECK (exception_fee_cents >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, store_id, version),
  FOREIGN KEY (tenant_id, store_id) REFERENCES stores(tenant_id, id)
);

CREATE UNIQUE INDEX delivery_one_active_rule_per_store
  ON delivery_pricing_rules (tenant_id, store_id)
  WHERE is_active;

COMMIT;

