BEGIN;

CREATE SCHEMA IF NOT EXISTS control_plane;

CREATE TABLE control_plane.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'OWNER' CHECK (role IN ('OWNER')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  must_change_password boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX control_plane_admin_users_email_unique
  ON control_plane.admin_users (lower(email));

CREATE TABLE control_plane.admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES control_plane.admin_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX control_plane_admin_sessions_active
  ON control_plane.admin_sessions (token_hash, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE control_plane.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  trade_name text NOT NULL,
  legal_name text,
  status text NOT NULL DEFAULT 'ONBOARDING'
    CHECK (status IN ('ONBOARDING', 'ACTIVE', 'SUSPENDED', 'CLOSED')),
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE control_plane.systems (
  code text PRIMARY KEY,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE control_plane.client_systems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES control_plane.clients(id) ON DELETE CASCADE,
  system_code text NOT NULL REFERENCES control_plane.systems(code),
  environment text NOT NULL DEFAULT 'PRODUCTION'
    CHECK (environment IN ('DEVELOPMENT', 'STAGING', 'PRODUCTION')),
  external_tenant_id uuid,
  external_tenant_slug text,
  base_url text,
  status text NOT NULL DEFAULT 'PROVISIONING'
    CHECK (status IN ('AVAILABLE', 'PROVISIONING', 'ACTIVE', 'DEGRADED', 'SUSPENDED', 'ERROR', 'DEPROVISIONED')),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  provisioned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, system_code, environment)
);

CREATE UNIQUE INDEX control_plane_external_tenant_unique
  ON control_plane.client_systems (system_code, environment, external_tenant_id)
  WHERE external_tenant_id IS NOT NULL;

CREATE TABLE control_plane.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_system_id uuid NOT NULL REFERENCES control_plane.client_systems(id) ON DELETE CASCADE,
  plan_code text NOT NULL,
  status text NOT NULL DEFAULT 'TRIAL'
    CHECK (status IN ('TRIAL', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELLED')),
  monthly_amount_cents integer NOT NULL DEFAULT 0 CHECK (monthly_amount_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'BRL',
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_system_id)
);

CREATE TABLE control_plane.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_admin_user_id uuid REFERENCES control_plane.admin_users(id),
  client_id uuid REFERENCES control_plane.clients(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  after_data jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO control_plane.systems (code, name) VALUES
  ('food_app', 'SamJoE Food'),
  ('sales_engine', 'SamJoE Sales Engine')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE';

INSERT INTO control_plane.clients (slug, trade_name, legal_name, status, timezone)
SELECT tenant.slug, tenant.name, profile.legal_name, 'ACTIVE', tenant.timezone
FROM public.tenants tenant
LEFT JOIN public.tenant_onboarding_profiles profile ON profile.tenant_id = tenant.id
ON CONFLICT (slug) DO UPDATE SET
  trade_name = EXCLUDED.trade_name,
  legal_name = COALESCE(EXCLUDED.legal_name, control_plane.clients.legal_name),
  updated_at = now();

INSERT INTO control_plane.client_systems (
  client_id, system_code, external_tenant_id, external_tenant_slug,
  base_url, status, provisioned_at
)
SELECT client.id, 'food_app', tenant.id, tenant.slug,
  'https://samjoe-food-web.victor-conceicao.workers.dev/loja/' || tenant.slug,
  'ACTIVE', tenant.created_at
FROM control_plane.clients client
JOIN public.tenants tenant ON tenant.slug = client.slug
ON CONFLICT (client_id, system_code, environment) DO UPDATE SET
  external_tenant_id = EXCLUDED.external_tenant_id,
  external_tenant_slug = EXCLUDED.external_tenant_slug,
  base_url = EXCLUDED.base_url,
  status = 'ACTIVE',
  updated_at = now();

INSERT INTO control_plane.client_systems (
  client_id, system_code, external_tenant_slug, status
)
SELECT client.id, 'sales_engine', client.slug, 'AVAILABLE'
FROM control_plane.clients client
ON CONFLICT (client_id, system_code, environment) DO NOTHING;

INSERT INTO control_plane.subscriptions (client_system_id, plan_code, status, monthly_amount_cents)
SELECT client_system.id, 'internal-preview', 'TRIAL', 0
FROM control_plane.client_systems client_system
ON CONFLICT (client_system_id) DO NOTHING;

REVOKE ALL ON SCHEMA control_plane FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA control_plane FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA control_plane REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA control_plane REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA control_plane REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

COMMIT;
