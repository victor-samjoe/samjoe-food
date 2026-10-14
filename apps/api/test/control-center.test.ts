import assert from 'node:assert/strict';
import test from 'node:test';
import type { QueryResultRow } from 'pg';
import { buildApp } from '../src/app.js';
import type { Database, TransactionalDatabase } from '../src/catalog.js';
import { domainVerificationRecord } from '../src/control-center.js';

function poolWith(rowsBySql: Record<string, unknown[]>): TransactionalDatabase {
  const pool: TransactionalDatabase = {
    async query<T extends QueryResultRow>(sql: string): Promise<{ rows: T[] }> {
      for (const [fragment, rows] of Object.entries(rowsBySql)) {
        if (sql.includes(fragment)) return { rows: rows as T[] };
      }
      return { rows: [] };
    },
    async transaction<T>(operation: (database: Database) => Promise<T>) { return operation(pool); },
  };
  return pool;
}

const controlSession = {
  session_id: 'session-1', admin_user_id: 'admin-1', email: 'owner@samjoe.example',
  display_name: 'Victor', role: 'OWNER', must_change_password: false,
};

test('GET /v1/control/overview exige sessão master independente', async () => {
  const app = buildApp({ pool: poolWith({}) });
  const response = await app.inject({ method: 'GET', url: '/v1/control/overview' });
  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, 'unauthorized');
  await app.close();
});

test('POST /v1/control/auth/login autentica somente admin da plataforma', async () => {
  const app = buildApp({ pool: poolWith({ 'FROM control_plane.admin_users': [controlSession] }) });
  const response = await app.inject({
    method: 'POST', url: '/v1/control/auth/login',
    payload: { email: 'owner@samjoe.example', password: 'senha-segura-de-teste' },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().user.role, 'OWNER');
  assert.ok(response.json().access_token.length >= 32);
  await app.close();
});

test('GET /v1/control/overview lista clientes e produtos contratados', async () => {
  const app = buildApp({ pool: poolWith({
    'FROM control_plane.admin_sessions': [controlSession],
    'FROM control_plane.clients client': [{
      id: 'client-1', slug: 'samjoe-confeitaria', trade_name: 'SamJoE Confeitaria', legal_name: null,
      status: 'ACTIVE', food_tenant_id: 'tenant-1', stores_count: '1', active_users_count: '1',
      owner_email: null, primary_domain: 'app.confeitaria.samjoe.com.br', domain_status: 'PENDING',
      monthly_amount_cents: '0',
    }],
    'FROM control_plane.client_systems client_system': [
      { client_id: 'client-1', code: 'food_app', name: 'SamJoE Food', status: 'ACTIVE', base_url: 'https://food.test/loja/samjoe-confeitaria', configuration: {}, plan_code: 'starter', billing_status: 'ACTIVE', monthly_amount_cents: '9900' },
      { client_id: 'client-1', code: 'sales_engine', name: 'SamJoE Sales Engine', status: 'AVAILABLE', base_url: null, configuration: {}, plan_code: null, billing_status: null, monthly_amount_cents: '0' },
      { client_id: 'client-1', code: 'site', name: 'Site', status: 'AVAILABLE', base_url: null, configuration: {}, plan_code: null, billing_status: null, monthly_amount_cents: '0' },
      { client_id: 'client-1', code: 'legal', name: 'SamJoE Jurídico', status: 'AVAILABLE', base_url: null, configuration: {}, plan_code: null, billing_status: null, monthly_amount_cents: '0' },
    ],
    'FROM control_plane.client_integrations client_integration': [
      { client_id: 'client-1', code: 'whatsapp', name: 'WhatsApp', parent_system_code: 'sales_engine', status: 'NOT_CONFIGURED', last_checked_at: null },
    ],
  }) });
  const response = await app.inject({
    method: 'GET', url: '/v1/control/overview',
    headers: { authorization: 'Bearer token-master-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().summary.clients, 1);
  assert.equal(response.json().summary.active_food, 1);
  assert.equal(response.json().clients[0].active_users_count, 1);
  assert.equal(response.json().summary.connected_whatsapp, 0);
  assert.equal(response.json().clients[0].products.sales_engine.status, 'AVAILABLE');
  assert.equal(response.json().clients[0].products.site.status, 'AVAILABLE');
  assert.equal(response.json().clients[0].products.food_app.plan_code, 'starter');
  assert.equal(response.json().clients[0].integrations.whatsapp.status, 'NOT_CONFIGURED');
  await app.close();
});

test('GET /v1/control/clients/:id/users lista acessos do Food', async () => {
  const app = buildApp({ pool: poolWith({
    'FROM control_plane.admin_sessions': [controlSession],
    'FROM control_plane.client_systems client_system': [{
      id: 'user-1', email: 'cliente@example.com', display_name: 'Cliente', status: 'ACTIVE',
      role: 'ADMIN', membership_status: 'ACTIVE', must_change_password: false,
    }],
  }) });
  const response = await app.inject({
    method: 'GET', url: '/v1/control/clients/client-1/users',
    headers: { authorization: 'Bearer token-master-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().users[0].email, 'cliente@example.com');
  await app.close();
});

test('POST /v1/control/clients/:id/users cria senha temporária sem persistir texto puro', async () => {
  const app = buildApp({ pool: poolWith({
    'FROM control_plane.admin_sessions': [controlSession],
    'SELECT external_tenant_id AS tenant_id': [{ tenant_id: 'tenant-1' }],
    'SELECT id FROM public.users': [],
    'INSERT INTO public.users': [{ id: 'user-new' }],
  }) });
  const response = await app.inject({
    method: 'POST', url: '/v1/control/clients/client-1/users',
    headers: { authorization: 'Bearer token-master-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    payload: { email: 'novo@example.com', display_name: 'Novo Cliente', role: 'ADMIN' },
  });
  assert.equal(response.statusCode, 201);
  assert.equal(response.json().must_change_password, true);
  assert.ok(response.json().temporary_password.length >= 20);
  await app.close();
});

test('POST reset-password gera credencial temporária e revoga sessões', async () => {
  const app = buildApp({ pool: poolWith({
    'FROM control_plane.admin_sessions': [controlSession],
    'FROM control_plane.client_systems client_system': [{ id: 'user-1', email: 'cliente@example.com' }],
  }) });
  const response = await app.inject({
    method: 'POST', url: '/v1/control/clients/client-1/users/user-1/reset-password',
    headers: { authorization: 'Bearer token-master-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().must_change_password, true);
  assert.ok(response.json().temporary_password.length >= 20);
  await app.close();
});

test('PATCH usuário permite alterar perfil e situação do acesso', async () => {
  const app = buildApp({ pool: poolWith({
    'FROM control_plane.admin_sessions': [controlSession],
    'SELECT membership.tenant_id': [{ tenant_id: 'tenant-1', role: 'ADMIN', membership_status: 'ACTIVE', email: 'cliente@example.com' }],
    'UPDATE public.tenant_memberships': [{ role: 'VIEWER', membership_status: 'DISABLED' }],
  }) });
  const response = await app.inject({
    method: 'PATCH', url: '/v1/control/clients/client-1/users/user-1',
    headers: { authorization: 'Bearer token-master-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    payload: { role: 'VIEWER', status: 'DISABLED' },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().user.role, 'VIEWER');
  assert.equal(response.json().user.membership_status, 'DISABLED');
  await app.close();
});

test('gera registro TXT isolado para verificação de domínio', () => {
  assert.deepEqual(domainVerificationRecord('loja.exemplo.com.br', 'token-123'), {
    type: 'TXT', name: '_samjoe-verification.loja.exemplo.com.br', value: 'token-123',
  });
});

test('GET domínios retorna link provisório e instruções do cliente', async () => {
  const app = buildApp({ pool: poolWith({
    'FROM control_plane.admin_sessions': [controlSession],
    'SELECT system.external_tenant_id AS tenant_id': [{ tenant_id: 'tenant-1', store_id: 'store-1', store_slug: 'cafe-exemplo' }],
    'FROM public.store_domains': [{ id: 'domain-1', hostname: 'loja.exemplo.com.br', status: 'PENDING', is_primary: false, verification_token: 'token-123', verified_at: null }],
  }) });
  const response = await app.inject({
    method: 'GET', url: '/v1/control/clients/client-1/domains',
    headers: { authorization: 'Bearer token-master-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().provisional_url, 'https://lojas.samjoe.com.br/cafe-exemplo');
  assert.equal(response.json().domains[0].verification.name, '_samjoe-verification.loja.exemplo.com.br');
  await app.close();
});
