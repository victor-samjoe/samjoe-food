import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Database } from './catalog.js';

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

export function registerControlCenterRoutes(app: FastifyInstance, database: Database) {
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
      food_tenant_id: string | null; food_url: string | null; food_status: string | null;
      sales_status: string | null; sales_url: string | null; stores_count: string;
      owner_email: string | null; primary_domain: string | null; domain_status: string | null;
      monthly_amount_cents: string;
    }>(`
      SELECT client.id, client.slug, client.trade_name, client.legal_name, client.status,
        food.external_tenant_id AS food_tenant_id, food.base_url AS food_url, food.status AS food_status,
        sales.status AS sales_status, sales.base_url AS sales_url,
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
      LEFT JOIN control_plane.client_systems sales
        ON sales.client_id = client.id AND sales.system_code = 'sales_engine' AND sales.environment = 'PRODUCTION'
      ORDER BY client.created_at DESC
    `);

    const normalized = clients.map((client) => ({
      ...client,
      stores_count: Number(client.stores_count),
      monthly_amount_cents: Number(client.monthly_amount_cents),
    }));
    return {
      user: { id: session.admin_user_id, email: session.email, display_name: session.display_name, role: session.role },
      summary: {
        clients: normalized.length,
        active_clients: normalized.filter((client) => client.status === 'ACTIVE').length,
        active_food: normalized.filter((client) => client.food_status === 'ACTIVE').length,
        active_sales: normalized.filter((client) => client.sales_status === 'ACTIVE').length,
        monthly_revenue_cents: normalized.reduce((total, client) => total + client.monthly_amount_cents, 0),
      },
      clients: normalized,
    };
  });
}
