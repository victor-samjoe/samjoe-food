import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Database, TransactionalDatabase } from './catalog.js';

type LoginBody = { email: string; password: string };
type ControlSession = {
  session_id: string;
  admin_user_id: string;
  email: string;
  display_name: string;
  role: 'OWNER';
  must_change_password: boolean;
};

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function temporaryPassword() {
  return `Sj!${randomBytes(15).toString('base64url')}`;
}

function bearerToken(request: FastifyRequest): string | null {
  const value = request.headers.authorization;
  if (!value?.startsWith('Bearer ')) return null;
  const token = value.slice(7).trim();
  return token.length >= 32 ? token : null;
}

async function resolveControlSession(request: FastifyRequest, database: Database) {
  const token = bearerToken(request);
  if (!token) return null;
  const { rows } = await database.query<ControlSession>(`
    SELECT session.id AS session_id, admin.id AS admin_user_id, admin.email,
      admin.display_name, admin.role, admin.must_change_password
    FROM control_plane.admin_sessions session
    JOIN control_plane.admin_users admin
      ON admin.id = session.admin_user_id AND admin.status = 'ACTIVE'
    WHERE session.token_hash = $1
      AND session.revoked_at IS NULL
      AND session.expires_at > now()
    LIMIT 1
  `, [tokenHash(token)]);
  return rows[0] ?? null;
}

export function registerControlCenterRoutes(app: FastifyInstance, database: TransactionalDatabase) {
  app.post<{ Body: LoginBody }>('/v1/control/auth/login', {
    schema: {
      body: {
        type: 'object', additionalProperties: false, required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', maxLength: 320 },
          password: { type: 'string', minLength: 12, maxLength: 200 },
        },
      },
    },
  }, async (request, reply) => {
    const { rows } = await database.query<ControlSession>(`
      SELECT id AS admin_user_id, email, display_name, role, must_change_password,
        gen_random_uuid()::text AS session_id
      FROM control_plane.admin_users
      WHERE lower(email) = lower($1)
        AND status = 'ACTIVE'
        AND password_hash = crypt($2, password_hash)
      LIMIT 1
    `, [request.body.email, request.body.password]);
    const admin = rows[0];
    if (!admin) return reply.status(401).send({
      error: { code: 'invalid_credentials', message: 'Credenciais inválidas.', request_id: request.id },
    });

    const accessToken = randomBytes(32).toString('base64url');
    await database.query(`
      INSERT INTO control_plane.admin_sessions (admin_user_id, token_hash, expires_at)
      VALUES ($1, $2, now() + interval '8 hours')
    `, [admin.admin_user_id, tokenHash(accessToken)]);
    await database.query(`
      UPDATE control_plane.admin_users SET last_login_at = now(), updated_at = now() WHERE id = $1
    `, [admin.admin_user_id]);
    await database.query(`
      INSERT INTO control_plane.audit_events (actor_admin_user_id, action, entity_type, entity_id)
      VALUES ($1, 'control.login', 'admin_user', $1)
    `, [admin.admin_user_id]);

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 28_800,
      must_change_password: admin.must_change_password,
      user: { id: admin.admin_user_id, email: admin.email, display_name: admin.display_name, role: admin.role },
    };
  });

  app.get('/v1/control/overview', async (request, reply) => {
    const session = await resolveControlSession(request, database);
    if (!session) return reply.status(401).send({
      error: { code: 'unauthorized', message: 'Sessão master ausente ou expirada.', request_id: request.id },
    });

    const { rows: clients } = await database.query<{
      id: string; slug: string; trade_name: string; legal_name: string | null; status: string;
      food_tenant_id: string | null; stores_count: string;
      owner_email: string | null; primary_domain: string | null; domain_status: string | null;
      monthly_amount_cents: string;
    }>(`
      SELECT client.id, client.slug, client.trade_name, client.legal_name, client.status,
        food.external_tenant_id AS food_tenant_id,
        (SELECT count(*)::text FROM public.stores store WHERE store.tenant_id = food.external_tenant_id) AS stores_count,
        (SELECT profile.contact_email FROM public.tenant_onboarding_profiles profile
          WHERE profile.tenant_id = food.external_tenant_id) AS owner_email,
        (SELECT domain.hostname FROM public.store_domains domain
          WHERE domain.tenant_id = food.external_tenant_id
          ORDER BY domain.is_primary DESC, domain.created_at LIMIT 1) AS primary_domain,
        (SELECT domain.status FROM public.store_domains domain
          WHERE domain.tenant_id = food.external_tenant_id
          ORDER BY domain.is_primary DESC, domain.created_at LIMIT 1) AS domain_status,
        COALESCE((SELECT sum(subscription.monthly_amount_cents)::text
          FROM control_plane.subscriptions subscription
          JOIN control_plane.client_systems system ON system.id = subscription.client_system_id
          WHERE system.client_id = client.id AND subscription.status IN ('TRIAL', 'ACTIVE', 'PAST_DUE')), '0') AS monthly_amount_cents
      FROM control_plane.clients client
      LEFT JOIN control_plane.client_systems food
        ON food.client_id = client.id AND food.system_code = 'food_app' AND food.environment = 'PRODUCTION'
      ORDER BY client.created_at DESC
    `);

    const { rows: products } = await database.query<{
      client_id: string; code: string; name: string; status: string; base_url: string | null;
      configuration: Record<string, unknown>; plan_code: string | null;
      billing_status: string | null; monthly_amount_cents: string;
    }>(`
      SELECT client_system.client_id, system.code, system.name,
        client_system.status, client_system.base_url, client_system.configuration,
        subscription.plan_code, subscription.status AS billing_status,
        COALESCE(subscription.monthly_amount_cents, 0)::text AS monthly_amount_cents
      FROM control_plane.client_systems client_system
      JOIN control_plane.systems system ON system.code = client_system.system_code
      LEFT JOIN control_plane.subscriptions subscription
        ON subscription.client_system_id = client_system.id
      WHERE client_system.environment = 'PRODUCTION' AND system.status = 'ACTIVE'
      ORDER BY system.name
    `);

    const { rows: integrations } = await database.query<{
      client_id: string; code: string; name: string; parent_system_code: string;
      status: string; last_checked_at: string | null;
    }>(`
      SELECT client_integration.client_id, integration.code, integration.name,
        integration.parent_system_code, client_integration.status,
        client_integration.last_checked_at::text
      FROM control_plane.client_integrations client_integration
      JOIN control_plane.integrations integration
        ON integration.code = client_integration.integration_code
      WHERE client_integration.environment = 'PRODUCTION' AND integration.status = 'ACTIVE'
      ORDER BY integration.name
    `);

    const normalized = clients.map((client) => ({
      ...client,
      stores_count: Number(client.stores_count),
      monthly_amount_cents: Number(client.monthly_amount_cents),
      products: Object.fromEntries(products
        .filter((product) => product.client_id === client.id)
        .map((product) => [product.code, {
          name: product.name, status: product.status, url: product.base_url,
          configuration: product.configuration,
          plan_code: product.plan_code,
          billing_status: product.billing_status,
          monthly_amount_cents: Number(product.monthly_amount_cents),
        }])),
      integrations: Object.fromEntries(integrations
        .filter((integration) => integration.client_id === client.id)
        .map((integration) => [integration.code, {
          name: integration.name,
          parent_system_code: integration.parent_system_code,
          status: integration.status,
          last_checked_at: integration.last_checked_at,
        }])),
    }));
    const productStatus = (client: typeof normalized[number], code: string) =>
      client.products[code]?.status;
    const integrationStatus = (client: typeof normalized[number], code: string) =>
      client.integrations[code]?.status;
    return {
      user: { id: session.admin_user_id, email: session.email, display_name: session.display_name, role: session.role },
      summary: {
        clients: normalized.length,
        active_clients: normalized.filter((client) => client.status === 'ACTIVE').length,
        active_food: normalized.filter((client) => productStatus(client, 'food_app') === 'ACTIVE').length,
        active_sales: normalized.filter((client) => productStatus(client, 'sales_engine') === 'ACTIVE').length,
        active_sites: normalized.filter((client) => productStatus(client, 'site') === 'ACTIVE').length,
        active_legal: normalized.filter((client) => productStatus(client, 'legal') === 'ACTIVE').length,
        connected_whatsapp: normalized.filter((client) => integrationStatus(client, 'whatsapp') === 'CONNECTED').length,
        monthly_revenue_cents: normalized.reduce((total, client) => total + client.monthly_amount_cents, 0),
      },
      clients: normalized,
    };
  });

  app.get<{ Params: { clientId: string } }>('/v1/control/clients/:clientId/users', async (request, reply) => {
    const session = await resolveControlSession(request, database);
    if (!session) return reply.status(401).send({
      error: { code: 'unauthorized', message: 'Sessão master ausente ou expirada.', request_id: request.id },
    });

    const { rows } = await database.query<{
      id: string; email: string; display_name: string; status: string;
      role: string; membership_status: string; must_change_password: boolean;
    }>(`
      SELECT users.id, users.email, users.display_name, users.status,
        membership.role, membership.status AS membership_status,
        users.must_change_password
      FROM control_plane.client_systems client_system
      JOIN public.tenant_memberships membership
        ON membership.tenant_id = client_system.external_tenant_id
      JOIN public.users users ON users.id = membership.user_id
      WHERE client_system.client_id = $1
        AND client_system.system_code = 'food_app'
        AND client_system.environment = 'PRODUCTION'
      ORDER BY users.display_name, users.email
    `, [request.params.clientId]);
    return { users: rows };
  });

  app.post<{
    Params: { clientId: string };
    Body: { email: string; display_name: string; role: 'OWNER' | 'ADMIN' | 'OPERATOR' | 'VIEWER' };
  }>('/v1/control/clients/:clientId/users', {
    schema: {
      body: {
        type: 'object', additionalProperties: false,
        required: ['email', 'display_name', 'role'],
        properties: {
          email: { type: 'string', format: 'email', maxLength: 320 },
          display_name: { type: 'string', minLength: 2, maxLength: 120 },
          role: { type: 'string', enum: ['OWNER', 'ADMIN', 'OPERATOR', 'VIEWER'] },
        },
      },
    },
  }, async (request, reply) => {
    const session = await resolveControlSession(request, database);
    if (!session) return reply.status(401).send({
      error: { code: 'unauthorized', message: 'Sessão master ausente ou expirada.', request_id: request.id },
    });
    const { rows: systems } = await database.query<{ tenant_id: string }>(`
      SELECT external_tenant_id AS tenant_id
      FROM control_plane.client_systems
      WHERE client_id = $1 AND system_code = 'food_app'
        AND environment = 'PRODUCTION' AND external_tenant_id IS NOT NULL
      LIMIT 1
    `, [request.params.clientId]);
    const tenantId = systems[0]?.tenant_id;
    if (!tenantId) return reply.status(409).send({
      error: { code: 'access_adapter_unavailable', message: 'Este cliente ainda não possui acesso do SamJoE Food para administrar.', request_id: request.id },
    });
    const { rows: existing } = await database.query<{ id: string }>(`
      SELECT id FROM public.users WHERE lower(email) = lower($1) LIMIT 1
    `, [request.body.email]);
    if (existing[0]) return reply.status(409).send({
      error: { code: 'user_exists', message: 'Este e-mail já existe. Use a redefinição de senha ou vincule o usuário existente.', request_id: request.id },
    });

    const generatedPassword = temporaryPassword();
    const created = await database.transaction(async (transaction) => {
      const { rows } = await transaction.query<{ id: string }>(`
        INSERT INTO public.users (email, display_name, password_hash, must_change_password)
        VALUES (lower($1), $2, crypt($3, gen_salt('bf', 12)), true)
        RETURNING id
      `, [request.body.email, request.body.display_name, generatedPassword]);
      const userId = rows[0]!.id;
      await transaction.query(`
        INSERT INTO public.tenant_memberships (tenant_id, user_id, role, status)
        VALUES ($1, $2, $3, 'ACTIVE')
      `, [tenantId, userId, request.body.role]);
      await transaction.query(`
        INSERT INTO control_plane.audit_events
          (actor_admin_user_id, client_id, action, entity_type, entity_id, after_data)
        VALUES ($1, $2, 'access.user_created', 'food_user', $3,
          jsonb_build_object('email', lower($4), 'role', $5))
      `, [session.admin_user_id, request.params.clientId, userId, request.body.email, request.body.role]);
      return userId;
    });
    return reply.status(201).send({
      user: { id: created, email: request.body.email.toLowerCase(), display_name: request.body.display_name, role: request.body.role },
      temporary_password: generatedPassword,
      must_change_password: true,
    });
  });

  app.post<{ Params: { clientId: string; userId: string } }>(
    '/v1/control/clients/:clientId/users/:userId/reset-password',
    async (request, reply) => {
      const session = await resolveControlSession(request, database);
      if (!session) return reply.status(401).send({
        error: { code: 'unauthorized', message: 'Sessão master ausente ou expirada.', request_id: request.id },
      });
      const { rows } = await database.query<{ id: string; email: string }>(`
        SELECT users.id, users.email
        FROM control_plane.client_systems client_system
        JOIN public.tenant_memberships membership
          ON membership.tenant_id = client_system.external_tenant_id
        JOIN public.users users ON users.id = membership.user_id
        WHERE client_system.client_id = $1 AND client_system.system_code = 'food_app'
          AND users.id = $2
        LIMIT 1
      `, [request.params.clientId, request.params.userId]);
      const user = rows[0];
      if (!user) return reply.status(404).send({
        error: { code: 'user_not_found', message: 'Usuário não encontrado neste cliente.', request_id: request.id },
      });

      const generatedPassword = temporaryPassword();
      await database.transaction(async (transaction) => {
        await transaction.query(`
          UPDATE public.users SET password_hash = crypt($2, gen_salt('bf', 12)),
            must_change_password = true, updated_at = now()
          WHERE id = $1
        `, [user.id, generatedPassword]);
        await transaction.query(`
          UPDATE public.auth_sessions SET revoked_at = now()
          WHERE user_id = $1 AND revoked_at IS NULL
        `, [user.id]);
        await transaction.query(`
          INSERT INTO control_plane.audit_events
            (actor_admin_user_id, client_id, action, entity_type, entity_id, after_data)
          VALUES ($1, $2, 'access.password_reset', 'food_user', $3,
            jsonb_build_object('email', $4, 'sessions_revoked', true))
        `, [session.admin_user_id, request.params.clientId, user.id, user.email]);
      });
      return {
        user: { id: user.id, email: user.email },
        temporary_password: generatedPassword,
        must_change_password: true,
      };
    },
  );
}
