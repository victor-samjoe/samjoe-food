/**
 * Importa o catálogo legado (fixtures/legacy-catalog.json) para o FoodApp.
 * Usa external_identifiers para rastrear o mapeamento produto_id → UUID.
 *
 * Uso:
 *   npm run import:catalog            # executa de verdade
 *   npm run import:catalog -- --dry-run  # apenas lê e reporta
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const DRY_RUN = process.argv.includes('--dry-run');
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

type LegacyVariant = { sku: string; name: string; price_cents: number; attributes?: Record<string, unknown> };
type LegacyProduct = { produto_id: string; name: string; description: string; available: boolean; variants: LegacyVariant[] };
type LegacyCategory = { legacy_id: string; name: string; sort_order: number; products: LegacyProduct[] };
type LegacyFixture = {
  tenant_slug: string; store_slug: string; exported_at: string; source: string;
  categories: LegacyCategory[];
};

type ReportEntry = { status: 'created' | 'skipped' | 'updated' | 'error'; entity: string; legacy_id: string; message?: string };

const fixturePath = resolve(import.meta.dirname ?? '.', '../fixtures/legacy-catalog.json');
const fixture: LegacyFixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
const report: ReportEntry[] = [];

async function run() {
  const client = await pool.connect();
  try {
    const { rows: tenantRows } = await client.query<{ tenant_id: string }>(
      `SELECT id AS tenant_id FROM tenants WHERE slug = $1 AND status = 'ACTIVE' LIMIT 1`,
      [fixture.tenant_slug],
    );
    if (!tenantRows[0]) throw new Error(`Tenant '${fixture.tenant_slug}' não encontrado.`);
    const { tenant_id } = tenantRows[0];

    const { rows: storeRows } = await client.query<{ store_id: string; currency: string }>(
      `SELECT id AS store_id, currency FROM stores WHERE slug = $1 AND tenant_id = $2 AND status = 'ACTIVE' LIMIT 1`,
      [fixture.store_slug, tenant_id],
    );
    if (!storeRows[0]) throw new Error(`Loja '${fixture.store_slug}' não encontrada.`);
    const { store_id, currency } = storeRows[0];

    for (const legacyCat of fixture.categories) {
      let categoryId: string;

      const { rows: existingCat } = await client.query<{ category_id: string }>(
        `SELECT ei.entity_id AS category_id FROM external_identifiers ei
         WHERE ei.tenant_id = $1 AND ei.source = $2 AND ei.external_id = $3 AND ei.entity_type = 'category'`,
        [tenant_id, fixture.source, legacyCat.legacy_id],
      );

      if (existingCat[0]) {
        categoryId = existingCat[0].category_id;
        report.push({ status: 'skipped', entity: 'category', legacy_id: legacyCat.legacy_id, message: `já existe (${categoryId})` });
      } else {
        if (DRY_RUN) {
          categoryId = '(dry-run)';
          report.push({ status: 'created', entity: 'category', legacy_id: legacyCat.legacy_id, message: `seria criada: ${legacyCat.name}` });
        } else {
          await client.query('BEGIN');
          try {
            const slug = legacyCat.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            const { rows: catRows } = await client.query<{ category_id: string }>(
              `INSERT INTO categories (tenant_id, store_id, name, slug, sort_order)
               VALUES ($1, $2, $3, $4, $5) RETURNING id AS category_id`,
              [tenant_id, store_id, legacyCat.name, slug, legacyCat.sort_order],
            );
            categoryId = catRows[0].category_id;
            await client.query(
              `INSERT INTO external_identifiers (tenant_id, entity_type, entity_id, source, external_id)
               VALUES ($1, 'category', $2, $3, $4)`,
              [tenant_id, categoryId, fixture.source, legacyCat.legacy_id],
            );
            await client.query('COMMIT');
            report.push({ status: 'created', entity: 'category', legacy_id: legacyCat.legacy_id, message: legacyCat.name });
          } catch (err) {
            await client.query('ROLLBACK');
            report.push({ status: 'error', entity: 'category', legacy_id: legacyCat.legacy_id, message: String(err) });
            continue;
          }
        }
      }

      for (const legacyProduct of legacyCat.products) {
        const { rows: existingProd } = await client.query<{ product_id: string }>(
          `SELECT ei.entity_id AS product_id FROM external_identifiers ei
           WHERE ei.tenant_id = $1 AND ei.source = $2 AND ei.external_id = $3 AND ei.entity_type = 'product'`,
          [tenant_id, fixture.source, legacyProduct.produto_id],
        );

        if (existingProd[0]) {
          report.push({ status: 'skipped', entity: 'product', legacy_id: legacyProduct.produto_id, message: `já existe (${existingProd[0].product_id})` });
          continue;
        }

        if (DRY_RUN) {
          report.push({ status: 'created', entity: 'product', legacy_id: legacyProduct.produto_id, message: `seria criado: ${legacyProduct.name}` });
          continue;
        }

        await client.query('BEGIN');
        try {
          const { rows: prodRows } = await client.query<{ product_id: string }>(
            `INSERT INTO products (tenant_id, store_id, category_id, name, description, is_active)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id AS product_id`,
            [tenant_id, store_id, categoryId === '(dry-run)' ? null : categoryId, legacyProduct.name, legacyProduct.description, legacyProduct.available],
          );
          const product_id = prodRows[0].product_id;

          for (const variant of legacyProduct.variants) {
            await client.query(
              `INSERT INTO product_variants (tenant_id, product_id, sku, name, price_cents, currency, attributes)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [tenant_id, product_id, variant.sku, variant.name, variant.price_cents, currency, JSON.stringify(variant.attributes ?? {})],
            );
          }

          await client.query(
            `INSERT INTO external_identifiers (tenant_id, entity_type, entity_id, source, external_id)
             VALUES ($1, 'product', $2, $3, $4)`,
            [tenant_id, product_id, fixture.source, legacyProduct.produto_id],
          );
          await client.query('COMMIT');
          report.push({ status: 'created', entity: 'product', legacy_id: legacyProduct.produto_id, message: legacyProduct.name });
        } catch (err) {
          await client.query('ROLLBACK');
          report.push({ status: 'error', entity: 'product', legacy_id: legacyProduct.produto_id, message: String(err) });
        }
      }
    }
  } finally {
    client.release();
    await pool.end();
  }

  const summary = {
    dry_run: DRY_RUN,
    tenant: fixture.tenant_slug,
    store: fixture.store_slug,
    created: report.filter(r => r.status === 'created').length,
    skipped: report.filter(r => r.status === 'skipped').length,
    errors: report.filter(r => r.status === 'error').length,
    entries: report,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (summary.errors > 0) process.exit(1);
}

run().catch(err => { console.error(err); process.exit(1); });
