import pg from 'pg';

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  created_at: Date;
  updated_at: Date;
};

type TableCountRow = { table_name: string; row_count: string };
type ForeignKeyRow = {
  table_name: string;
  constraint_name: string;
  delete_action: string;
};

function parseSlug(argv: string[]): string {
  const index = argv.indexOf('--tenant-slug');
  const slug = index >= 0 ? argv[index + 1] : undefined;
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error('Use --tenant-slug com um slug válido.');
  }
  return slug;
}

async function main() {
  const slug = parseSlug(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL é obrigatória.');

  const pool = new pg.Pool({ connectionString, max: 1, idleTimeoutMillis: 10_000 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const tenantResult = await client.query<TenantRow>(`
      SELECT id, name, slug, status, created_at, updated_at
      FROM tenants
      WHERE slug = $1
    `, [slug]);
    const tenant = tenantResult.rows[0];
    if (!tenant) throw new Error(`Tenant '${slug}' não encontrado.`);

    const columns = await client.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'tenant_id'
      ORDER BY table_name
    `);
    const countRows: TableCountRow[] = [];
    for (const { table_name: tableName } of columns.rows) {
      if (!/^[a-z_][a-z0-9_]*$/.test(tableName)) continue;
      const count = await client.query<{ row_count: string }>(
        `SELECT count(*)::text AS row_count FROM public.${tableName} WHERE tenant_id = $1`,
        [tenant.id],
      );
      countRows.push({ table_name: tableName, row_count: count.rows[0]!.row_count });
    }

    const foreignKeys = await client.query<ForeignKeyRow>(`
      SELECT
        child.relname AS table_name,
        constraint_row.conname AS constraint_name,
        CASE constraint_row.confdeltype
          WHEN 'c' THEN 'CASCADE'
          WHEN 'r' THEN 'RESTRICT'
          WHEN 'a' THEN 'NO ACTION'
          WHEN 'n' THEN 'SET NULL'
          WHEN 'd' THEN 'SET DEFAULT'
          ELSE constraint_row.confdeltype::text
        END AS delete_action
      FROM pg_constraint constraint_row
      JOIN pg_class parent ON parent.oid = constraint_row.confrelid
      JOIN pg_namespace parent_schema ON parent_schema.oid = parent.relnamespace
      JOIN pg_class child ON child.oid = constraint_row.conrelid
      JOIN pg_namespace child_schema ON child_schema.oid = child.relnamespace
      WHERE constraint_row.contype = 'f'
        AND parent_schema.nspname = 'public'
        AND child_schema.nspname = 'public'
        AND parent.relname = 'tenants'
      ORDER BY child.relname, constraint_row.conname
    `);

    const stores = await client.query<{
      slug: string;
      name: string;
      status: string;
      products: string;
    }>(`
      SELECT s.slug, s.name, s.status, count(p.id)::text AS products
      FROM stores s
      LEFT JOIN products p ON p.tenant_id = s.tenant_id AND p.store_id = s.id
      WHERE s.tenant_id = $1
      GROUP BY s.id
      ORDER BY s.created_at
    `, [tenant.id]);

    const domains = await client.query<{ hostname: string; status: string; is_primary: boolean }>(`
      SELECT hostname, status, is_primary
      FROM store_domains
      WHERE tenant_id = $1
      ORDER BY hostname
    `, [tenant.id]);

    await client.query('COMMIT');
    console.log(JSON.stringify({
      tenant,
      stores: stores.rows,
      domains: domains.rows,
      data: countRows
        .map((row) => ({ table: row.table_name, rows: Number(row.row_count) }))
        .filter((row) => row.rows > 0),
      tenant_foreign_keys: foreignKeys.rows,
      safe_single_delete: foreignKeys.rows.every((row) => row.delete_action === 'CASCADE'),
    }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
