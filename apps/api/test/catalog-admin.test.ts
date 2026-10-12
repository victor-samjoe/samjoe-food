import assert from 'node:assert/strict';
import test from 'node:test';
import type { QueryResultRow } from 'pg';
import { buildApp } from '../src/app.js';
import type { Database, TransactionalDatabase } from '../src/catalog.js';

type SessionRow = {
  session_id: string; user_id: string; email: string; display_name: string;
  tenant_id: string; tenant_name: string; tenant_slug: string;
  role: 'OWNER' | 'ADMIN' | 'OPERATOR' | 'VIEWER';
};

function buildPool(overrides: Record<string, unknown[]> = {}): TransactionalDatabase {
  const defaults: Record<string, unknown[]> = {
    'SELECT 1': [{ '?column?': 1 }],
  };
  const all = { ...defaults, ...overrides };

  const pool: TransactionalDatabase = {
    async query<T extends QueryResultRow>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
      for (const [key, rows] of Object.entries(all)) {
        if (sql.includes(key)) return { rows: rows as T[] };
      }
      return { rows: [] };
    },
    async transaction<T>(op: (db: Database) => Promise<T>): Promise<T> {
      return op(pool);
    },
  };
  return pool;
}

const validSession: SessionRow = {
  session_id: 'sess-1', user_id: 'user-1', email: 'admin@test.example', display_name: 'Admin',
  tenant_id: 'tenant-a', tenant_name: 'Doce Horizonte', tenant_slug: 'doce-horizonte-demo',
  role: 'OWNER',
};

const viewerSession: SessionRow = { ...validSession, role: 'VIEWER', session_id: 'sess-2' };

test('GET /v1/admin/stores requer autenticação', async () => {
  const app = buildApp({ pool: buildPool() });
  const res = await app.inject({ method: 'GET', url: '/v1/admin/stores' });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error.code, 'unauthorized');
  await app.close();
});

test('GET /v1/admin/stores retorna lojas do tenant autenticado', async () => {
  const pool = buildPool({
    'FROM auth_sessions': [validSession],
    'FROM stores WHERE tenant_id': [
      { store_id: 'store-a', store_slug: 'doce-horizonte-centro', store_name: 'Centro', currency: 'BRL' },
    ],
  });
  const app = buildApp({ pool });
  const res = await app.inject({
    method: 'GET', url: '/v1/admin/stores',
    headers: { authorization: 'Bearer demo-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
  });
  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.json().stores));
  await app.close();
});

test('GET /v1/admin/stores retorna 403 para VIEWER', async () => {
  const pool = buildPool({ 'FROM auth_sessions': [viewerSession] });
  const app = buildApp({ pool });
  const res = await app.inject({
    method: 'GET', url: '/v1/admin/stores',
    headers: { authorization: 'Bearer demo-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().error.code, 'forbidden');
  await app.close();
});

test('GET /v1/admin/stores/:storeSlug/products lista produtos com dados de legacy', async () => {
  const pool = buildPool({
    'FROM auth_sessions': [validSession],
    'FROM stores': [{ store_id: 'store-a', store_slug: 'doce-horizonte-centro', store_name: 'Centro', currency: 'BRL' }],
    'FROM stores\nJOIN products': [
      {
        product_id: 'prod-1', product_name: 'Bolo Aurora', description: null, is_active: true,
        category_id: 'cat-1', category_name: 'Bolos no pote',
        variant_id: 'var-1', sku: 'A-250', variant_name: '250 ml', price_cents: 1200, currency: 'BRL',
        inventory_policy: 'TRACKED', variant_active: true, legacy_id: 'P001',
      },
    ],
  });
  const app = buildApp({ pool });
  const res = await app.inject({
    method: 'GET', url: '/v1/admin/stores/doce-horizonte-centro/products',
    headers: { authorization: 'Bearer demo-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(Array.isArray(body.products));
  await app.close();
});

test('PATCH /v1/admin/products/:id rejeita corpo vazio', async () => {
  const pool = buildPool({ 'FROM auth_sessions': [validSession] });
  const app = buildApp({ pool });
  const res = await app.inject({
    method: 'PATCH', url: '/v1/admin/products/prod-1',
    headers: { authorization: 'Bearer demo-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    payload: {},
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error.code, 'no_fields');
  await app.close();
});

test('PATCH /v1/admin/products/:id retorna 404 para produto inexistente', async () => {
  const pool = buildPool({ 'FROM auth_sessions': [validSession] });
  const app = buildApp({ pool });
  const res = await app.inject({
    method: 'PATCH', url: '/v1/admin/products/prod-inexistente',
    headers: { authorization: 'Bearer demo-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    payload: { is_active: false },
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error.code, 'product_not_found');
  await app.close();
});

test('PATCH /v1/admin/products/:id atualiza produto existente', async () => {
  const pool = buildPool({
    'FROM auth_sessions': [validSession],
    'UPDATE products': [{ product_id: 'prod-1' }],
  });
  const app = buildApp({ pool });
  const res = await app.inject({
    method: 'PATCH', url: '/v1/admin/products/prod-1',
    headers: { authorization: 'Bearer demo-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    payload: { name: 'Novo nome', is_active: false },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().product_id, 'prod-1');
  await app.close();
});
