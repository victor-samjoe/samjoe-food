import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Database } from './catalog.js';

type LoginBody = { tenant_slug: string; email: string; password: string };
type ChangePasswordBody = { current_password: string; new_password: string };
export type TenantRole = 'OWNER' | 'ADMIN' | 'OPERATOR' | 'VIEWER';
type LoginRow = {
  user_id: string;
  email: string;
  display_name: string;
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  role: TenantRole;
  must_change_password?: boolean;
};
export type SessionRow = LoginRow & { session_id: string };

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function bearerToken(request: FastifyRequest): string | null {
  const value = request.headers.authorization;
  if (!value?.startsWith('Bearer ')) return null;
  const token = value.slice(7).trim();
  return token.length >= 32 ? token : null;
}

export async function resolveSession(request: FastifyRequest, database: Database): Promise<SessionRow | null> {
  const token = bearerToken(request);
  if (!token) return null;
  const { rows } = await database.query<SessionRow>(`
    SELECT
      s.id AS session_id,
      u.id AS user_id,
      u.email,
      u.display_name,
      t.id AS tenant_id,
      t.name AS tenant_name,
      t.slug AS tenant_slug,
      m.role
    FROM auth_sessions s
    JOIN users u ON u.id = s.user_id AND u.status = 'ACTIVE'
    JOIN tenant_memberships m
      ON m.user_id = s.user_id
     AND m.tenant_id = s.tenant_id
     AND m.status = 'ACTIVE'
    JOIN tenants t ON t.id = s.tenant_id AND t.status = 'ACTIVE'
    WHERE s.token_hash = $1
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
    LIMIT 1
  `, [tokenHash(token)]);
  return rows[0] ?? null;
}

export function registerAuthRoutes(app: FastifyInstance, database: Database) {
  app.post<{ Body: LoginBody }>('/v1/auth/login', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['tenant_slug', 'email', 'password'],
        properties: {
          tenant_slug: { type: 'string', minLength: 1, maxLength: 100 },
          email: { type: 'string', format: 'email', maxLength: 320 },
          password: { type: 'string', minLength: 8, maxLength: 200 },
        },
      },
    },
  }, async (request, reply) => {
    const { tenant_slug, email, password } = request.body;
    const { rows } = await database.query<LoginRow>(`
      SELECT
        u.id AS user_id,
        u.email,
        u.display_name,
        t.id AS tenant_id,
        t.name AS tenant_name,
        t.slug AS tenant_slug,
        m.role,
        u.must_change_password
      FROM users u
      JOIN tenant_memberships m ON m.user_id = u.id AND m.status = 'ACTIVE'
      JOIN tenants t ON t.id = m.tenant_id AND t.status = 'ACTIVE'
      WHERE lower(u.email) = lower($1)
        AND t.slug = $2
        AND u.status = 'ACTIVE'
        AND u.password_hash = crypt($3, u.password_hash)
      LIMIT 1
    `, [email, tenant_slug, password]);

    const identity = rows[0];
    if (!identity) {
      return reply.status(401).send({
        error: { code: 'invalid_credentials', message: 'Credenciais inválidas.', request_id: request.id },
      });
    }

    const accessToken = randomBytes(32).toString('base64url');
    await database.query(`
      INSERT INTO auth_sessions (user_id, tenant_id, token_hash, expires_at)
      VALUES ($1, $2, $3, now() + interval '8 hours')
    `, [identity.user_id, identity.tenant_id, tokenHash(accessToken)]);

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 28_800,
      user: { id: identity.user_id, email: identity.email, display_name: identity.display_name },
      tenant: { id: identity.tenant_id, name: identity.tenant_name, slug: identity.tenant_slug },
      role: identity.role,
      must_change_password: identity.must_change_password ?? false,
    };
  });

  app.post<{ Body: ChangePasswordBody }>('/v1/auth/change-password', {
    schema: {
      body: {
        type: 'object', additionalProperties: false,
        required: ['current_password', 'new_password'],
        properties: {
          current_password: { type: 'string', minLength: 8, maxLength: 200 },
          new_password: { type: 'string', minLength: 12, maxLength: 200 },
        },
      },
    },
  }, async (request, reply) => {
    const session = await resolveSession(request, database);
    if (!session) return reply.status(401).send({
      error: { code: 'unauthorized', message: 'Sessão ausente ou expirada.', request_id: request.id },
    });
    const { rows } = await database.query<{ id: string }>(`
      SELECT id FROM users
      WHERE id = $1 AND password_hash = crypt($2, password_hash)
      LIMIT 1
    `, [session.user_id, request.body.current_password]);
    if (!rows[0]) return reply.status(401).send({
      error: { code: 'invalid_current_password', message: 'Senha atual inválida.', request_id: request.id },
    });
    await database.query(`
      UPDATE users SET password_hash = crypt($2, gen_salt('bf', 12)),
        must_change_password = false, updated_at = now()
      WHERE id = $1
    `, [session.user_id, request.body.new_password]);
    await database.query(`
      UPDATE auth_sessions SET revoked_at = now()
      WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL
    `, [session.user_id, session.session_id]);
    return { changed: true, must_change_password: false };
  });

  app.get('/v1/me', async (request, reply) => {
    const session = await resolveSession(request, database);
    if (!session) {
      return reply.status(401).send({
        error: { code: 'unauthorized', message: 'Sessão ausente ou expirada.', request_id: request.id },
      });
    }
    return {
      user: { id: session.user_id, email: session.email, display_name: session.display_name },
      tenant: { id: session.tenant_id, name: session.tenant_name, slug: session.tenant_slug },
      role: session.role,
    };
  });

  app.get('/v1/admin/tenant', async (request, reply) => {
    const session = await resolveSession(request, database);
    if (!session) {
      return reply.status(401).send({
        error: { code: 'unauthorized', message: 'Sessão ausente ou expirada.', request_id: request.id },
      });
    }
    if (!['OWNER', 'ADMIN'].includes(session.role)) {
      return reply.status(403).send({
        error: { code: 'forbidden', message: 'Permissão insuficiente.', request_id: request.id },
      });
    }
    return { tenant: { id: session.tenant_id, name: session.tenant_name, slug: session.tenant_slug } };
  });
}

