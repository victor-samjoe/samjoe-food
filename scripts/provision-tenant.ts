import pg from 'pg';
import {
  buildProvisioningInput,
  createTemporaryPassword,
  type ProvisioningInput,
} from './tenant-provisioning.js';

type ParsedArguments = { values: Record<string, string | undefined>; apply: boolean };
type TenantRow = { id: string; name: string; slug: string };
type ExistingTenantRow = TenantRow & {
  document_type: string | null;
  document_number: string | null;
  contact_email: string | null;
};
type UserRow = { id: string; email: string; created: boolean };
type StoreRow = { id: string; name: string; slug: string };

export function parseArguments(argv: string[]): ParsedArguments {
  const values: Record<string, string | undefined> = {};
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === '--apply') {
      apply = true;
      continue;
    }
    if (!argument.startsWith('--')) throw new Error(`Argumento inválido: ${argument}`);
    const name = argument.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Valor ausente para --${name}`);
    values[name] = value;
    index += 1;
  }
  return { values, apply };
}

export function publicResult(input: ProvisioningInput) {
  return {
    tenant: { name: input.businessName, slug: input.tenantSlug },
    store: { name: input.storeName, slug: input.storeSlug },
    owner: { name: input.ownerName, email: input.email },
    legal_profile: {
      legal_name: input.legalName,
      document_type: input.documentType,
      document_last4: input.documentNumber.slice(-4),
      birth_date_collected: input.birthDate !== null,
    },
    urls: {
      storefront: `https://lojas.samjoe.com.br/${input.storeSlug}`,
      admin: 'https://lojas.samjoe.com.br/admin',
      custom_domain: input.domain ? `https://${input.domain}` : null,
    },
  };
}

export async function provisionTenantInTransaction(client: pg.PoolClient, input: ProvisioningInput) {
  const temporaryPassword = createTemporaryPassword();
  await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('tenant:' || $1, 0))",
      [input.tenantSlug],
    );
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('user:' || lower($1), 0))",
      [input.email],
    );

    const existingTenantResult = await client.query<ExistingTenantRow>(`
      SELECT t.id, t.name, t.slug, profile.document_type, profile.document_number, profile.contact_email
      FROM tenants t
      LEFT JOIN tenant_onboarding_profiles profile ON profile.tenant_id = t.id
      WHERE t.slug = $1
      FOR UPDATE OF t
    `, [input.tenantSlug]);
    const existingTenant = existingTenantResult.rows[0];
    if (existingTenant && !existingTenant.document_number) {
      throw new Error(
        `O tenant '${input.tenantSlug}' já existe sem perfil de onboarding. Faça a vinculação manual antes de executar novamente.`,
      );
    }
    if (existingTenant && (
      existingTenant.document_type !== input.documentType
      || existingTenant.document_number !== input.documentNumber
    )) {
      throw new Error(`O tenant '${input.tenantSlug}' já pertence a outro CPF/CNPJ.`);
    }
    if (existingTenant?.contact_email && existingTenant.contact_email.toLowerCase() !== input.email) {
      throw new Error(
        `O tenant '${input.tenantSlug}' já possui outro e-mail responsável. Transferências exigem procedimento específico.`,
      );
    }

    const tenantResult = await client.query<TenantRow>(`
      INSERT INTO tenants (name, slug, timezone, status)
      VALUES ($1, $2, 'America/Sao_Paulo', 'ACTIVE')
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE', updated_at = now()
      RETURNING id, name, slug
    `, [input.businessName, input.tenantSlug]);
    const tenant = tenantResult.rows[0]!;

    const userResult = await client.query<UserRow>(`
      WITH existing AS (
        SELECT id, email, false AS created FROM users WHERE lower(email) = lower($1)
      ), inserted AS (
        INSERT INTO users (email, display_name, password_hash, must_change_password)
        SELECT $1, $2, crypt($3, gen_salt('bf', 12)), true
        WHERE NOT EXISTS (SELECT 1 FROM existing)
        RETURNING id, email, true AS created
      )
      SELECT * FROM inserted UNION ALL SELECT * FROM existing LIMIT 1
    `, [input.email, input.ownerName, temporaryPassword]);
    const user = userResult.rows[0]!;

    await client.query(`
      INSERT INTO tenant_memberships (tenant_id, user_id, role, status)
      VALUES ($1, $2, 'OWNER', 'ACTIVE')
      ON CONFLICT (tenant_id, user_id) DO UPDATE
      SET role = 'OWNER', status = 'ACTIVE', updated_at = now()
    `, [tenant.id, user.id]);

    const storeResult = await client.query<StoreRow>(`
      INSERT INTO stores (tenant_id, name, slug, timezone, currency, status, delivery_status)
      VALUES ($1, $2, $3, 'America/Sao_Paulo', 'BRL', 'ACTIVE', 'PENDING')
      ON CONFLICT (slug) DO UPDATE
      SET name = EXCLUDED.name, status = 'ACTIVE', updated_at = now()
      WHERE stores.tenant_id = EXCLUDED.tenant_id
      RETURNING id, name, slug
    `, [tenant.id, input.storeName, input.storeSlug]);
    if (!storeResult.rows[0]) throw new Error(`O slug de loja '${input.storeSlug}' pertence a outro tenant.`);
    const store = storeResult.rows[0];

    await client.query(`
      INSERT INTO tenant_onboarding_profiles (
        tenant_id, owner_user_id, legal_name, trade_name, document_type,
        document_number, birth_date, contact_email, onboarding_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PROVISIONED')
      ON CONFLICT (tenant_id) DO UPDATE SET
        owner_user_id = EXCLUDED.owner_user_id,
        legal_name = EXCLUDED.legal_name,
        trade_name = EXCLUDED.trade_name,
        document_type = EXCLUDED.document_type,
        document_number = EXCLUDED.document_number,
        birth_date = EXCLUDED.birth_date,
        contact_email = EXCLUDED.contact_email,
        updated_at = now()
    `, [tenant.id, user.id, input.legalName, input.businessName, input.documentType,
      input.documentNumber, input.birthDate, input.email]);

    if (input.domain) {
      const domainOwner = await client.query<{ tenant_id: string }>(
        'SELECT tenant_id FROM store_domains WHERE lower(hostname) = lower($1)',
        [input.domain],
      );
      if (domainOwner.rows[0] && domainOwner.rows[0].tenant_id !== tenant.id) {
        throw new Error(`O domínio '${input.domain}' já pertence a outro tenant.`);
      }
      await client.query(`
        INSERT INTO store_domains (tenant_id, store_id, hostname, is_primary, status)
        VALUES ($1, $2, $3, false, 'PENDING')
        ON CONFLICT (lower(hostname)) DO UPDATE SET
          store_id = EXCLUDED.store_id, status = 'PENDING', verification_token = null,
          verified_at = null, updated_at = now()
      `, [tenant.id, store.id, input.domain]);
    }

    const controlClient = await client.query<{ id: string }>(`
      INSERT INTO control_plane.clients (slug,trade_name,legal_name,status,timezone)
      VALUES ($1,$2,$3,'ACTIVE','America/Sao_Paulo')
      ON CONFLICT (slug) DO UPDATE SET trade_name=EXCLUDED.trade_name,legal_name=EXCLUDED.legal_name,updated_at=now()
      RETURNING id
    `, [input.tenantSlug, input.businessName, input.legalName]);
    await client.query(`
      INSERT INTO control_plane.client_systems (
        client_id,system_code,environment,external_tenant_id,external_tenant_slug,
        base_url,status,configuration,provisioned_at
      ) VALUES ($1,'food_app','PRODUCTION',$2,$3,$4,'ACTIVE',$5::jsonb,now())
      ON CONFLICT (client_id,system_code,environment) DO UPDATE SET
        external_tenant_id=EXCLUDED.external_tenant_id,
        external_tenant_slug=EXCLUDED.external_tenant_slug,
        base_url=EXCLUDED.base_url,status='ACTIVE',configuration=EXCLUDED.configuration,updated_at=now()
    `, [controlClient.rows[0]!.id, tenant.id, input.tenantSlug,
      `https://lojas.samjoe.com.br/${input.storeSlug}`,
      JSON.stringify({ delivery_status: 'PENDING', provisional_url: `https://lojas.samjoe.com.br/${input.storeSlug}` })]);

    await client.query(`
      INSERT INTO audit_events (tenant_id, actor_type, action, entity_type, entity_id, after_data)
      VALUES ($1, 'ADMIN', 'tenant.provisioned', 'tenant', $1, $2::jsonb)
    `, [tenant.id, JSON.stringify({ store_id: store.id, owner_user_id: user.id, domain: input.domain })]);

  return { tenant, store, user, temporaryPassword: user.created ? temporaryPassword : null };
}

export async function provision(input: ProvisioningInput, connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 1, idleTimeoutMillis: 10_000 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await provisionTenantInTransaction(client, input);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const { values, apply } = parseArguments(process.argv.slice(2));
  const input = buildProvisioningInput(values);
  const summary = publicResult(input);

  if (!apply) {
    console.log(JSON.stringify({ mode: 'dry-run', ...summary }, null, 2));
    console.log('\nNenhuma alteração foi aplicada. Revise e repita com --apply.');
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL é obrigatória para usar --apply.');
  const result = await provision(input, connectionString);
  console.log(JSON.stringify({
    mode: 'applied',
    ...summary,
    ids: { tenant: result.tenant.id, store: result.store.id, owner: result.user.id },
    credentials: result.temporaryPassword
      ? { temporary_password: result.temporaryPassword, must_change_password: true }
      : { temporary_password: null, note: 'Usuário existente: a senha não foi alterada.' },
  }, null, 2));
  console.log('\nA senha temporária é exibida uma única vez. Entregue-a por canal seguro e não a registre em tarefas ou tickets.');
}

if (process.argv[1] && /(?:^|[\\/])provision-tenant\.(?:ts|js)$/.test(process.argv[1])) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
