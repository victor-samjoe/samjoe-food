BEGIN;

ALTER TABLE delivery_pricing_rules
  ADD COLUMN free_delivery_radius_meters integer NOT NULL DEFAULT 0
  CHECK (free_delivery_radius_meters >= 0);

ALTER TABLE delivery_pricing_rules
  ADD CONSTRAINT delivery_free_radius_within_maximum
  CHECK (free_delivery_radius_meters <= maximum_radius_meters);

COMMIT;
