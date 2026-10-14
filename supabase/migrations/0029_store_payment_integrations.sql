BEGIN;

CREATE TABLE IF NOT EXISTS store_payment_integrations (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
  store_id      UUID        NOT NULL REFERENCES stores(id)   ON DELETE CASCADE,
  provider      TEXT        NOT NULL CHECK (provider IN ('mercado_pago')),
  access_token  TEXT,
  public_key    TEXT,
  is_active     BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, store_id, provider)
);

COMMIT;
