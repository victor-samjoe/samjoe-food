BEGIN;

CREATE TABLE control_plane.client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES control_plane.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, email)
);

CREATE UNIQUE INDEX control_plane_one_primary_contact
  ON control_plane.client_contacts (client_id)
  WHERE is_primary AND status = 'ACTIVE';

INSERT INTO control_plane.clients (slug, trade_name, legal_name, status) VALUES
  ('loe-clinic', 'Loê Clinic', 'Loê Clinic', 'ACTIVE'),
  ('samjoe-tech', 'SamJoE Tech & Consulting', 'SamJoE Tech & Consulting', 'ACTIVE'),
  ('expatritax-brasil', 'ExpatriTax Brasil', 'ExpatriTax Brasil', 'ONBOARDING')
ON CONFLICT (slug) DO UPDATE SET
  trade_name = EXCLUDED.trade_name,
  legal_name = EXCLUDED.legal_name,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO control_plane.client_systems (
  client_id, system_code, external_tenant_slug, base_url, status, configuration, provisioned_at
)
SELECT client.id, 'site', client.slug,
  CASE client.slug
    WHEN 'loe-clinic' THEN 'https://loe-clinic.vercel.app'
    WHEN 'samjoe-tech' THEN 'https://samjoe.com.br'
  END,
  'ACTIVE',
  jsonb_build_object(
    'hosting_provider', 'vercel',
    'vercel_project', CASE client.slug
      WHEN 'loe-clinic' THEN 'loe-clinic'
      WHEN 'samjoe-tech' THEN 'samjoe-tech'
    END
  ),
  now()
FROM control_plane.clients client
WHERE client.slug IN ('loe-clinic', 'samjoe-tech')
ON CONFLICT (client_id, system_code, environment) DO UPDATE SET
  base_url = EXCLUDED.base_url,
  status = EXCLUDED.status,
  configuration = EXCLUDED.configuration,
  provisioned_at = COALESCE(control_plane.client_systems.provisioned_at, EXCLUDED.provisioned_at),
  updated_at = now();

INSERT INTO control_plane.client_systems (
  client_id, system_code, external_tenant_slug, base_url, status, configuration
)
SELECT client.id, 'legal', client.slug,
  'https://sistema-juridico-piloto.vercel.app',
  'PROVISIONING',
  jsonb_build_object(
    'hosting_provider', 'vercel',
    'vercel_project', 'sistema-juridico-piloto',
    'lifecycle', 'pilot',
    'production_enabled', false
  )
FROM control_plane.clients client
WHERE client.slug = 'expatritax-brasil'
ON CONFLICT (client_id, system_code, environment) DO UPDATE SET
  base_url = EXCLUDED.base_url,
  status = EXCLUDED.status,
  configuration = EXCLUDED.configuration,
  updated_at = now();

INSERT INTO control_plane.subscriptions (client_system_id, plan_code, status, monthly_amount_cents)
SELECT client_system.id, 'legacy-import', 'TRIAL', 0
FROM control_plane.client_systems client_system
JOIN control_plane.clients client ON client.id = client_system.client_id
WHERE client.slug IN ('loe-clinic', 'samjoe-tech', 'expatritax-brasil')
ON CONFLICT (client_system_id) DO NOTHING;

REVOKE ALL ON control_plane.client_contacts FROM PUBLIC;

COMMIT;
