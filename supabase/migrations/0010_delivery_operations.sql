BEGIN;

CREATE TABLE delivery_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  delivery_id uuid NOT NULL,
  route_stop_id uuid,
  type text NOT NULL CHECK (type IN (
    'DELIVERED', 'DELIVERY_FAILED', 'CUSTOMER_UNAVAILABLE',
    'ADDRESS_NOT_FOUND', 'DAMAGED', 'OTHER'
  )),
  notes text,
  actor_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, delivery_id) REFERENCES deliveries(tenant_id, id),
  FOREIGN KEY (tenant_id, route_stop_id) REFERENCES route_stops(tenant_id, id),
  FOREIGN KEY (actor_id) REFERENCES users(id)
);

CREATE INDEX delivery_occurrences_delivery_idx
  ON delivery_occurrences (tenant_id, delivery_id, occurred_at DESC);

COMMIT;
