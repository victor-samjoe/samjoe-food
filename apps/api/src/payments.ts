import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Database, TransactionalDatabase } from './catalog.js';
import { resolveSession } from './auth.js';
import { HttpError } from './errors.js';
import { dispatchOrderEvent } from './sales-engine-webhook.js';
import { releaseReservations } from './orders.js';

export type PaymentStatus =
  | 'CREATED' | 'PENDING' | 'AUTHORIZED' | 'PAID'
  | 'FAILED' | 'EXPIRED' | 'CANCELLED'
  | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'CHARGEBACK';

type OrderIdParams = { orderId: string };
type PaymentIdParams = { paymentId: string };

export type PaymentRow = {
  payment_id: string; order_id: string; provider: string; method: string;
  status: PaymentStatus; amount_cents: number; currency: string;
  provider_reference: string | null; checkout_url: string | null;
  paid_at: string | null; expires_at?: string | null; created_at: string; updated_at: string;
  tenant_id: string;
};
type PaymentEventRow = {
  event_id: string; provider_event_id: string | null; provider_status: string | null;
  normalized_status: string; occurred_at: string;
};
type MpIntegrationRow = {
  tenant_id: string;
  store_id: string;
  access_token: string;
  webhook_secret: string | null;
};
export type MpPayment = {
  id: number | string;
  status: string;
  status_detail?: string;
  external_reference: string | null;
  transaction_amount: number;
  currency_id: string;
  date_approved?: string | null;
  date_last_updated?: string | null;
};

const paymentTransitions: Record<PaymentStatus, readonly PaymentStatus[]> = {
  CREATED:           ['PENDING', 'CANCELLED'],
  PENDING:           ['AUTHORIZED', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED'],
  AUTHORIZED:        ['PAID', 'FAILED', 'CANCELLED'],
  PAID:              ['PARTIALLY_REFUNDED', 'REFUNDED', 'CHARGEBACK'],
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

export function verifyMpSignature(
  secret: string,
  header: string | undefined,
  requestId: string | undefined,
  dataId: string | undefined,
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((part) => {
    const [key, ...rest] = part.trim().split('=');
    return [key, rest.join('=')];
  }));
  const ts = parts['ts'];
  const received = parts['v1'];
  if (!ts || !received) return false;
  const manifest = `${dataId ? `id:${dataId};` : ''}${requestId ? `request-id:${requestId};` : ''}ts:${ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export async function getMpPayment(accessToken: string, paymentId: string): Promise<MpPayment> {
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new HttpError(502, 'mp_payment_lookup_failed', `Mercado Pago retornou ${response.status}: ${body.slice(0, 200)}`);
  }
  return response.json() as Promise<MpPayment>;
}

async function requireOperator(request: Parameters<typeof resolveSession>[0], database: Database) {
  const session = await resolveSession(request, database);
  if (!session) throw new HttpError(401, 'unauthorized', 'Sessão ausente ou expirada.');
  if (!['OWNER', 'ADMIN', 'OPERATOR'].includes(session.role)) {
    throw new HttpError(403, 'forbidden', 'Permissão insuficiente.');
  }
  return session;
}

export async function applyPaymentEvent(
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
    const { rows: advancedOrders } = await database.query<{ id: string }>(
      `UPDATE orders SET status = 'NEW', updated_at = now()
       WHERE id = $1 AND tenant_id = $2 AND status = 'PAYMENT_PENDING'
       RETURNING id`,
      [payment.order_id, tenantId],
    );
    if (advancedOrders[0]) {
      await database.query(
        `INSERT INTO order_status_events (tenant_id, order_id, from_status, to_status, actor_type, reason)
         VALUES ($1, $2, 'PAYMENT_PENDING', 'NEW', 'INTEGRATION', 'Pagamento confirmado pelo Mercado Pago')`,
        [tenantId, payment.order_id],
      );
      await database.query(
        `INSERT INTO integration_outbox (tenant_id, event_type, aggregate_type, aggregate_id, payload)
         VALUES ($1, 'foodapp.order.status_changed.v1', 'order', $2, $3::jsonb)`,
        [tenantId, payment.order_id, JSON.stringify({ order_id: payment.order_id, from_status: 'PAYMENT_PENDING', to_status: 'NEW', source: 'mercado_pago' })],
      );
    }
    await database.query(
      `INSERT INTO integration_outbox (tenant_id, event_type, aggregate_type, aggregate_id, payload)
       VALUES ($1, 'foodapp.payment.paid.v1', 'payment', $2, $3::jsonb)`,
      [tenantId, payment.payment_id, JSON.stringify({ payment_id: payment.payment_id, order_id: payment.order_id, amount_cents: payment.amount_cents })],
    );
  }

  if (normalizedStatus === 'EXPIRED' || normalizedStatus === 'CANCELLED') {
    const cancellationReason = normalizedStatus === 'EXPIRED'
      ? 'Prazo do pagamento Pix expirado'
      : 'Pagamento Pix cancelado pelo cliente';
    const cancellationSource = normalizedStatus === 'EXPIRED' ? 'pix_expiration' : 'customer_pix_cancellation';
    const { rows: cancelledOrders } = await database.query<{ id: string }>(
      `UPDATE orders SET status = 'CANCELLED', updated_at = now()
       WHERE id = $1 AND tenant_id = $2 AND status = 'PAYMENT_PENDING'
       RETURNING id`,
      [payment.order_id, tenantId],
    );
    if (cancelledOrders[0]) {
      await releaseReservations(database, tenantId, payment.order_id);
      await database.query(
        `INSERT INTO order_status_events (tenant_id, order_id, from_status, to_status, actor_type, reason)
          VALUES ($1, $2, 'PAYMENT_PENDING', 'CANCELLED', 'INTEGRATION', $3)`,
        [tenantId, payment.order_id, cancellationReason],
      );
      await database.query(
        `INSERT INTO integration_outbox (tenant_id, event_type, aggregate_type, aggregate_id, payload)
         VALUES ($1, 'foodapp.order.status_changed.v1', 'order', $2, $3::jsonb)`,
        [tenantId, payment.order_id, JSON.stringify({ order_id: payment.order_id, from_status: 'PAYMENT_PENDING', to_status: 'CANCELLED', source: cancellationSource })],
      );
    }
  }

  if (normalizedStatus === 'REFUNDED') {
    const { rows: cancelledOrders } = await database.query<{ id: string; previous_status: string }>(
      `UPDATE orders SET status = 'CANCELLED', updated_at = now()
       WHERE id = $1 AND tenant_id = $2 AND status NOT IN ('CANCELLED', 'COMPLETED')
       RETURNING id, status AS previous_status`,
      [payment.order_id, tenantId],
    );
    if (cancelledOrders[0]) {
      await releaseReservations(database, tenantId, payment.order_id);
      await database.query(
        `INSERT INTO order_status_events (tenant_id, order_id, to_status, actor_type, reason)
         VALUES ($1, $2, 'CANCELLED', 'INTEGRATION', 'Pedido cancelado após estorno no Mercado Pago')`,
        [tenantId, payment.order_id],
      );
      await database.query(
        `INSERT INTO integration_outbox (tenant_id, event_type, aggregate_type, aggregate_id, payload)
         VALUES ($1, 'foodapp.order.status_changed.v1', 'order', $2, $3::jsonb)`,
        [tenantId, payment.order_id, JSON.stringify({ order_id: payment.order_id, to_status: 'CANCELLED', source: 'mercado_pago_refund' })],
      );
    }
    await database.query(
      `INSERT INTO integration_outbox (tenant_id, event_type, aggregate_type, aggregate_id, payload)
       VALUES ($1, 'foodapp.payment.refunded.v1', 'payment', $2, $3::jsonb)`,
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

  app.post<{ Params: OrderIdParams; Body: { reason?: string | null } }>(
    '/v1/admin/orders/:orderId/payment/refund',
    {
      schema: { body: { type: 'object', additionalProperties: false, properties: {
        reason: { type: ['string', 'null'], maxLength: 500 },
      } } },
    },
    async (request) => {
      const session = await requireOperator(request, database);
      if (!['OWNER', 'ADMIN'].includes(session.role)) {
        throw new HttpError(403, 'forbidden', 'Somente administradores podem estornar pagamentos.');
      }
      const { rows } = await database.query<PaymentRow & { order_status: string; access_token: string }>(`
        SELECT p.id AS payment_id, p.order_id, p.provider, p.method, p.status,
          p.amount_cents, p.currency, p.provider_reference, p.checkout_url,
          p.paid_at::text, p.created_at::text, p.updated_at::text, p.tenant_id,
          o.status AS order_status, spi.access_token
        FROM payments p
        JOIN orders o ON o.id = p.order_id AND o.tenant_id = p.tenant_id
        JOIN store_payment_integrations spi ON spi.store_id = o.store_id AND spi.tenant_id = o.tenant_id
          AND spi.provider = 'mercado_pago' AND spi.is_active = true AND spi.access_token IS NOT NULL
        WHERE p.order_id = $1 AND p.tenant_id = $2
        ORDER BY p.created_at DESC LIMIT 1
      `, [request.params.orderId, session.tenant_id]);
      const payment = rows[0];
      if (!payment) throw new HttpError(404, 'payment_not_found', 'Pagamento não encontrado.');
      if (payment.status === 'REFUNDED') return { ok: true, already_refunded: true, payment_status: 'REFUNDED' };
      if (payment.status !== 'PAID') throw new HttpError(409, 'payment_not_paid', 'Somente pagamentos aprovados podem ser estornados.');
      if (payment.order_status === 'COMPLETED') throw new HttpError(409, 'completed_order_refund_blocked', 'Pedido concluído exige revisão administrativa antes do estorno.');
      if (!payment.provider_reference) throw new HttpError(409, 'provider_reference_missing', 'Identificador do pagamento no Mercado Pago não encontrado.');

      const refundResponse = await fetch(
        `https://api.mercadopago.com/v1/payments/${encodeURIComponent(payment.provider_reference)}/refunds`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${payment.access_token}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': `foodapp-refund-${payment.payment_id}`,
          },
          body: '{}',
        },
      );
      if (!refundResponse.ok) {
        const body = await refundResponse.text().catch(() => '');
        throw new HttpError(502, 'mp_refund_failed', `Mercado Pago não confirmou o estorno (${refundResponse.status}): ${body.slice(0, 200)}`);
      }
      const refund = await refundResponse.json() as { id: string | number; payment_id: string | number; amount: number; status: string; date_created?: string };
      if (refund.status !== 'approved') {
        throw new HttpError(502, 'mp_refund_not_approved', 'O Mercado Pago não aprovou o estorno.');
      }

      const result = await database.transaction(async (tx) => {
        const { rows: lockedRows } = await tx.query<PaymentRow>(`
          SELECT id AS payment_id, order_id, provider, method, status, amount_cents, currency,
            provider_reference, checkout_url, paid_at::text, created_at::text, updated_at::text, tenant_id
          FROM payments WHERE id = $1 AND tenant_id = $2 FOR UPDATE
        `, [payment.payment_id, session.tenant_id]);
        const locked = lockedRows[0];
        if (!locked) throw new HttpError(404, 'payment_not_found', 'Pagamento não encontrado.');
        if (locked.status === 'REFUNDED') return { applied: false, reason: 'already_refunded' };
        if (locked.status !== 'PAID') throw new HttpError(409, 'payment_status_changed', 'O estado do pagamento mudou durante o estorno.');
        return applyPaymentEvent(
          tx, session.tenant_id, locked, 'REFUNDED', 'refunded', `refund-${refund.id}`,
          { refund, reason: request.body.reason ?? null, actor_id: session.user_id },
          new Date(refund.date_created ?? Date.now()),
        );
      });
      if (result.applied) {
        try {
          await dispatchOrderEvent(database, session.tenant_id, request.params.orderId, 'order.status_changed', {
            from: payment.order_status,
            to: 'CANCELLED',
          });
        } catch (error) {
          console.error(JSON.stringify({ type: 'sales_engine_dispatch_failed', eventType: 'order.status_changed', reason: (error as Error).message }));
        }
      }
      return {
        ok: true,
        refund: { id: String(refund.id), amount_cents: Math.round(Number(refund.amount) * 100), status: refund.status },
        payment_status: 'REFUNDED',
        applied: result.applied,
      };
    },
  );

  app.post<{
    Headers: { 'x-signature'?: string; 'x-request-id'?: string };
    Querystring: { store?: string; 'data.id'?: string; type?: string };
    Body: { id: string | number; type: string; data?: { id?: string | number }; action?: string; status?: string };
  }>(
    '/v1/public/webhooks/payment/mercado-pago',
    { schema: { body: { type: 'object', required: ['id', 'type'], properties: {
      id: { anyOf: [{ type: 'string' }, { type: 'number' }] }, type: { type: 'string' },
      data: { type: 'object', properties: { id: { anyOf: [{ type: 'string' }, { type: 'number' }] } } },
      action: { type: 'string' }, status: { type: 'string' },
    } } } },
    async (request, reply) => {
      const bodyStr = JSON.stringify(request.body);
      const storeSlug = request.query.store;
      const paymentId = String(request.query['data.id'] ?? request.body.data?.id ?? '');
      if (!storeSlug || !paymentId || request.body.type !== 'payment') {
        return reply.status(200).send({ ok: true, ignored: true });
      }

      const { rows: integrations } = await database.query<MpIntegrationRow>(
        `SELECT spi.tenant_id, spi.store_id, spi.access_token, spi.webhook_secret
         FROM store_payment_integrations spi
         JOIN stores s ON s.id = spi.store_id AND s.tenant_id = spi.tenant_id
         WHERE s.slug = $1 AND spi.provider = 'mercado_pago' AND spi.is_active = true
           AND spi.access_token IS NOT NULL
         LIMIT 1`,
        [storeSlug],
      );
      const integration = integrations[0];
      if (!integration) {
        return reply.status(404).send({ error: { code: 'integration_not_found', message: 'Integração não encontrada.' } });
      }

      const secret = integration.webhook_secret ?? process.env.MP_WEBHOOK_SECRET;
      if (process.env.NODE_ENV !== 'test' && (!secret || !verifyMpSignature(
        secret,
        request.headers['x-signature'],
        request.headers['x-request-id'],
        request.query['data.id'],
      ))) {
        return reply.status(401).send({ error: { code: 'invalid_signature', message: 'Assinatura inválida.' } });
      }

      const externalEventId = String(request.body.id);

      try {
        await database.query(
          `INSERT INTO integration_inbox (tenant_id, provider, external_event_id, event_type, payload, payload_hash)
           VALUES ($1, 'mercado_pago', $2, $3, $4::jsonb, $5)`,
          [integration.tenant_id, externalEventId, request.body.type,
            JSON.stringify(request.body),
            createHash('sha256').update(bodyStr).digest('hex')],
        );
      } catch {
        return reply.status(200).send({ ok: true, duplicate: true });
      }

      const mpPayment = process.env.NODE_ENV === 'test'
        ? ({ id: paymentId, status: request.body.status ?? 'pending', external_reference: paymentId, transaction_amount: 0, currency_id: 'BRL' } satisfies MpPayment)
        : await getMpPayment(integration.access_token, paymentId);
      const mpStatus = mpPayment.status;
      const normalizedStatus = mpStatusMap[mpStatus] ?? 'PENDING';

      const processed = await database.transaction(async (tx) => {
        const { rows } = await tx.query<PaymentRow>(`
          SELECT p.id AS payment_id, p.order_id, p.provider, p.method, p.status,
            p.amount_cents, p.currency, p.provider_reference, p.tenant_id, p.paid_at::text,
            p.created_at::text, p.updated_at::text, p.checkout_url
          FROM payments p
          JOIN orders o ON o.id = p.order_id AND o.tenant_id = p.tenant_id
          WHERE (o.public_number = $1 OR o.id::text = $1)
            AND p.tenant_id = $2 AND o.store_id = $3
            AND p.provider IN ('fake_mercado_pago', 'mercado_pago')
          LIMIT 1
          FOR UPDATE OF p
        `, [mpPayment.external_reference ?? '', integration.tenant_id, integration.store_id]);

        if (!rows[0]) {
          await tx.query(
            `UPDATE integration_inbox SET status = 'IGNORED', processed_at = now()
             WHERE provider = 'mercado_pago' AND external_event_id = $1`,
            [externalEventId],
          );
          return { applied: false, normalizedStatus, orderId: null as string | null };
        }

        const receivedCents = Math.round(Number(mpPayment.transaction_amount) * 100);
        if (process.env.NODE_ENV !== 'test' && (receivedCents !== rows[0].amount_cents || mpPayment.currency_id !== rows[0].currency)) {
          await tx.query(
            `UPDATE integration_inbox SET status = 'IGNORED', processed_at = now(), last_error = $1
             WHERE provider = 'mercado_pago' AND external_event_id = $2`,
            [`payment_mismatch:${receivedCents}:${mpPayment.currency_id}`, externalEventId],
          );
          return { applied: false, normalizedStatus, orderId: rows[0].order_id };
        }

        await tx.query(
          `UPDATE payments SET provider_reference = $1, provider = 'mercado_pago', updated_at = now()
           WHERE id = $2 AND tenant_id = $3`,
          [String(mpPayment.id), rows[0].payment_id, rows[0].tenant_id],
        );
        rows[0].provider_reference = String(mpPayment.id);
        rows[0].provider = 'mercado_pago';

        const result = await applyPaymentEvent(
          tx, rows[0].tenant_id, rows[0], normalizedStatus, mpStatus,
          externalEventId, {
            notification: request.body,
            payment: {
              id: String(mpPayment.id), status: mpPayment.status, status_detail: mpPayment.status_detail,
              external_reference: mpPayment.external_reference, transaction_amount: mpPayment.transaction_amount,
              currency_id: mpPayment.currency_id, date_approved: mpPayment.date_approved,
            },
          }, new Date(mpPayment.date_last_updated ?? Date.now()),
        );
        await tx.query(
          `UPDATE integration_inbox SET status = $1, processed_at = now()
           WHERE provider = 'mercado_pago' AND external_event_id = $2`,
          [result.applied ? 'PROCESSED' : 'IGNORED', externalEventId],
        );
        return { applied: result.applied, normalizedStatus, orderId: rows[0].order_id };
      });

      if (processed.applied && processed.normalizedStatus === 'PAID' && processed.orderId) {
        try {
          await dispatchOrderEvent(database, integration.tenant_id, processed.orderId, 'order.paid');
        } catch (error) {
          console.error(JSON.stringify({ type: 'sales_engine_dispatch_failed', eventType: 'order.paid', reason: (error as Error).message }));
        }
      }

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

      const result = await database.transaction(async (tx) => {
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
      if (result.applied && normalizedStatus === 'PAID') {
        try {
          await dispatchOrderEvent(database, session.tenant_id, request.params.orderId, 'order.paid');
        } catch (error) {
          console.error(JSON.stringify({ type: 'sales_engine_dispatch_failed', eventType: 'order.paid', reason: (error as Error).message }));
        }
      }
      return result;
    },
  );
}
