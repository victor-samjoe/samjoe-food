import pg from 'pg';
import { buildApp } from './app.js';

const host = process.env.API_HOST ?? '127.0.0.1';
const port = Number(process.env.API_PORT ?? 3001);
const connectionString = process.env.DATABASE_URL;

if (!connectionString) throw new Error('DATABASE_URL is required');

const pool = new pg.Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
const app = buildApp({
  pool: {
    query: (sql, values) => pool.query(sql, values),
    async transaction(operation) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await operation({ query: (sql, values) => client.query(sql, values) });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  },
});

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutdown requested');
  await app.close();
  await pool.end();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host, port });

