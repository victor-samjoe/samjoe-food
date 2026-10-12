BEGIN;

CREATE TABLE store_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  hostname text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'VERIFIED', 'DISABLED')),
  verification_token text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, store_id) REFERENCES stores(tenant_id, id),
  CHECK (hostname = lower(hostname)),
  CHECK (hostname !~ '[/\\:]'),
  CHECK (
    (status = 'VERIFIED' AND verified_at IS NOT NULL)
    OR status <> 'VERIFIED'
  )
);

CREATE UNIQUE INDEX store_domains_hostname_unique
  ON store_domains (lower(hostname));

CREATE UNIQUE INDEX store_domains_one_primary
  ON store_domains (tenant_id, store_id)
  WHERE is_primary AND status = 'VERIFIED';

CREATE INDEX store_domains_store_idx
  ON store_domains (tenant_id, store_id, status);

COMMIT;

