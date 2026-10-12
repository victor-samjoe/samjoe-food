BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  slug text NOT NULL,
  timezone text NOT NULL,
  currency char(3) NOT NULL DEFAULT 'BRL',
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  origin_address jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, slug),
  UNIQUE (slug)
);

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  store_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, store_id, slug),
  FOREIGN KEY (tenant_id, store_id) REFERENCES stores(tenant_id, id)
);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  store_id uuid NOT NULL,
  category_id uuid,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, store_id) REFERENCES stores(tenant_id, id),
  FOREIGN KEY (tenant_id, category_id) REFERENCES categories(tenant_id, id)
);

CREATE TABLE product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  product_id uuid NOT NULL,
  sku text NOT NULL,
  name text NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'BRL',
  inventory_policy text NOT NULL DEFAULT 'UNLIMITED' CHECK (inventory_policy IN ('UNLIMITED', 'TRACKED', 'PREORDER')),
  preorder_limit integer NOT NULL DEFAULT 0 CHECK (preorder_limit >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, sku),
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
);

CREATE TABLE product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  product_id uuid NOT NULL,
  object_key text NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  alt_text text,
  sort_order integer NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, object_key),
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
);

CREATE TABLE modifier_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  min_selected integer NOT NULL DEFAULT 0 CHECK (min_selected >= 0),
  max_selected integer NOT NULL DEFAULT 1 CHECK (max_selected >= min_selected),
  UNIQUE (tenant_id, id)
);

CREATE TABLE modifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  group_id uuid NOT NULL,
  name text NOT NULL,
  price_delta_cents integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, group_id) REFERENCES modifier_groups(tenant_id, id)
);

CREATE TABLE variant_modifier_groups (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  variant_id uuid NOT NULL,
  group_id uuid NOT NULL,
  PRIMARY KEY (tenant_id, variant_id, group_id),
  FOREIGN KEY (tenant_id, variant_id) REFERENCES product_variants(tenant_id, id),
  FOREIGN KEY (tenant_id, group_id) REFERENCES modifier_groups(tenant_id, id)
);

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  phone_e164 text CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  email text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'BLOCKED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE NULLS NOT DISTINCT (tenant_id, phone_e164)
);

CREATE TABLE customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  customer_id uuid NOT NULL,
  label text,
  address jsonb NOT NULL,
  latitude numeric(9,6),
  longitude numeric(9,6),
  is_primary boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

CREATE UNIQUE INDEX customer_one_primary_address
  ON customer_addresses (tenant_id, customer_id)
  WHERE is_primary AND is_active;

CREATE TABLE consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  customer_id uuid NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('PRIVACY_NOTICE', 'ORDER_NOTIFICATIONS', 'MARKETING')),
  action text NOT NULL CHECK (action IN ('GRANTED', 'REVOKED', 'PENDING')),
  source text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id)
);

CREATE TABLE inventory_levels (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  variant_id uuid NOT NULL,
  on_hand integer NOT NULL DEFAULT 0,
  reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  version integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, variant_id),
  FOREIGN KEY (tenant_id, variant_id) REFERENCES product_variants(tenant_id, id)
);

CREATE TABLE inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  variant_id uuid NOT NULL,
  order_id uuid,
  quantity integer NOT NULL CHECK (quantity > 0),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'COMMITTED', 'RELEASED', 'EXPIRED')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, variant_id) REFERENCES product_variants(tenant_id, id)
);

CREATE TABLE inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  variant_id uuid NOT NULL,
  reservation_id uuid,
  type text NOT NULL CHECK (type IN ('RECEIPT', 'ADJUSTMENT', 'SALE', 'RELEASE', 'RETURN')),
  quantity_delta integer NOT NULL CHECK (quantity_delta <> 0),
  reason text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, variant_id) REFERENCES product_variants(tenant_id, id),
  FOREIGN KEY (tenant_id, reservation_id) REFERENCES inventory_reservations(tenant_id, id)
);

CREATE TABLE delivery_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  store_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('AVAILABLE', 'OUTSIDE_AREA', 'REVIEW_REQUIRED')),
  address_snapshot jsonb NOT NULL,
  distance_meters integer CHECK (distance_meters IS NULL OR distance_meters >= 0),
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  fee_cents integer NOT NULL CHECK (fee_cents >= 0),
  estimated_cost_cents integer CHECK (estimated_cost_cents IS NULL OR estimated_cost_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'BRL',
  rule_version text NOT NULL,
  inputs jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, store_id) REFERENCES stores(tenant_id, id)
);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  store_id uuid NOT NULL,
  customer_id uuid,
  delivery_quote_id uuid,
  public_number text NOT NULL,
  tracking_token_hash text NOT NULL,
  source text NOT NULL CHECK (source IN ('WEB', 'WHATSAPP', 'ADMIN', 'IMPORT', 'API')),
  fulfillment text NOT NULL CHECK (fulfillment IN ('DELIVERY', 'PICKUP')),
  status text NOT NULL CHECK (status IN ('PAYMENT_PENDING', 'PAYMENT_FAILED', 'NEW', 'CONFIRMED', 'IN_PREPARATION', 'READY', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED')),
  customer_snapshot jsonb NOT NULL,
  address_snapshot jsonb,
  subtotal_cents integer NOT NULL CHECK (subtotal_cents >= 0),
  discount_cents integer NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  delivery_fee_cents integer NOT NULL DEFAULT 0 CHECK (delivery_fee_cents >= 0),
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'BRL',
  notes text,
  placed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, public_number),
  FOREIGN KEY (tenant_id, store_id) REFERENCES stores(tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id),
  FOREIGN KEY (tenant_id, delivery_quote_id) REFERENCES delivery_quotes(tenant_id, id),
  CHECK ((fulfillment = 'PICKUP') OR address_snapshot IS NOT NULL),
  CHECK (total_cents = subtotal_cents - discount_cents + delivery_fee_cents)
);

ALTER TABLE inventory_reservations
  ADD CONSTRAINT inventory_reservations_order_fk
  FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id);

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  order_id uuid NOT NULL,
  variant_id uuid,
  sku_snapshot text NOT NULL,
  name_snapshot text NOT NULL,
  attributes_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  modifiers_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  quantity integer NOT NULL CHECK (quantity > 0 AND quantity <= 100),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  modifiers_total_cents integer NOT NULL DEFAULT 0,
  line_total_cents integer NOT NULL CHECK (line_total_cents >= 0),
  notes text,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id),
  FOREIGN KEY (tenant_id, variant_id) REFERENCES product_variants(tenant_id, id),
  CHECK (line_total_cents = quantity * (unit_price_cents + modifiers_total_cents))
);

CREATE TABLE order_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  order_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('CUSTOMER', 'USER', 'SYSTEM', 'INTEGRATION', 'ADMIN')),
  actor_id uuid,
  reason text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id)
);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  order_id uuid NOT NULL,
  provider text NOT NULL,
  method text NOT NULL CHECK (method IN ('CASH', 'PIX', 'CARD', 'MERCADO_PAGO')),
  status text NOT NULL CHECK (status IN ('CREATED', 'PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'CHARGEBACK')),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'BRL',
  provider_reference text,
  checkout_url text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, provider, provider_reference),
  FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id)
);

CREATE TABLE payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  payment_id uuid NOT NULL,
  provider_event_id text,
  provider_status text,
  normalized_status text NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, provider_event_id),
  FOREIGN KEY (tenant_id, payment_id) REFERENCES payments(tenant_id, id)
);

CREATE TABLE refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  payment_id uuid NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL CHECK (status IN ('REQUESTED', 'PROCESSING', 'SUCCEEDED', 'FAILED')),
  provider_reference text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, payment_id) REFERENCES payments(tenant_id, id)
);

CREATE TABLE drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  phone_e164 text,
  status text NOT NULL CHECK (status IN ('UNAVAILABLE', 'AVAILABLE', 'RESERVED', 'DELIVERING', 'RETURNING')),
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, id)
);

CREATE TABLE deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  order_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED')),
  address_snapshot jsonb NOT NULL,
  instructions text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, order_id),
  FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id)
);

CREATE TABLE delivery_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  store_id uuid NOT NULL,
  driver_id uuid,
  status text NOT NULL CHECK (status IN ('DRAFT', 'AWAITING_ACCEPTANCE', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED')),
  metrics_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, store_id) REFERENCES stores(tenant_id, id),
  FOREIGN KEY (tenant_id, driver_id) REFERENCES drivers(tenant_id, id)
);

CREATE TABLE route_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  route_id uuid NOT NULL,
  delivery_id uuid NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  address_snapshot jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'SKIPPED')),
  completed_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, route_id, sequence),
  UNIQUE (tenant_id, delivery_id),
  FOREIGN KEY (tenant_id, route_id) REFERENCES delivery_routes(tenant_id, id),
  FOREIGN KEY (tenant_id, delivery_id) REFERENCES deliveries(tenant_id, id)
);

CREATE TABLE external_identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  source text NOT NULL,
  external_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source, external_id)
);

CREATE TABLE idempotency_keys (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  scope text NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL,
  response_status integer,
  response_body jsonb,
  resource_id uuid,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, scope, key)
);

CREATE TABLE integration_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  provider text NOT NULL,
  external_event_id text NOT NULL,
  event_type text,
  payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  status text NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'PROCESSING', 'PROCESSED', 'IGNORED', 'FAILED')),
  attempts integer NOT NULL DEFAULT 0,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  last_error text,
  UNIQUE (provider, external_event_id)
);

CREATE TABLE integration_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED', 'DEAD')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE TABLE webhook_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  outbox_id uuid NOT NULL,
  destination text NOT NULL,
  attempt integer NOT NULL CHECK (attempt > 0),
  response_status integer,
  error_code text,
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  attempted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, outbox_id, destination, attempt),
  FOREIGN KEY (tenant_id, outbox_id) REFERENCES integration_outbox(tenant_id, id)
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  actor_type text NOT NULL CHECK (actor_type IN ('CUSTOMER', 'USER', 'SYSTEM', 'INTEGRATION', 'ADMIN')),
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  request_id uuid,
  ip_hash text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX orders_tenant_store_status_idx ON orders (tenant_id, store_id, status, placed_at DESC);
CREATE INDEX outbox_pending_idx ON integration_outbox (status, available_at) WHERE status IN ('PENDING', 'FAILED');
CREATE INDEX inbox_status_idx ON integration_inbox (status, received_at);
CREATE INDEX reservations_expiry_idx ON inventory_reservations (status, expires_at) WHERE status = 'ACTIVE';

COMMIT;

