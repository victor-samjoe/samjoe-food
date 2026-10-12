BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

CREATE TABLE tenant_onboarding_profiles (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES users(id),
  legal_name text NOT NULL,
  trade_name text NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('CPF', 'CNPJ')),
  document_number text NOT NULL CHECK (document_number ~ '^[0-9]{11}([0-9]{3})?$'),
  birth_date date,
  contact_email text NOT NULL,
  onboarding_status text NOT NULL DEFAULT 'PROVISIONED'
    CHECK (onboarding_status IN ('PROVISIONED', 'INVITED', 'ACTIVATED', 'SUSPENDED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_type, document_number)
);

ALTER TABLE tenant_onboarding_profiles ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON tenant_onboarding_profiles FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;

COMMENT ON TABLE tenant_onboarding_profiles IS
  'Dados contratuais de onboarding. Acesso exclusivo de provisionamento e control plane.';
COMMENT ON COLUMN tenant_onboarding_profiles.birth_date IS
  'Opcional; coletar somente quando houver finalidade contratual documentada.';

COMMIT;
