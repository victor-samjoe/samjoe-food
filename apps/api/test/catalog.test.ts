import assert from 'node:assert/strict';
import test from 'node:test';
import type { QueryResultRow } from 'pg';
import { buildApp } from '../src/app.js';
import type { Database, TransactionalDatabase } from '../src/catalog.js';

const stores = {
  'doce-horizonte-centro': [{
    tenant_id: 'tenant-a', store_id: 'store-a', store_name: 'Centro', store_slug: 'doce-horizonte-centro',
    timezone: 'America/Sao_Paulo', delivery_status: 'ACTIVE',
    category_id: 'cat-a', category_name: 'Bolos no pote', category_slug: 'bolos-no-pote', category_sort_order: 1,
    product_id: 'product-a', product_name: 'Bolo Aurora', description: null,
    cover_image_scale: '1.35', cover_image_position_x: 25, cover_image_position_y: 75,
    variant_id: 'variant-a', sku: 'A-1', variant_name: '250 ml', price_cents: 1200, currency: 'BRL',
    inventory_policy: 'UNLIMITED', preorder_limit: 0, stock_available: 0,
  }],
  'sabor-nuvem-jardins': [{
    tenant_id: 'tenant-b', store_id: 'store-b', store_name: 'Jardins', store_slug: 'sabor-nuvem-jardins',
    timezone: 'America/Sao_Paulo', delivery_status: 'PENDING',
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
  assert.equal(first.json().store.delivery_enabled, true);
  assert.equal(second.json().store.delivery_enabled, false);
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
  assert.equal(product.image_scale, 1.35);
  assert.equal(product.image_position_x, 25);
  assert.equal(product.image_position_y, 75);
  assert.ok(Array.isArray(product.variants));
  assert.equal(product.variants[0].available, true);
  await app.close();
});

test('catálogo troca imagens Base64 por URLs de mídia cacheáveis', async () => {
  const image = 'data:image/webp;base64,QUJDRA==';
  const mediaPool: TransactionalDatabase = {
    async query<T extends QueryResultRow>(_sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
      if (!values) return { rows: [{ '?column?': 1 } as unknown as T] };
      return {
        rows: [{
          ...stores['doce-horizonte-centro'][0],
          storefront_config: { logo_url: image, hero_image_url: image, hero_images: [image] },
          store_updated_at: '2026-10-16T12:00:00.000Z',
          cover_image_url: image,
          product_updated_at: '2026-10-16T12:01:00.000Z',
        } as unknown as T],
      };
    },
    async transaction<T>(operation: (database: Database) => Promise<T>): Promise<T> { return operation(mediaPool); },
  };
  const app = buildApp({ pool: mediaPool });
  const res = await app.inject({ method: 'GET', url: '/v1/public/stores/doce-horizonte-centro/catalog' });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.doesNotMatch(res.body, /data:image/);
  assert.match(body.store.storefront.logo_url, /\/api\/store\/doce-horizonte-centro\/media\/storefront\/logo_url\?v=/);
  assert.match(body.store.storefront.hero_images[0], /\/api\/store\/doce-horizonte-centro\/media\/storefront\/hero_images\/0\?v=/);
  assert.match(body.categories[0].products[0].image_url, /\/api\/store\/doce-horizonte-centro\/media\/products\/product-a\?v=/);
  await app.close();
});

test('catálogo converte hero_slides com Base64 em URLs de mídia cacheáveis por índice', async () => {
  const image0 = 'data:image/webp;base64,QUJDRA==';
  const image1 = 'data:image/webp;base64,REVGSA==';
  const slidesPool: TransactionalDatabase = {
    async query<T extends QueryResultRow>(_sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
      if (!values) return { rows: [{ '?column?': 1 } as unknown as T] };
      return {
        rows: [{
          ...stores['doce-horizonte-centro'][0],
          storefront_config: {
            hero_slides: [
              { image_url: image0, scale: 1.1, position_x: 40, position_y: 55 },
              { image_url: image1, scale: 1,   position_x: 50, position_y: 50 },
            ],
          },
          store_updated_at: '2026-10-16T12:00:00.000Z',
          cover_image_url: null,
          product_updated_at: '2026-10-16T12:01:00.000Z',
        } as unknown as T],
      };
    },
    async transaction<T>(operation: (database: Database) => Promise<T>): Promise<T> { return operation(slidesPool); },
  };
  const app = buildApp({ pool: slidesPool });
  const res = await app.inject({ method: 'GET', url: '/v1/public/stores/doce-horizonte-centro/catalog' });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.doesNotMatch(res.body, /data:image/, 'nenhuma URL Base64 deve aparecer no catálogo');
  const slides = body.store.storefront.hero_slides;
  assert.ok(Array.isArray(slides), 'hero_slides deve ser array');
  assert.equal(slides.length, 2);
  assert.match(slides[0].image_url, /\/api\/store\/doce-horizonte-centro\/media\/storefront\/hero_slides\/0\?v=/);
  assert.match(slides[1].image_url, /\/api\/store\/doce-horizonte-centro\/media\/storefront\/hero_slides\/1\?v=/);
  assert.equal(slides[0].scale, 1.1, 'scale deve ser preservado');
  assert.equal(slides[0].position_x, 40, 'position_x deve ser preservado');
  assert.equal(slides[0].position_y, 55, 'position_y deve ser preservado');
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

test('domínio verificado resolve somente a loja vinculada', async () => {
  const domainPool: TransactionalDatabase = {
    async query<T extends QueryResultRow>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
      if (sql.includes('FROM store_domains') && values?.[0] === 'doces.exemplo.com.br') {
        return { rows: [{ store_slug: 'doce-horizonte-centro' } as unknown as T] };
      }
      return { rows: [] };
    },
    async transaction<T>(operation: (database: Database) => Promise<T>): Promise<T> { return operation(domainPool); },
  };
  const app = buildApp({ pool: domainPool });
  const found = await app.inject({ method: 'GET', url: '/v1/public/domains/doces.exemplo.com.br' });
  const missing = await app.inject({ method: 'GET', url: '/v1/public/domains/outro.exemplo.com.br' });
  assert.equal(found.statusCode, 200);
  assert.equal(found.json().store_slug, 'doce-horizonte-centro');
  assert.equal(missing.statusCode, 404);
  await app.close();
});

