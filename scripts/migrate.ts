import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');

  const migrationsDirectory = path.resolve(process.cwd(), 'database', 'migrations');
  const pool = new pg.Pool({ connectionString, max: 1, idleTimeoutMillis: 10_000 });
  const client = await pool.connect();

  try {
  await client.query('SELECT pg_advisory_lock($1)', [733_101_2026]);
  await client.query(`
    CREATE TABLE IF NOT EXISTS foodapp_schema_migrations (
      filename text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

    const files = (await readdir(migrationsDirectory))
      .filter((filename) => /^\d{4}_[a-z0-9_]+\.sql$/.test(filename))
      .sort();

    for (const filename of files) {
      const sql = await readFile(path.join(migrationsDirectory, filename), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query<{ checksum: string }>(
        'SELECT checksum FROM foodapp_schema_migrations WHERE filename = $1',
        [filename],
      );

      if (existing.rows[0]) {
        if (existing.rows[0].checksum !== checksum) {
          throw new Error(`Applied migration was modified: ${filename}`);
        }
        process.stdout.write(`skip ${filename}\n`);
        continue;
      }

      process.stdout.write(`apply ${filename}\n`);
      await client.query(sql);
      await client.query(
        'INSERT INTO foodapp_schema_migrations (filename, checksum) VALUES ($1, $2)',
        [filename, checksum],
      );
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [733_101_2026]).catch(() => undefined);
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});

