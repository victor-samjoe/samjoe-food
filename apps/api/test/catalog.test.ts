import assert from 'node:assert/strict';
import test from 'node:test';
import type { QueryResultRow } from 'pg';
import { buildApp } from '../src/app.js';
import type { Database, TransactionalDatabase } from '../src/catalog.js';

const stores = {
  'doce-horizonte-centro': [{
    tenant_id: 'tenant-a', store_id: 'store-a', store_name: 'Centro', store_slug: 'doce-horizonte-centro',
    timezone: 'America/Sao_Paulo',
    category_id: 'cat-a', category_name: 'Bolos no pote', category_slug: 'bolos-no-pote', category_sort_order: 1,
    product_id: 'product-a', product_name: 'Bolo Aurora', description: null,
    variant_id: 'variant-a', sku: 'A-1', variant_name: '250 ml', price_cents: 1200, currency: 'BRL',
    inventory_policy: 'UNLIMITED', preorder_limit: 0, stock_available: 0,
  }],
  'sabor-nuvem-jardins': [{
    tenant_id: 'tenant-b', store_id: 'store-b', store_name: 'Jardins', store_slug: 'sabor-nuvem-jardins',
    timezone: 'America/Sao_Paulo',
    category_id: 'cat-b', category_name: 'Salgados', category_slug: 'salgados', category_sort_order: 1,
    product_id: 'product-b', product_name: 'Empada Nuvem', description: null,
    variant_id: 'variant-b', sku: 'B-1', variant_name: 'Palmito', price_cents: 900, currency: 'BRL',
    inventory_policy: 'UNLIMITED', preorder_limit: 0, stock_available: 0,
  }],
} as const;

const pool: TransactionalDatabase = {
  async query<T extends QueryResultRow>(_sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
    if (!values) return { rows: [{ '?column?': 1 } as unknown as T] };
    const rows = stores[String(values[0]) as keyof typeof stores] ?? [];
    return { rows: rows as unknown as T[] };
  },
  async transaction<T>(operation: (database: Database) => Promise<T>): Promise<T> {
    return operation(pool);
  },
};

test('catálogos fictícios permanecem isolados por loja e tenant', async () => {
  const app = buildApp({ pool });
  const first = await app.inject({ method: 'GET', url: '/v1/public/stores/doce-horizonte-centro/catalog' });
  const second = await app.inject({ method: 'GET', url: '/v1/public/stores/sabor-nuvem-jardins/catalog' });
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.match(first.body, /Bolo Aurora/);
  assert.doesNotMatch(first.body, /Empada Nuvem/);
  assert.match(second.body, /Empada Nuvem/);
  assert.doesNotMatch(second.body, /Bolo Aurora/);
  await app.close();
});

test('catálogo agrupa produtos por categoria', async () => {
  const app = buildApp({ pool });
  const res = await app.inject({ method: 'GET', url: '/v1/public/stores/doce-horizonte-centro/catalog' });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(Array.isArray(body.categories), 'deve retornar categories[]');
  const cat = body.categories[0];
  assert.equal(cat.id, 'cat-a');
  assert.equal(cat.name, 'Bolos no pote');
  assert.ok(Array.isArray(cat.products));
  const product = cat.products[0];
  assert.equal(product.name, 'Bolo Aurora');
  assert.ok(Array.isArray(product.variants));
  assert.equal(product.variants[0].available, true);
  await app.close();
});

test('variante TRACKED sem estoque aparece como indisponível', async () => {
  const trackedPool: TransactionalDatabase = {
    async query<T extends QueryResultRow>(_sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
      if (!values) return { rows: [{ '?column?': 1 } as unknown as T] };
      const row = {
        tenant_id: 'tenant-a', store_id: 'store-a', store_name: 'Centro', store_slug: 'doce-horizonte-centro',
        timezone: 'America/Sao_Paulo',
        category_id: 'cat-a', category_name: 'Bolos no pote', category_slug: 'bolos-no-pote', category_sort_order: 1,
        product_id: 'product-a', product_name: 'Bolo Aurora', description: null,
        variant_id: 'variant-a', sku: 'A-1', variant_name: '250 ml', price_cents: 1200, currency: 'BRL',
        inventory_policy: 'TRACKED', preorder_limit: 0, stock_available: 0,
      };
      return { rows: [row as unknown as T] };
    },
    async transaction<T>(op: (db: Database) => Promise<T>): Promise<T> { return op(trackedPool); },
  };
  const app = buildApp({ pool: trackedPool });
  const res = await app.inject({ method: 'GET', url: '/v1/public/stores/doce-horizonte-centro/catalog' });
  assert.equal(res.statusCode, 200);
  const product = res.json().categories[0].products[0];
  assert.equal(product.variants[0].available, false, 'TRACKED sem estoque deve ser indisponível');
  await app.close();
});

test('loja inexistente não revela catálogo', async () => {
  const app = buildApp({ pool });
  const response = await app.inject({ method: 'GET', url: '/v1/public/stores/inexistente/catalog' });
  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error.code, 'store_not_found');
  await app.close();
});

