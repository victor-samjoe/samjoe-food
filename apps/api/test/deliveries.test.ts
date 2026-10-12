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
    async query<T extends QueryResultRow>(sql: string, _values?: unknown[]): Promise<{ rows: T[] }> {
      for (const [key, rows] of Object.entries(all)) {
        if (sql.includes(key)) return { rows: rows as T[] };
      }
      return { rows: [] };
    },
    async transaction<T>(op: (db: Database) => Promise<T>): Promise<T> { return op(pool); },
  };
  return pool;
}

test('GET /v1/admin/stores/:storeSlug/drivers requer autenticação', async () => {
  const app = buildApp({ pool: buildPool() });
  const res = await app.inject({ method: 'GET', url: '/v1/admin/stores/demo/drivers' });
  assert.equal(res.statusCode, 401);
  await app.close();
});

test('GET /v1/admin/stores/:storeSlug/drivers retorna lista de motoristas', async () => {
  const pool = buildPool({
    'FROM auth_sessions': [validSession],
    'FROM drivers d': [
      { driver_id: 'drv-1', name: 'Carlos', phone_e164: '+5511999990001', status: 'AVAILABLE', is_active: true },
      { driver_id: 'drv-2', name: 'Mariana', phone_e164: null, status: 'UNAVAILABLE', is_active: true },
    ],
  });
  const app = buildApp({ pool });
  const res = await app.inject({
    method: 'GET', url: '/v1/admin/stores/doce-horizonte-centro/drivers',
    headers: { authorization: 'Bearer demo-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(Array.isArray(body.drivers));
  assert.equal(body.drivers.length, 2);
  assert.equal(body.drivers[0].name, 'Carlos');
  await app.close();
});

test('POST /v1/admin/orders/:orderId/delivery rejeita pedido não DELIVERY', async () => {
  const pool: TransactionalDatabase = {
    async query<T extends QueryResultRow>(sql: string, _values?: unknown[]): Promise<{ rows: T[] }> {
      if (sql.includes('FROM auth_sessions')) return { rows: [validSession as unknown as T] };
      if (sql.includes('FROM orders WHERE id')) {
        return { rows: [{ address_snapshot: { street: 'R. A', number: '1' }, fulfillment: 'TAKEOUT' } as unknown as T] };
      }
      return { rows: [] };
    },
    async transaction<T>(op: (db: Database) => Promise<T>): Promise<T> { return op(pool); },
  };
  const app = buildApp({ pool });
  const res = await app.inject({
    method: 'POST', url: '/v1/admin/orders/ord-1/delivery',
    headers: { authorization: 'Bearer demo-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    payload: {},
  });
  assert.equal(res.statusCode, 422);
  assert.equal(res.json().error.code, 'not_delivery');
  await app.close();
});

test('POST /v1/admin/orders/:orderId/delivery cria entrega com status PENDING', async () => {
  const insertedDeliveries: unknown[] = [];
  const pool: TransactionalDatabase = {
    async query<T extends QueryResultRow>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
      if (sql.includes('FROM auth_sessions')) return { rows: [validSession as unknown as T] };
      if (sql.includes('FROM orders WHERE id')) {
        return { rows: [{ address_snapshot: { street: 'R. Teste', number: '10' }, fulfillment: 'DELIVERY' } as unknown as T] };
      }
      if (sql.includes('INSERT INTO deliveries')) {
        insertedDeliveries.push(values);
        return { rows: [{ delivery_id: 'del-1' } as unknown as T] };
      }
      return { rows: [] };
    },
    async transaction<T>(op: (db: Database) => Promise<T>): Promise<T> { return op(pool); },
  };
  const app = buildApp({ pool });
  const res = await app.inject({
    method: 'POST', url: '/v1/admin/orders/ord-1/delivery',
    headers: { authorization: 'Bearer demo-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    payload: { instructions: 'Portão azul' },
  });
  assert.equal(res.statusCode, 201);
  assert.equal(res.json().delivery_id, 'del-1');
  assert.equal(insertedDeliveries.length, 1);
  await app.close();
});

test('PATCH /v1/admin/deliveries/:deliveryId rejeita transição inválida', async () => {
  const pool: TransactionalDatabase = {
    async query<T extends QueryResultRow>(sql: string, _values?: unknown[]): Promise<{ rows: T[] }> {
      if (sql.includes('FROM auth_sessions')) return { rows: [validSession as unknown as T] };
      if (sql.includes('FROM deliveries WHERE id')) {
        return { rows: [{ delivery_id: 'del-1', status: 'DELIVERED' } as unknown as T] };
      }
      return { rows: [] };
    },
    async transaction<T>(op: (db: Database) => Promise<T>): Promise<T> { return op(pool); },
  };
  const app = buildApp({ pool });
  const res = await app.inject({
    method: 'PATCH', url: '/v1/admin/deliveries/del-1',
    headers: { authorization: 'Bearer demo-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    payload: { status: 'PENDING' },
  });
  assert.equal(res.statusCode, 422);
  assert.equal(res.json().error.code, 'invalid_transition');
  await app.close();
});

test('PATCH /v1/admin/routes/:routeId libera motorista ao completar rota', async () => {
  const driverUpdates: string[] = [];
  const pool: TransactionalDatabase = {
    async query<T extends QueryResultRow>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
      if (sql.includes('FROM auth_sessions')) return { rows: [validSession as unknown as T] };
      if (sql.includes('FROM delivery_routes WHERE id')) {
        return { rows: [{ route_id: 'rt-1', status: 'IN_PROGRESS', driver_id: 'drv-1' } as unknown as T] };
      }
      if (sql.includes('UPDATE delivery_routes')) return { rows: [] };
      if (sql.includes('UPDATE drivers SET status')) {
        driverUpdates.push(String(values?.[0]));
        return { rows: [] };
      }
      return { rows: [] };
    },
    async transaction<T>(op: (db: Database) => Promise<T>): Promise<T> { return op(pool); },
  };
  const app = buildApp({ pool });
  const res = await app.inject({
    method: 'PATCH', url: '/v1/admin/routes/rt-1',
    headers: { authorization: 'Bearer demo-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    payload: { status: 'COMPLETED' },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(driverUpdates, ['AVAILABLE']);
  await app.close();
});
