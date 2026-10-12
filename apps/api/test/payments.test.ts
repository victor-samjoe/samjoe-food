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

test('GET /v1/admin/orders/:orderId/payment requer autenticação', async () => {
  const app = buildApp({ pool: buildPool() });
  const res = await app.inject({ method: 'GET', url: '/v1/admin/orders/ord-1/payment' });
  assert.equal(res.statusCode, 401);
  await app.close();
});

test('GET /v1/admin/orders/:orderId/payment retorna 404 para pedido sem pagamento', async () => {
  const pool = buildPool({ 'FROM auth_sessions': [validSession] });
  const app = buildApp({ pool });
  const res = await app.inject({
    method: 'GET', url: '/v1/admin/orders/ord-999/payment',
    headers: { authorization: 'Bearer demo-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error.code, 'payment_not_found');
  await app.close();
});

test('GET /v1/admin/orders/:orderId/payment retorna pagamento com next_states', async () => {
  const pool = buildPool({
    'FROM auth_sessions': [validSession],
    'FROM payments p': [{
      payment_id: 'pay-1', order_id: 'ord-1', provider: 'fake_mercado_pago',
      method: 'MERCADO_PAGO', status: 'PENDING', amount_cents: 2400,
      currency: 'BRL', provider_reference: 'fake-ref-1', checkout_url: 'https://mp.example',
      paid_at: null, created_at: '2026-10-11T10:00:00Z', updated_at: '2026-10-11T10:00:00Z',
      tenant_id: 'tenant-a',
    }],
    'FROM payment_events': [],
  });
  const app = buildApp({ pool });
  const res = await app.inject({
    method: 'GET', url: '/v1/admin/orders/ord-1/payment',
    headers: { authorization: 'Bearer demo-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.payment.payment_id, 'pay-1');
  assert.ok(Array.isArray(body.payment.next_states));
  assert.ok(body.payment.next_states.includes('PAID'));
  assert.ok(Array.isArray(body.events));
  await app.close();
});

test('POST /v1/public/webhooks/payment/mercado-pago retorna 200 para evento duplicado (inbox unique)', async () => {
  const insertCalls: string[] = [];
  const pool: TransactionalDatabase = {
    async query<T extends QueryResultRow>(sql: string, _values?: unknown[]): Promise<{ rows: T[] }> {
      if (sql.includes('INSERT INTO integration_inbox')) {
        insertCalls.push('dup');
        throw new Error('duplicate key value violates unique constraint');
      }
      return { rows: [] };
    },
    async transaction<T>(op: (db: Database) => Promise<T>): Promise<T> { return op(pool); },
  };
  const app = buildApp({ pool });
  process.env['NODE_ENV'] = 'test';
  const res = await app.inject({
    method: 'POST', url: '/v1/public/webhooks/payment/mercado-pago',
    payload: { id: 'evt-dup-1', type: 'payment', status: 'approved' },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().duplicate, true);
  await app.close();
});

test('POST /v1/public/webhooks/payment/mercado-pago processa pagamento e grava outbox se PAID', async () => {
  const outboxRows: string[] = [];
  const pool: TransactionalDatabase = {
    async query<T extends QueryResultRow>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
      if (sql.includes('INSERT INTO integration_inbox')) return { rows: [] };
      if (sql.includes('FROM payments p')) {
        return { rows: [{ payment_id: 'pay-1', order_id: 'ord-1', provider: 'fake_mercado_pago',
          method: 'MERCADO_PAGO', status: 'PENDING', amount_cents: 2400, currency: 'BRL',
          provider_reference: 'fake-ref-1', checkout_url: null, paid_at: null,
          created_at: '2026-10-11T10:00:00Z', updated_at: '2026-10-11T10:00:00Z',
          tenant_id: 'tenant-a' } as unknown as T] };
      }
      if (sql.includes('INSERT INTO payment_events')) return { rows: [] };
      if (sql.includes('UPDATE payments SET')) return { rows: [] };
      if (sql.includes('INSERT INTO integration_outbox')) {
        outboxRows.push(String(values?.[1]));
        return { rows: [] };
      }
      if (sql.includes('UPDATE integration_inbox')) return { rows: [] };
      return { rows: [] };
    },
    async transaction<T>(op: (db: Database) => Promise<T>): Promise<T> { return op(pool); },
  };
  const app = buildApp({ pool });
  process.env['NODE_ENV'] = 'test';
  const res = await app.inject({
    method: 'POST', url: '/v1/public/webhooks/payment/mercado-pago',
    payload: { id: 'evt-approve-1', type: 'payment', status: 'approved', data: { id: 'fake-ref-1' } },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(outboxRows, ['pay-1']);
  await app.close();
});

test('POST /v1/admin/orders/:orderId/payment/simulate rejeita mp_status desconhecido', async () => {
  const pool = buildPool({ 'FROM auth_sessions': [validSession] });
  const app = buildApp({ pool });
  const res = await app.inject({
    method: 'POST', url: '/v1/admin/orders/ord-1/payment/simulate',
    headers: { authorization: 'Bearer demo-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    payload: { mp_status: 'unknown_status_xyz' },
  });
  assert.equal(res.statusCode, 400);
  await app.close();
});

test('POST /v1/admin/orders/:orderId/payment/simulate aplica transição e retorna applied=true', async () => {
  const pool: TransactionalDatabase = {
    async query<T extends QueryResultRow>(sql: string, _values?: unknown[]): Promise<{ rows: T[] }> {
      if (sql.includes('FROM auth_sessions')) return { rows: [validSession as unknown as T] };
      if (sql.includes('FROM payments')) {
        return { rows: [{ payment_id: 'pay-1', order_id: 'ord-1', provider: 'fake_mercado_pago',
          method: 'MERCADO_PAGO', status: 'PENDING', amount_cents: 2400, currency: 'BRL',
          provider_reference: 'fake-ref-1', tenant_id: 'tenant-a',
          paid_at: null, created_at: '2026-10-11T10:00:00Z', updated_at: '2026-10-11T10:00:00Z',
          checkout_url: null } as unknown as T] };
      }
      return { rows: [] };
    },
    async transaction<T>(op: (db: Database) => Promise<T>): Promise<T> { return op(pool); },
  };
  const app = buildApp({ pool });
  const res = await app.inject({
    method: 'POST', url: '/v1/admin/orders/ord-1/payment/simulate',
    headers: { authorization: 'Bearer demo-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    payload: { mp_status: 'approved' },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.applied, true);
  assert.equal(body.normalized_status, 'PAID');
  await app.close();
});
