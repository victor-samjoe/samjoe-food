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

const validSession: SessionRow = {
  session_id: 'sess-1', user_id: 'user-1', email: 'admin@test.example', display_name: 'Admin',
  tenant_id: 'tenant-a', tenant_name: 'Doce Horizonte', tenant_slug: 'doce-horizonte-demo',
  role: 'OWNER',
};

function buildPool(overrides: Record<string, unknown[]> = {}): TransactionalDatabase {
  const defaults: Record<string, unknown[]> = { 'SELECT 1': [{ '?column?': 1 }] };
  const all = { ...defaults, ...overrides };
  const pool: TransactionalDatabase = {
    async query<T extends QueryResultRow>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
      if (!values) return { rows: [{ '?column?': 1 } as unknown as T] };
      for (const [key, rows] of Object.entries(all)) {
        if (sql.includes(key)) return { rows: rows as T[] };
      }
      return { rows: [] };
    },
    async transaction<T>(op: (db: Database) => Promise<T>): Promise<T> { return op(pool); },
  };
  return pool;
}

test('GET /v1/admin/stores/:storeSlug/orders requer autenticação', async () => {
  const app = buildApp({ pool: buildPool() });
  const res = await app.inject({ method: 'GET', url: '/v1/admin/stores/demo/orders' });
  assert.equal(res.statusCode, 401);
  await app.close();
});

test('GET /v1/admin/stores/:storeSlug/orders retorna lista paginada', async () => {
  const pool = buildPool({
    'FROM auth_sessions': [validSession],
    'FROM orders': [{
      order_id: 'ord-1', public_number: 'DEMO-ABC', status: 'NEW',
      customer_name: 'João', total_cents: 2400, currency: 'BRL',
      fulfillment: 'DELIVERY', placed_at: '2026-10-10T12:00:00Z', total: 1,
    }],
  });
  const app = buildApp({ pool });
  const res = await app.inject({
    method: 'GET', url: '/v1/admin/stores/doce-horizonte-centro/orders',
    headers: { authorization: 'Bearer demo-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(Array.isArray(body.orders));
  assert.equal(body.orders[0].order_id, 'ord-1');
  await app.close();
});

test('GET /v1/admin/orders/:orderId retorna 404 para pedido inexistente', async () => {
  const pool = buildPool({ 'FROM auth_sessions': [validSession] });
  const app = buildApp({ pool });
  const res = await app.inject({
    method: 'GET', url: '/v1/admin/orders/00000000-0000-0000-0000-000000000000',
    headers: { authorization: 'Bearer demo-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error.code, 'order_not_found');
  await app.close();
});

test('POST /v1/admin/orders/:orderId/transitions rejeita transição inválida', async () => {
  const pool = buildPool({
    'FROM auth_sessions': [validSession],
    'FROM orders WHERE id': [{ order_id: 'ord-1', status: 'NEW', tenant_id: 'tenant-a' }],
  });
  const app = buildApp({ pool });
  const res = await app.inject({
    method: 'POST', url: '/v1/admin/orders/ord-1/transitions',
    headers: { authorization: 'Bearer demo-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    payload: { to: 'COMPLETED' },
  });
  assert.equal(res.statusCode, 422);
  assert.equal(res.json().error.code, 'invalid_transition');
  await app.close();
});

test('POST /v1/admin/orders/:orderId/transitions aplica transição válida', async () => {
  const pool = buildPool({
    'FROM auth_sessions': [validSession],
    'FROM orders WHERE id': [{ order_id: 'ord-1', status: 'NEW', tenant_id: 'tenant-a' }],
    'UPDATE orders': [{ order_id: 'ord-1' }],
    'INSERT INTO order_status_events': [],
    'INSERT INTO integration_outbox': [],
  });
  const app = buildApp({ pool });
  const res = await app.inject({
    method: 'POST', url: '/v1/admin/orders/ord-1/transitions',
    headers: { authorization: 'Bearer demo-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    payload: { to: 'CONFIRMED' },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.from_status, 'NEW');
  assert.equal(body.to_status, 'CONFIRMED');
  await app.close();
});

test('POST transição CANCELLED libera reservas de inventário', async () => {
  const releasedVariants: string[] = [];
  const pool: TransactionalDatabase = {
    async query<T extends QueryResultRow>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
      if (!values) return { rows: [] };
      if (sql.includes('FROM auth_sessions')) return { rows: [validSession as unknown as T] };
      if (sql.includes('FROM orders WHERE id')) return { rows: [{ order_id: 'ord-1', status: 'CONFIRMED', tenant_id: 'tenant-a' } as unknown as T] };
      if (sql.includes('UPDATE inventory_reservations')) {
        return { rows: [{ variant_id: 'var-1', quantity: 2 } as unknown as T] };
      }
      if (sql.includes('UPDATE inventory_levels')) {
        releasedVariants.push(String(values[2]));
        return { rows: [] };
      }
      return { rows: [] };
    },
    async transaction<T>(op: (db: Database) => Promise<T>): Promise<T> { return op(pool); },
  };
  const app = buildApp({ pool });
  const res = await app.inject({
    method: 'POST', url: '/v1/admin/orders/ord-1/transitions',
    headers: { authorization: 'Bearer demo-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    payload: { to: 'CANCELLED' },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(releasedVariants, ['var-1']);
  await app.close();
});
