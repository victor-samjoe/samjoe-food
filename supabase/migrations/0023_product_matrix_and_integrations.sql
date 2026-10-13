BEGIN;

CREATE TABLE control_plane.integrations (
  code text PRIMARY KEY,
  name text NOT NULL,
  parent_system_code text NOT NULL REFERENCES control_plane.systems(code),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE control_plane.client_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES control_plane.clients(id) ON DELETE CASCADE,
  integration_code text NOT NULL REFERENCES control_plane.integrations(code),
  environment text NOT NULL DEFAULT 'PRODUCTION'
    CHECK (environment IN ('DEVELOPMENT', 'STAGING', 'PRODUCTION')),
  status text NOT NULL DEFAULT 'NOT_CONFIGURED'
    CHECK (status IN ('NOT_CONFIGURED', 'CONNECTING', 'CONNECTED', 'DISCONNECTED', 'ERROR')),
  external_connection_id text,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_checked_at timestamptz,
  connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, integration_code, environment)
);

INSERT INTO control_plane.systems (code, name) VALUES
  ('site', 'Site'),
  ('legal', 'SamJoE Jurídico')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';

INSERT INTO control_plane.integrations (code, name, parent_system_code) VALUES
  ('whatsapp', 'WhatsApp', 'sales_engine')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  parent_system_code = EXCLUDED.parent_system_code,
  status = 'ACTIVE';

INSERT INTO control_plane.client_systems (client_id, system_code, status)
SELECT client.id, system.code, 'AVAILABLE'
FROM control_plane.clients client
CROSS JOIN control_plane.systems system
WHERE system.code IN ('site', 'legal')
ON CONFLICT (client_id, system_code, environment) DO NOTHING;

INSERT INTO control_plane.client_integrations (client_id, integration_code, status)
SELECT client.id, 'whatsapp', 'NOT_CONFIGURED'
FROM control_plane.clients client
ON CONFLICT (client_id, integration_code, environment) DO NOTHING;

REVOKE ALL ON control_plane.integrations FROM PUBLIC;
REVOKE ALL ON control_plane.client_integrations FROM PUBLIC;

COMMIT;
