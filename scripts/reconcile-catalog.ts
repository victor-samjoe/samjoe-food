/**
 * Compara o catálogo legado (fixtures/legacy-catalog.json) com o catálogo do FoodApp.
 * Imprime um relatório JSON das diferenças encontradas.
 *
 * Uso:
 *   npm run reconcile:catalog
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

type LegacyVariant = { sku: string; name: string; price_cents: number };
type LegacyProduct = { produto_id: string; name: string; description: string; available: boolean; variants: LegacyVariant[] };
type LegacyCategory = { legacy_id: string; name: string; products: LegacyProduct[] };
type LegacyFixture = { tenant_slug: string; store_slug: string; source: string; categories: LegacyCategory[] };

type FoodAppRow = {
  legacy_id: string;
  product_name: string;
  description: string | null;
  is_active: boolean;
  sku: string | null;
  variant_name: string | null;
  price_cents: number | null;
  variant_active: boolean | null;
};

type Diff = { field: string; legacy: unknown; foodapp: unknown };
type ReconcileEntry = {
  produto_id: string;
  product_name: string;
  status: 'match' | 'divergent' | 'missing_in_foodapp' | 'orphan_in_foodapp';
  diffs?: Diff[];
};

const fixturePath = resolve(import.meta.dirname ?? '.', '../fixtures/legacy-catalog.json');
const fixture: LegacyFixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });

async function run() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<FoodAppRow>(`
      SELECT
        ei.external_id AS legacy_id,
        p.name AS product_name,
        p.description,
        p.is_active,
        v.sku,
        v.name AS variant_name,
        v.price_cents,
        v.is_active AS variant_active
      FROM tenants t
      JOIN stores s ON s.tenant_id = t.id AND s.slug = $2 AND s.status = 'ACTIVE'
      JOIN products p ON p.tenant_id = t.id AND p.store_id = s.id
      JOIN external_identifiers ei
        ON ei.tenant_id = t.id
       AND ei.entity_type = 'product'
       AND ei.entity_id = p.id
       AND ei.source = $3
      LEFT JOIN product_variants v ON v.tenant_id = p.tenant_id AND v.product_id = p.id
      WHERE t.slug = $1
    `, [fixture.tenant_slug, fixture.store_slug, fixture.source]);

    const foodappByLegacyId = new Map<string, FoodAppRow[]>();
    for (const row of rows) {
      if (!foodappByLegacyId.has(row.legacy_id)) foodappByLegacyId.set(row.legacy_id, []);
      foodappByLegacyId.get(row.legacy_id)!.push(row);
    }

    const legacyProducts = fixture.categories.flatMap(c => c.products);
    const checkedIds = new Set<string>();
    const entries: ReconcileEntry[] = [];

    for (const lp of legacyProducts) {
      checkedIds.add(lp.produto_id);
      const foodappRows = foodappByLegacyId.get(lp.produto_id);
      if (!foodappRows || foodappRows.length === 0) {
        entries.push({ produto_id: lp.produto_id, product_name: lp.name, status: 'missing_in_foodapp' });
        continue;
      }
      const fp = foodappRows[0];
      const diffs: Diff[] = [];

      if (fp.product_name !== lp.name) diffs.push({ field: 'name', legacy: lp.name, foodapp: fp.product_name });
      if ((fp.description ?? '') !== (lp.description ?? '')) diffs.push({ field: 'description', legacy: lp.description, foodapp: fp.description });
      if (fp.is_active !== lp.available) diffs.push({ field: 'is_active', legacy: lp.available, foodapp: fp.is_active });

      for (const lv of lp.variants) {
        const fv = foodappRows.find(r => r.sku === lv.sku);
        if (!fv) {
          diffs.push({ field: `variant[${lv.sku}]`, legacy: 'exists', foodapp: 'missing' });
        } else {
          if (fv.price_cents !== lv.price_cents) {
            diffs.push({ field: `variant[${lv.sku}].price_cents`, legacy: lv.price_cents, foodapp: fv.price_cents });
          }
        }
      }

      entries.push({ produto_id: lp.produto_id, product_name: lp.name, status: diffs.length > 0 ? 'divergent' : 'match', diffs: diffs.length > 0 ? diffs : undefined });
    }

    for (const [legacyId] of foodappByLegacyId) {
      if (!checkedIds.has(legacyId)) {
        entries.push({ produto_id: legacyId, product_name: foodappByLegacyId.get(legacyId)![0].product_name, status: 'orphan_in_foodapp' });
      }
    }

    const report = {
      tenant: fixture.tenant_slug,
      store: fixture.store_slug,
      total: entries.length,
      match: entries.filter(e => e.status === 'match').length,
      divergent: entries.filter(e => e.status === 'divergent').length,
      missing_in_foodapp: entries.filter(e => e.status === 'missing_in_foodapp').length,
      orphan_in_foodapp: entries.filter(e => e.status === 'orphan_in_foodapp').length,
      entries,
    };
    console.log(JSON.stringify(report, null, 2));
    if (report.divergent > 0 || report.missing_in_foodapp > 0) process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
