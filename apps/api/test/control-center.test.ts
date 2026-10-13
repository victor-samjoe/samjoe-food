import assert from 'node:assert/strict';
import test from 'node:test';
import type { QueryResultRow } from 'pg';
import { buildApp } from '../src/app.js';
import type { Database, TransactionalDatabase } from '../src/catalog.js';

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
      status: 'ACTIVE', food_tenant_id: 'tenant-1', stores_count: '1',
      owner_email: null, primary_domain: 'app.confeitaria.samjoe.com.br', domain_status: 'PENDING',
      monthly_amount_cents: '0',
    }],
    'FROM control_plane.client_systems client_system': [
      { client_id: 'client-1', code: 'food_app', name: 'SamJoE Food', status: 'ACTIVE', base_url: 'https://food.test/loja/samjoe-confeitaria' },
      { client_id: 'client-1', code: 'sales_engine', name: 'SamJoE Sales Engine', status: 'AVAILABLE', base_url: null },
      { client_id: 'client-1', code: 'site', name: 'Site', status: 'AVAILABLE', base_url: null },
      { client_id: 'client-1', code: 'legal', name: 'SamJoE Jurídico', status: 'AVAILABLE', base_url: null },
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
  assert.equal(response.json().summary.connected_whatsapp, 0);
  assert.equal(response.json().clients[0].products.sales_engine.status, 'AVAILABLE');
  assert.equal(response.json().clients[0].products.site.status, 'AVAILABLE');
  assert.equal(response.json().clients[0].integrations.whatsapp.status, 'NOT_CONFIGURED');
  await app.close();
});
