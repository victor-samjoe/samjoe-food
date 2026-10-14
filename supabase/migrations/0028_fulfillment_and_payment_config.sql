-- Fulfillment types and payment methods configuration per store
-- Adds toggle columns to stores, extends orders.fulfillment enum, adds scheduled_for to orders

-- Store fulfillment config
ALTER TABLE stores ADD COLUMN IF NOT EXISTS scheduled_delivery_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS pickup_in_person_enabled   boolean NOT NULL DEFAULT true;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS pickup_by_app_enabled      boolean NOT NULL DEFAULT false;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS pickup_scheduling_enabled  boolean NOT NULL DEFAULT false;

-- Store payment config
ALTER TABLE stores ADD COLUMN IF NOT EXISTS cash_enabled          boolean NOT NULL DEFAULT true;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS card_on_site_enabled  boolean NOT NULL DEFAULT false;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS pix_enabled           boolean NOT NULL DEFAULT true;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS mercado_pago_enabled  boolean NOT NULL DEFAULT false;

-- Extend orders.fulfillment to include new types
DO $$
DECLARE v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'orders'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%DELIVERY%PICKUP%';
  IF v_conname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE orders DROP CONSTRAINT ' || quote_ident(v_conname);
  END IF;
END $$;

ALTER TABLE orders ADD CONSTRAINT orders_fulfillment_check
  CHECK (fulfillment IN ('DELIVERY', 'DELIVERY_SCHEDULED', 'PICKUP', 'PICKUP_BY_APP'));

-- Scheduled delivery/pickup time chosen by customer
ALTER TABLE orders ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;
