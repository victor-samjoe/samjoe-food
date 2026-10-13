import { Worker, Queue } from 'bullmq';
import pg from 'pg';
import { createHmac } from 'node:crypto';
import { redisConnection } from './redis.js';

const QUEUE_NAME = 'foodapp-simulation';
const EXPIRY_JOB = 'maintenance.expire-reservations';
const RECONCILE_JOB = 'maintenance.reconcile-payments';
const OUTBOX_JOB = 'dispatch.outbox';

function log(level: 'info' | 'error', data: Record<string, unknown>) {
  const stream = level === 'error' ? process.stderr : process.stdout;
  stream.write(JSON.stringify({ level, service: 'foodapp-worker', ...data }) + '\n');
}

const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 30_000 })
  : null;

const worker = new Worker(QUEUE_NAME, async (job) => {
  if (job.name === 'simulation.ping') {
    return { ok: true, tenant_id: job.data.tenant_id, processed_at: new Date().toISOString() };
  }
  if (job.name === EXPIRY_JOB) {
    return expireReservations();
  }
  if (job.name === RECONCILE_JOB) {
    return reconcilePayments();
  }
  if (job.name === OUTBOX_JOB) {
    return dispatchOutbox();
  }
  throw new Error(`unsupported_job:${job.name}`);
}, {
  connection: redisConnection(),
  concurrency: 2,
});

async function expireReservations(): Promise<{ expired: number }> {
  if (!pool) {
    log('info', { event: 'expire_reservations_skipped', reason: 'no_database' });
    return { expired: 0 };
  }
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ variant_id: string; quantity: number }>(`
      UPDATE inventory_reservations
      SET status = 'EXPIRED', updated_at = now()
      WHERE status = 'ACTIVE' AND expires_at <= now()
      RETURNING variant_id, quantity
    `);
    for (const { variant_id, quantity } of rows) {
      await client.query(`
        UPDATE inventory_levels
        SET reserved = GREATEST(0, reserved - $1), version = version + 1, updated_at = now()
        WHERE variant_id = $2
      `, [quantity, variant_id]);
    }
    if (rows.length > 0) log('info', { event: 'reservations_expired', count: rows.length });
    return { expired: rows.length };
  } finally {
    client.release();
  }
}

async function reconcilePayments(): Promise<{ expired: number; logged: number }> {
  if (!pool) {
    log('info', { event: 'reconcile_payments_skipped', reason: 'no_database' });
    return { expired: 0, logged: 0 };
  }
  const client = await pool.connect();
  try {
    const staleCutoff = new Date(Date.now() - 30 * 60_000).toISOString();
    const { rows: stale } = await client.query<{ payment_id: string; provider: string; provider_reference: string | null }>(`
      SELECT id AS payment_id, provider, provider_reference
      FROM payments
      WHERE status IN ('PENDING', 'AUTHORIZED')
        AND updated_at < $1
    `, [staleCutoff]);

    let expired = 0;
    for (const p of stale) {
      if (p.provider.startsWith('fake_') || p.provider === 'pix') {
        await client.query(
          `UPDATE payments SET status = 'EXPIRED', updated_at = now() WHERE id = $1 AND status IN ('PENDING','AUTHORIZED')`,
          [p.payment_id],
        );
        await client.query(
          `INSERT INTO payment_events (tenant_id, payment_id, provider_event_id, provider_status, normalized_status, payload, occurred_at)
           SELECT tenant_id, $1, 'reconcile-' || id, 'expired', 'EXPIRED', '{"source":"reconciler"}'::jsonb, now()
           FROM payments WHERE id = $1`,
          [p.payment_id],
        );
        expired++;
      } else {
        log('info', { event: 'reconcile_payment_stale', payment_id: p.payment_id, provider: p.provider });
      }
    }
    if (stale.length > 0) {
      log('info', { event: 'reconcile_payments_done', total: stale.length, expired, logged: stale.length - expired });
    }
    return { expired, logged: stale.length - expired };
  } finally {
    client.release();
  }
}

async function dispatchOutbox(): Promise<{ dispatched: number; failed: number }> {
  if (!pool) return { dispatched: 0, failed: 0 };

  const salesEngineUrl = process.env.SALES_ENGINE_URL?.replace(/\/$/, '');
  const salesEngineSecret = process.env.SALES_ENGINE_WEBHOOK_SECRET;
  if (!salesEngineUrl || !salesEngineSecret) {
    return { dispatched: 0, failed: 0 };
  }

  const client = await pool.connect();
  try {
    const { rows: events } = await client.query<{
      id: string; tenant_id: string; event_type: string;
      aggregate_id: string; payload: { from_status: string; to_status: string };
    }>(`
      UPDATE integration_outbox
      SET status = 'PROCESSING', updated_at = now()
      WHERE id IN (
        SELECT id FROM integration_outbox
        WHERE status = 'PENDING'
        ORDER BY created_at
        LIMIT 50
      )
      RETURNING id, tenant_id, event_type, aggregate_id, payload
    `);

    let dispatched = 0, failed = 0;

    for (const event of events) {
      try {
        if (event.event_type === 'foodapp.order.status_changed.v1') {
          const { rows } = await client.query<{
            public_number: string; customer_id: string; phone_e164: string | null;
          }>(`
            SELECT o.public_number, o.customer_id, c.phone_e164
            FROM orders o
            JOIN customers c ON c.id = o.customer_id AND c.tenant_id = o.tenant_id
            WHERE o.id = $1 AND o.tenant_id = $2
          `, [event.aggregate_id, event.tenant_id]);

          const order = rows[0];
          if (order) {
            const body = {
              event_id: event.id,
              event_type: 'order.status_changed',
              occurred_at: new Date().toISOString(),
              customer: { external_id: order.customer_id, phone: order.phone_e164 },
              order: {
                external_id: event.aggregate_id,
                ref: order.public_number,
                from_status: event.payload.from_status,
                to_status: event.payload.to_status,
              },
            };
            const bodyStr = JSON.stringify(body);
            const sig = 'sha256=' + createHmac('sha256', salesEngineSecret).update(bodyStr).digest('hex');
            const res = await fetch(`${salesEngineUrl}/api/v1/integrations/samjoe-food/events`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-tenant-id': event.tenant_id,
                'x-samjoe-food-signature': sig,
                'x-samjoe-food-timestamp': new Date().toISOString(),
              },
              body: bodyStr,
              signal: AbortSignal.timeout(10_000),
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(`Sales Engine ${res.status}: ${JSON.stringify(err)}`);
            }
          }
        }

        await client.query(
          `UPDATE integration_outbox SET status = 'PUBLISHED', updated_at = now() WHERE id = $1`,
          [event.id],
        );
        dispatched++;
      } catch (err) {
        await client.query(
          `UPDATE integration_outbox SET status = 'FAILED', attempts = attempts + 1, updated_at = now() WHERE id = $1`,
          [event.id],
        );
        log('error', { event: 'outbox_dispatch_failed', outbox_id: event.id, error: (err as Error).message });
        failed++;
      }
    }

    if (dispatched + failed > 0) log('info', { event: 'outbox_dispatched', dispatched, failed });
    return { dispatched, failed };
  } finally {
    client.release();
  }
}

worker.on('ready', () => log('info', { event: 'ready', integrations: 'disabled' }));
worker.on('completed', (job, result) => log('info', { event: 'job_completed', job_id: job.id, job_name: job.name, result }));
worker.on('failed', (job, error) => log('error', { event: 'job_failed', job_id: job?.id, job_name: job?.name, error: error.message }));
worker.on('error', (error) => log('error', { event: 'worker_error', error: error.message }));

const queue = new Queue(QUEUE_NAME, { connection: redisConnection() });
await queue.upsertJobScheduler(EXPIRY_JOB, { every: 5 * 60_000 }, { name: EXPIRY_JOB, data: {} });
await queue.upsertJobScheduler(RECONCILE_JOB, { every: 15 * 60_000 }, { name: RECONCILE_JOB, data: {} });
await queue.upsertJobScheduler(OUTBOX_JOB, { every: 60_000 }, { name: OUTBOX_JOB, data: {} });

const shutdown = async (signal: string) => {
  log('info', { event: 'shutdown', signal });
  await worker.close();
  await queue.close();
  await pool?.end();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
