BEGIN;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS integration_settings jsonb NOT NULL DEFAULT '{}';

COMMIT;
