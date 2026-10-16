BEGIN;

ALTER TABLE store_payment_integrations
  ADD COLUMN IF NOT EXISTS webhook_secret TEXT;

COMMIT;
