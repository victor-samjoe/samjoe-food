import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Database, TransactionalDatabase } from './catalog.js';
import { resolveSession } from './auth.js';
import { HttpError } from './errors.js';

type PaymentStatus =
  | 'CREATED' | 'PENDING' | 'AUTHORIZED' | 'PAID'
  | 'FAILED' | 'EXPIRED' | 'CANCELLED'
  | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'CHARGEBACK';

type OrderIdParams = { orderId: string };
type PaymentIdParams = { paymentId: string };

type PaymentRow = {
  payment_id: string; order_id: string; provider: string; method: string;
  status: PaymentStatus; amount_cents: number; currency: string;
  provider_reference: string | null; checkout_url: string | null;
  paid_at: string | null; created_at: string; updated_at: string;
  tenant_id: string;
};
type PaymentEventRow = {
  event_id: string; provider_event_id: string | null; provider_status: string | null;
  normalized_status: string; occurred_at: string;
};

const paymentTransitions: Record<PaymentStatus, readonly PaymentStatus[]> = {
  CREATED:           ['PENDING', 'CANCELLED'],
  PENDING:           ['AUTHORIZED', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED'],
  AUTHORIZED:        ['PAID', 'FAILED', 'CANCELLED'],
  PAID:              ['PARTIALLY_REFUNDED', 'CHARGEBACK'],
  PARTIALLY_REFUNDED:['REFUNDED', 'CHARGEBACK'],
  FAILED:            [],
  EXPIRED:           [],
  CANCELLED:         [],
  REFUNDED:          [],
  CHARGEBACK:        [],
};

const mpStatusMap: Record<string, PaymentStatus> = {
  approved:     'PAID',
  authorized:   'AUTHORIZED',
  pending:      'PENDING',
  in_process:   'PENDING',
  rejected:     'FAILED',
  cancelled:    'CANCELLED',
  refunded:     'REFUNDED',
  charged_back: 'CHARGEBACK',
  expired:      'EXPIRED',
};

function webhookSecret() {
  return process.env.MP_WEBHOOK_SECRET ?? 'mp-local-only-secret';
}

function verifyMpSignature(body: string, header: string | undefined): boolean {
  if (!header) return false;
  const expected = 'sha256=' + createHmac('sha256', webhookSecret()).update(body).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  } catch {
    return false;
  }
}

async function requireOperator(request: Parameters<typeof resolveSession>[0], database: Database) {
  const session = await resolveSession(request, database);
  if (!session) throw new HttpError(401, 'unauthorized', 'Sessão ausente ou expirada.');
  if (!['OWNER', 'ADMIN', 'OPERATOR'].includes(session.role)) {
    throw new HttpError(403, 'forbidden', 'Permissão insuficiente.');
  }
  return session;
}

async function applyPaymentEvent(
  database: Database,
  tenantId: string,
  payment: PaymentRow,
  normalizedStatus: PaymentStatus,
  providerStatus: string,
  providerEventId: string,
  payload: unknown,
  occurredAt: Date,
) {
  const allowed = paymentTransitions[payment.status];
  if (!allowed.includes(normalizedStatus)) {
    return { applied: false, reason: `transition_blocked: ${payment.status} → ${normalizedStatus}` };
  }

  const eventHash = createHash('sha256').update(tenantId + ':' + providerEventId).digest('hex');
  try {
    await database.query(
      `INSERT INTO payment_events (tenant_id, payment_id, provider_event_id, provider_status, normalized_status, payload, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [tenantId, payment.payment_id, eventHash, providerStatus, normalizedStatus, JSON.stringify(payload), occurredAt.toISOString()],
    );
  } catch {
    return { applied: false, reason: 'duplicate_event' };
  }

  const sets = ['status = $1', 'updated_at = now()'];
  const vals: unknown[] = [normalizedStatus, payment.payment_id, tenantId];
  if (normalizedStatus === 'PAID') { sets.push('paid_at = now()'); }
  await database.query(
    `UPDATE payments SET ${sets.join(', ')} WHERE id = $2 AND tenant_id = $3`,
    vals,
  );

  if (normalizedStatus === 'PAID') {
    await database.query(
      `INSERT INTO integration_outbox (tenant_id, event_type, aggregate_type, aggregate_id, payload)
       VALUES ($1, 'foodapp.payment.paid.v1', 'payment', $2, $3::jsonb)`,
      [tenantId, payment.payment_id, JSON.stringify({ payment_id: payment.payment_id, order_id: payment.order_id, amount_cents: payment.amount_cents })],
    );
  }

  return { applied: true };
}

export function registerPaymentRoutes(app: FastifyInstance, database: TransactionalDatabase) {
  app.get<{ Params: OrderIdParams }>('/v1/admin/orders/:orderId/payment', async (request, reply) => {
    const session = await requireOperator(request, database);
    const { rows } = await database.query<PaymentRow>(`
      SELECT p.id AS payment_id, p.order_id, p.provider, p.method, p.status,
        p.amount_cents, p.currency, p.provider_reference, p.checkout_url,
        p.paid_at::text, p.created_at::text, p.updated_at::text, p.tenant_id
      FROM payments p
      JOIN orders o ON o.id = p.order_id AND o.tenant_id = p.tenant_id
      WHERE p.order_id = $1 AND p.tenant_id = $2
      ORDER BY p.created_at DESC LIMIT 1
    `, [request.params.orderId, session.tenant_id]);
    if (!rows[0]) return reply.status(404).send({ error: { code: 'payment_not_found', message: 'Pagamento não encontrado.', request_id: request.id } });

    const { rows: events } = await database.query<PaymentEventRow>(`
      SELECT id AS event_id, provider_event_id, provider_status, normalized_status, occurred_at::text
      FROM payment_events WHERE payment_id = $1 AND tenant_id = $2 ORDER BY occurred_at
    `, [rows[0].payment_id, session.tenant_id]);

    return {
      payment: { ...rows[0], next_states: paymentTransitions[rows[0].status] ?? [] },
      events,
    };
  });

  app.get<{ Params: PaymentIdParams }>('/v1/admin/payments/:paymentId', async (request, reply) => {
    const session = await requireOperator(request, database);
    const { rows } = await database.query<PaymentRow>(`
      SELECT id AS payment_id, order_id, provider, method, status,
        amount_cents, currency, provider_reference, checkout_url,
        paid_at::text, created_at::text, updated_at::text, tenant_id
      FROM payments WHERE id = $1 AND tenant_id = $2
    `, [request.params.paymentId, session.tenant_id]);
    if (!rows[0]) return reply.status(404).send({ error: { code: 'payment_not_found', message: 'Pagamento não encontrado.', request_id: request.id } });
    const { rows: events } = await database.query<PaymentEventRow>(`
      SELECT id AS event_id, provider_event_id, provider_status, normalized_status, occurred_at::text
      FROM payment_events WHERE payment_id = $1 AND tenant_id = $2 ORDER BY occurred_at
    `, [request.params.paymentId, session.tenant_id]);
    return { payment: { ...rows[0], next_states: paymentTransitions[rows[0].status] ?? [] }, events };
  });

  app.post<{
    Headers: { 'x-mp-signature'?: string };
    Body: { id: string; type: string; data?: { id?: string }; action?: string; status?: string };
  }>(
    '/v1/public/webhooks/payment/mercado-pago',
    { schema: { body: { type: 'object', required: ['id', 'type'], properties: {
      id: { type: 'string' }, type: { type: 'string' },
      data: { type: 'object', properties: { id: { type: 'string' } } },
      action: { type: 'string' }, status: { type: 'string' },
    } } } },
    async (request, reply) => {
      const bodyStr = JSON.stringify(request.body);
      const sig = request.headers['x-mp-signature'];

      if (process.env.NODE_ENV !== 'test' && !verifyMpSignature(bodyStr, sig)) {
        return reply.status(401).send({ error: { code: 'invalid_signature', message: 'Assinatura inválida.' } });
      }

      const externalEventId = request.body.id;
      const mpStatus = request.body.status ?? request.body.action ?? 'pending';
      const providerRef = request.body.data?.id ?? externalEventId;
      const normalizedStatus = mpStatusMap[mpStatus] ?? 'PENDING';

      try {
        await database.query(
          `INSERT INTO integration_inbox (provider, external_event_id, event_type, payload, payload_hash)
           VALUES ('mercado_pago', $1, $2, $3::jsonb, $4)`,
          [externalEventId, request.body.type,
            JSON.stringify(request.body),
            createHash('sha256').update(bodyStr).digest('hex')],
        );
      } catch {
        return reply.status(200).send({ ok: true, duplicate: true });
      }

      await database.transaction(async (tx) => {
        const { rows } = await tx.query<PaymentRow>(`
          SELECT p.id AS payment_id, p.order_id, p.provider, p.method, p.status,
            p.amount_cents, p.currency, p.provider_reference, p.tenant_id, p.paid_at::text,
            p.created_at::text, p.updated_at::text, p.checkout_url
          FROM payments p
          WHERE p.provider_reference = $1 AND p.provider IN ('fake_mercado_pago', 'mercado_pago')
          LIMIT 1
        `, [providerRef]);

        if (!rows[0]) {
          await tx.query(
            `UPDATE integration_inbox SET status = 'IGNORED', processed_at = now()
             WHERE provider = 'mercado_pago' AND external_event_id = $1`,
            [externalEventId],
          );
          return;
        }

        const result = await applyPaymentEvent(
          tx, rows[0].tenant_id, rows[0], normalizedStatus, mpStatus,
          externalEventId, request.body, new Date(),
        );
        await tx.query(
          `UPDATE integration_inbox SET status = $1, processed_at = now()
           WHERE provider = 'mercado_pago' AND external_event_id = $2`,
          [result.applied ? 'PROCESSED' : 'IGNORED', externalEventId],
        );
      });

      return reply.status(200).send({ ok: true });
    },
  );

  app.post<{ Params: OrderIdParams; Body: { mp_status: string; provider_reference?: string } }>(
    '/v1/admin/orders/:orderId/payment/simulate',
    {
      schema: {
        body: {
          type: 'object', additionalProperties: false, required: ['mp_status'],
          properties: {
            mp_status: { type: 'string', enum: Object.keys(mpStatusMap) },
            provider_reference: { type: 'string', maxLength: 200 },
          },
        },
      },
    },
    async (request) => {
      const session = await requireOperator(request, database);
      const { mp_status, provider_reference } = request.body;
      const normalizedStatus = mpStatusMap[mp_status]!;

      return database.transaction(async (tx) => {
        const { rows } = await tx.query<PaymentRow>(`
          SELECT id AS payment_id, order_id, provider, method, status,
            amount_cents, currency, provider_reference, tenant_id, paid_at::text,
            created_at::text, updated_at::text, checkout_url
          FROM payments
          WHERE order_id = $1 AND tenant_id = $2
          ORDER BY created_at DESC LIMIT 1 FOR UPDATE
        `, [request.params.orderId, session.tenant_id]);
        if (!rows[0]) throw new HttpError(404, 'payment_not_found', 'Pagamento não encontrado.');

        const ref = provider_reference ?? rows[0].provider_reference ?? `sim-${Date.now()}`;
        if (!rows[0].provider_reference) {
          await tx.query(
            `UPDATE payments SET provider_reference = $1, status = 'PENDING', updated_at = now() WHERE id = $2 AND tenant_id = $3`,
            [ref, rows[0].payment_id, session.tenant_id],
          );
          rows[0].provider_reference = ref;
          rows[0].status = 'PENDING';
        }

        const result = await applyPaymentEvent(
          tx, session.tenant_id, rows[0], normalizedStatus,
          mp_status, `sim-${Date.now()}-${Math.random()}`, { simulated: true, mp_status },
          new Date(),
        );
        return { applied: result.applied, normalized_status: normalizedStatus, reason: result.reason };
      });
    },
  );
}
