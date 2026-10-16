import type { FastifyInstance } from 'fastify';
import type { Database, TransactionalDatabase } from './catalog.js';
import { resolveSession } from './auth.js';
import { HttpError } from './errors.js';
import { applyPaymentEvent, getMpPayment, type PaymentRow, type PaymentStatus } from './payments.js';
import { dispatchOrderEvent } from './sales-engine-webhook.js';

type StoreSlugParams = { storeSlug: string };
type OrderParams = { storeSlug: string; orderId: string };

type IntegrationRow = {
  id: string;
  access_token: string | null;
  public_key: string | null;
  webhook_secret: string | null;
  is_active: boolean;
};

type OrderRow = {
  order_id: string;
  tenant_id: string;
  store_id: string;
  store_slug: string;
  store_name: string;
  public_number: string;
  total_cents: number;
  delivery_fee_cents: number;
  currency: string;
  customer_name: string | null;
  customer_email: string | null;
  payment_id: string;
  payment_status: string;
  checkout_url: string | null;
};
type OrderItemRow = {
  name_snapshot: string;
  quantity: number;
  unit_price_cents: number;
};

async function requireOperator(request: Parameters<typeof resolveSession>[0], database: Database) {
  const session = await resolveSession(request, database);
  if (!session) throw new HttpError(401, 'unauthorized', 'Sessão ausente ou expirada.');
  if (!['OWNER', 'ADMIN', 'OPERATOR'].includes(session.role)) {
    throw new HttpError(403, 'forbidden', 'Permissão insuficiente.');
  }
  return session;
}

type MpItem = { title: string; quantity: number; unit_price: number; currency_id: string };

export const PIX_EXPIRATION_MINUTES = 30;

export function pixExpirationDate(now = new Date()): string {
  return new Date(now.getTime() + PIX_EXPIRATION_MINUTES * 60_000).toISOString();
}

async function createMpPixPayment(opts: {
  accessToken: string;
  orderId: string;
  publicNumber: string;
  totalCents: number;
  currency: string;
  customerName: string | null;
  customerEmail: string | null;
  webhookUrl: string;
}): Promise<{ mp_id: string; qr_code: string; qr_code_base64: string; expires_at: string }> {
  const nameParts = (opts.customerName ?? '').trim().split(/\s+/);
  const requestedExpiration = pixExpirationDate();
  const res = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': `pix-${opts.orderId}`,
    },
    body: JSON.stringify({
      transaction_amount: Number((opts.totalCents / 100).toFixed(2)),
      description: `Pedido ${opts.publicNumber}`,
      payment_method_id: 'pix',
      payer: {
        email: opts.customerEmail ?? 'comprador@samjoe.com.br',
        first_name: nameParts[0] ?? 'Cliente',
        last_name: nameParts.slice(1).join(' ') || (nameParts[0] ?? 'Cliente'),
      },
      external_reference: opts.publicNumber,
      notification_url: opts.webhookUrl,
      date_of_expiration: requestedExpiration,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new HttpError(502, 'mp_api_error', `Mercado Pago retornou ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json() as {
    id: number | string;
    date_of_expiration?: string;
    point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } };
  };
  const qr_code = data.point_of_interaction?.transaction_data?.qr_code;
  const qr_code_base64 = data.point_of_interaction?.transaction_data?.qr_code_base64;
  if (!qr_code || !qr_code_base64) {
    throw new HttpError(502, 'mp_pix_qr_missing', 'Mercado Pago não retornou QR code PIX.');
  }
  return { mp_id: String(data.id), qr_code, qr_code_base64, expires_at: data.date_of_expiration ?? requestedExpiration };
}

async function fetchMpPixQr(accessToken: string, mpPaymentId: string): Promise<{ qr_code: string; qr_code_base64: string; expires_at: string | null }> {
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(mpPaymentId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new HttpError(502, 'mp_payment_lookup_failed', `Mercado Pago retornou ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json() as {
    date_of_expiration?: string | null;
    point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } };
  };
  const qr_code = data.point_of_interaction?.transaction_data?.qr_code;
  const qr_code_base64 = data.point_of_interaction?.transaction_data?.qr_code_base64;
  if (!qr_code || !qr_code_base64) throw new HttpError(502, 'mp_pix_qr_missing', 'QR code PIX não disponível.');
  return { qr_code, qr_code_base64, expires_at: data.date_of_expiration ?? null };
}

async function createMpPreference(opts: {
  accessToken: string;
  orderId: string;
  publicNumber: string;
  storeName: string;
  storeBaseUrl: string;
  items: MpItem[];
  customerName: string | null;
  customerEmail: string | null;
  webhookUrl: string;
}): Promise<{ checkout_url: string; mp_id: string }> {
  const isSandbox = opts.accessToken.startsWith('TEST-');
  const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${opts.accessToken}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': opts.orderId,
    },
    body: JSON.stringify({
      items: opts.items,
      external_reference: opts.publicNumber,
      statement_descriptor: (opts.storeName.split(/\s+/)[0] ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 13) || 'SAMJOE',
      metadata: { order_id: opts.orderId, public_number: opts.publicNumber },
      notification_url: opts.webhookUrl,
      payer: {
        ...(opts.customerName ? { name: opts.customerName.split(' ')[0] ?? '', surname: opts.customerName.split(' ').slice(1).join(' ') ?? '' } : {}),
        email: opts.customerEmail ?? 'comprador@samjoe.com.br',
      },
      back_urls: {
        success: `${opts.storeBaseUrl}?pedido=${opts.orderId}&pagamento=aprovado`,
        failure: `${opts.storeBaseUrl}?pedido=${opts.orderId}&pagamento=falhou`,
        pending: `${opts.storeBaseUrl}?pedido=${opts.orderId}&pagamento=pendente`,
      },
      auto_return: 'approved',
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new HttpError(502, 'mp_api_error', `Mercado Pago retornou ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json() as { id: string; init_point: string; sandbox_init_point: string };
  return { checkout_url: isSandbox ? data.sandbox_init_point : data.init_point, mp_id: data.id };
}

export function registerPaymentConfigRoutes(app: FastifyInstance, database: TransactionalDatabase) {
  app.get<{ Params: OrderParams }>(
    '/v1/public/stores/:storeSlug/orders/:orderId/payment-status',
    async (request, reply) => {
      const { rows } = await database.query<{
        public_number: string;
        order_status: string;
        payment_status: PaymentStatus;
        payment_method: string;
        amount_cents: number;
        currency: string;
        paid_at: string | null;
        expires_at: string | null;
      }>(`
        SELECT o.public_number, o.status AS order_status,
          p.status AS payment_status, p.method AS payment_method,
          p.amount_cents, p.currency, p.paid_at::text, p.expires_at::text
        FROM orders o
        JOIN stores s ON s.id = o.store_id AND s.tenant_id = o.tenant_id
        JOIN LATERAL (
          SELECT status, method, amount_cents, currency, paid_at, expires_at
          FROM payments
          WHERE order_id = o.id AND tenant_id = o.tenant_id
          ORDER BY created_at DESC
          LIMIT 1
        ) p ON true
        WHERE o.id = $1 AND s.slug = $2
        LIMIT 1
      `, [request.params.orderId, request.params.storeSlug]);
      if (!rows[0]) {
        return reply.status(404).send({ error: { code: 'order_not_found', message: 'Pedido não encontrado.' } });
      }
      return { payment: rows[0] };
    },
  );

  app.post<{ Params: OrderParams }>(
    '/v1/public/stores/:storeSlug/orders/:orderId/pix-payment/cancel',
    async (request, reply) => {
      const { rows } = await database.query<PaymentRow & {
        order_status: string;
        access_token: string | null;
        store_id: string;
      }>(`
        SELECT p.id AS payment_id, p.order_id, p.provider, p.method, p.status,
          p.amount_cents, p.currency, p.provider_reference, p.tenant_id,
          p.paid_at::text, p.created_at::text, p.updated_at::text, p.checkout_url,
          p.expires_at::text, o.status AS order_status, o.store_id, spi.access_token
        FROM payments p
        JOIN orders o ON o.id = p.order_id AND o.tenant_id = p.tenant_id
        JOIN stores s ON s.id = o.store_id AND s.tenant_id = o.tenant_id
        LEFT JOIN store_payment_integrations spi
          ON spi.store_id = o.store_id AND spi.tenant_id = o.tenant_id
          AND spi.provider = 'mercado_pago' AND spi.is_active = true
        WHERE o.id = $1 AND s.slug = $2 AND p.method = 'PIX'
        ORDER BY p.created_at DESC
        LIMIT 1
      `, [request.params.orderId, request.params.storeSlug]);
      const payment = rows[0];
      if (!payment) {
        return reply.status(404).send({ error: { code: 'payment_not_found', message: 'Pagamento Pix não encontrado.' } });
      }
      if (payment.status === 'PAID' || payment.status === 'REFUNDED') {
        throw new HttpError(409, 'payment_already_processed', 'Este Pix já foi pago e não pode ser cancelado por esta tela.');
      }
      if (!['CREATED', 'PENDING'].includes(payment.status) || payment.order_status !== 'PAYMENT_PENDING') {
        throw new HttpError(409, 'payment_not_cancellable', 'Este Pix não está mais disponível para cancelamento.');
      }

      if (payment.provider === 'mercado_pago' && payment.provider_reference) {
        if (!payment.access_token) throw new HttpError(503, 'integration_not_configured', 'Integração do Mercado Pago indisponível.');
        const response = await fetch(
          `https://api.mercadopago.com/v1/payments/${encodeURIComponent(payment.provider_reference)}`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${payment.access_token}`,
              'Content-Type': 'application/json',
              'X-Idempotency-Key': `foodapp-cancel-pix-${payment.payment_id}`,
            },
            body: JSON.stringify({ status: 'cancelled' }),
          },
        );
        if (!response.ok) {
          const current = await getMpPayment(payment.access_token, payment.provider_reference);
          if (current.status === 'approved') {
            throw new HttpError(409, 'payment_already_processed', 'O Pix foi confirmado antes do cancelamento.');
          }
          const body = await response.text().catch(() => '');
          throw new HttpError(502, 'mp_cancel_failed', `Mercado Pago não confirmou o cancelamento (${response.status}): ${body.slice(0, 180)}`);
        }
      }

      const result = await database.transaction(async (tx) => {
        const { rows: lockedRows } = await tx.query<PaymentRow>(`
          SELECT id AS payment_id, order_id, provider, method, status, amount_cents, currency,
            provider_reference, checkout_url, paid_at::text, expires_at::text,
            created_at::text, updated_at::text, tenant_id
          FROM payments WHERE id = $1 AND tenant_id = $2 FOR UPDATE
        `, [payment.payment_id, payment.tenant_id]);
        const locked = lockedRows[0];
        if (!locked) throw new HttpError(404, 'payment_not_found', 'Pagamento Pix não encontrado.');
        if (!['CREATED', 'PENDING'].includes(locked.status)) {
          throw new HttpError(409, 'payment_status_changed', 'O estado do Pix mudou durante o cancelamento.');
        }
        return applyPaymentEvent(
          tx, payment.tenant_id, locked, 'CANCELLED', 'cancelled',
          `customer-cancel-${payment.payment_id}`, { source: 'storefront_customer' }, new Date(),
        );
      });
      if (result.applied) {
        try {
          await dispatchOrderEvent(database, payment.tenant_id, payment.order_id, 'order.status_changed', {
            from: payment.order_status,
            to: 'CANCELLED',
          });
        } catch (error) {
          console.error(JSON.stringify({ type: 'sales_engine_dispatch_failed', eventType: 'order.status_changed', reason: (error as Error).message }));
        }
      }
      return { ok: true, payment_status: 'CANCELLED', order_status: 'CANCELLED' };
    },
  );


  // ── Admin: GET payment config ─────────────────────────────────────────────
  app.get<{ Params: StoreSlugParams }>('/v1/admin/stores/:storeSlug/payment-config', async (request, reply) => {
    const session = await requireOperator(request, database);
    const { rows: storeRows } = await database.query<{ store_id: string }>(
      `SELECT id AS store_id FROM stores WHERE slug = $1 AND tenant_id = $2`,
      [request.params.storeSlug, session.tenant_id],
    );
    if (!storeRows[0]) return reply.status(404).send({ error: { code: 'store_not_found' } });

    const { rows } = await database.query<IntegrationRow>(
      `SELECT id, access_token, public_key, webhook_secret, is_active
       FROM store_payment_integrations
       WHERE tenant_id = $1 AND store_id = $2 AND provider = 'mercado_pago'`,
      [session.tenant_id, storeRows[0].store_id],
    );
    const mp = rows[0];
    return {
      integrations: {
        mercado_pago: mp
          ? { has_access_token: !!mp.access_token, has_webhook_secret: !!mp.webhook_secret, public_key: mp.public_key, is_active: mp.is_active }
          : { has_access_token: false, has_webhook_secret: false, public_key: null, is_active: false },
      },
    };
  });

  // ── Admin: PUT Mercado Pago credentials ───────────────────────────────────
  app.put<{
    Params: StoreSlugParams;
    Body: { access_token?: string; public_key?: string; webhook_secret?: string; is_active?: boolean };
  }>('/v1/admin/stores/:storeSlug/payment-config/mercado-pago', {
    schema: {
      body: {
        type: 'object', additionalProperties: false,
        properties: {
          access_token: { type: 'string', maxLength: 600 },
          public_key:   { type: 'string', maxLength: 600 },
          webhook_secret: { type: 'string', maxLength: 600 },
          is_active:    { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const session = await requireOperator(request, database);
    const { rows: storeRows } = await database.query<{ store_id: string }>(
      `SELECT id AS store_id FROM stores WHERE slug = $1 AND tenant_id = $2`,
      [request.params.storeSlug, session.tenant_id],
    );
    if (!storeRows[0]) return reply.status(404).send({ error: { code: 'store_not_found' } });
    const { store_id } = storeRows[0];

    const toSet: Record<string, unknown> = {};
    if (request.body.access_token !== undefined) toSet['access_token'] = request.body.access_token;
    if (request.body.public_key   !== undefined) toSet['public_key']   = request.body.public_key;
    if (request.body.webhook_secret !== undefined) toSet['webhook_secret'] = request.body.webhook_secret;
    if (request.body.is_active    !== undefined) toSet['is_active']    = request.body.is_active;

    const extraCols  = Object.keys(toSet);
    const extraVals  = Object.values(toSet);
    const baseVals: unknown[] = [session.tenant_id, store_id];
    const allVals    = [...baseVals, ...extraVals];
    const colList    = ['tenant_id', 'store_id', 'provider', ...extraCols].join(', ');
    const valList    = ['$1', '$2', "'mercado_pago'", ...extraCols.map((_, i) => `$${i + 3}`)].join(', ');
    const updateSets = extraCols.length > 0
      ? extraCols.map(k => `${k} = EXCLUDED.${k}`).join(', ') + ', updated_at = now()'
      : 'updated_at = now()';

    const { rows } = await database.query<{ has_access_token: boolean; has_webhook_secret: boolean; public_key: string | null; is_active: boolean }>(
      `INSERT INTO store_payment_integrations (${colList})
       VALUES (${valList})
       ON CONFLICT (tenant_id, store_id, provider) DO UPDATE SET ${updateSets}
       RETURNING access_token IS NOT NULL AS has_access_token, webhook_secret IS NOT NULL AS has_webhook_secret, public_key, is_active`,
      allVals,
    );
    return { mercado_pago: rows[0] };
  });

  // ── Admin: DELETE Mercado Pago credentials ────────────────────────────────
  app.delete<{ Params: StoreSlugParams }>(
    '/v1/admin/stores/:storeSlug/payment-config/mercado-pago',
    async (request, reply) => {
      const session = await requireOperator(request, database);
      const { rows: storeRows } = await database.query<{ store_id: string }>(
        `SELECT id AS store_id FROM stores WHERE slug = $1 AND tenant_id = $2`,
        [request.params.storeSlug, session.tenant_id],
      );
      if (!storeRows[0]) return reply.status(404).send({ error: { code: 'store_not_found' } });
      await database.query(
        `DELETE FROM store_payment_integrations WHERE tenant_id = $1 AND store_id = $2 AND provider = 'mercado_pago'`,
        [session.tenant_id, storeRows[0].store_id],
      );
      return reply.status(204).send();
    },
  );

  // ── Public: create MP payment preference ─────────────────────────────────
  app.post<{ Params: OrderParams }>(
    '/v1/public/stores/:storeSlug/orders/:orderId/mp-payment',
    async (request, reply) => {
      const { storeSlug, orderId } = request.params;

      const { rows: storeRows } = await database.query<{ tenant_id: string; store_id: string; mercado_pago_enabled: boolean }>(
        `SELECT tenant_id, id AS store_id, mercado_pago_enabled
         FROM stores WHERE slug = $1 AND status = 'ACTIVE'`,
        [storeSlug],
      );
      if (!storeRows[0]) return reply.status(404).send({ error: { code: 'store_not_found' } });
      const { tenant_id, store_id, mercado_pago_enabled } = storeRows[0];
      if (!mercado_pago_enabled) {
        return reply.status(422).send({ error: { code: 'payment_method_not_available', message: 'Mercado Pago não está habilitado nesta loja.' } });
      }

      const { rows: orderRows } = await database.query<OrderRow>(`
        SELECT o.id AS order_id, o.tenant_id, o.store_id, s.slug AS store_slug, s.name AS store_name, o.public_number,
          o.total_cents, o.delivery_fee_cents, o.currency,
          (o.customer_snapshot->>'name')  AS customer_name,
          (o.customer_snapshot->>'email') AS customer_email,
          p.id AS payment_id, p.status AS payment_status, p.checkout_url
        FROM orders o
        JOIN stores s ON s.id = o.store_id AND s.tenant_id = o.tenant_id
        LEFT JOIN payments p ON p.order_id = o.id AND p.tenant_id = o.tenant_id
        WHERE o.id = $1 AND o.tenant_id = $2 AND o.store_id = $3 AND o.status = 'PAYMENT_PENDING'
        ORDER BY p.created_at DESC LIMIT 1
      `, [orderId, tenant_id, store_id]);
      if (!orderRows[0]) {
        return reply.status(404).send({ error: { code: 'order_not_found', message: 'Pedido não encontrado ou já processado.' } });
      }
      const order = orderRows[0];

      if (order.checkout_url) {
        return { checkout_url: order.checkout_url, payment_id: order.payment_id };
      }

      const { rows: integRows } = await database.query<{ access_token: string }>(
        `SELECT access_token FROM store_payment_integrations
         WHERE tenant_id = $1 AND store_id = $2 AND provider = 'mercado_pago' AND is_active = true AND access_token IS NOT NULL`,
        [tenant_id, store_id],
      );
      if (!integRows[0]) {
        return reply.status(422).send({ error: { code: 'integration_not_configured', message: 'Integração com Mercado Pago não configurada.' } });
      }

      // Fetch real order items
      const { rows: itemRows } = await database.query<OrderItemRow>(
        `SELECT name_snapshot, quantity, unit_price_cents
         FROM order_items WHERE order_id = $1 AND tenant_id = $2`,
        [orderId, tenant_id],
      );

      const mpItems: MpItem[] = itemRows.length > 0
        ? itemRows.map((item) => ({
            title: item.name_snapshot,
            quantity: item.quantity,
            unit_price: Number((item.unit_price_cents / 100).toFixed(2)),
            currency_id: order.currency,
          }))
        : [{
            title: `Pedido #${orderId.slice(0, 8).toUpperCase()}`,
            quantity: 1,
            unit_price: Number((order.total_cents / 100).toFixed(2)),
            currency_id: order.currency,
          }];
      if (itemRows.length > 0 && order.delivery_fee_cents > 0) {
        mpItems.push({
          title: 'Taxa de entrega',
          quantity: 1,
          unit_price: Number((order.delivery_fee_cents / 100).toFixed(2)),
          currency_id: order.currency,
        });
      }

      // Resolve store base URL: primary verified domain OR platform subdomain
      const { rows: domainRows } = await database.query<{ hostname: string }>(
        `SELECT hostname FROM store_domains
         WHERE store_id = $1 AND tenant_id = $2 AND status = 'VERIFIED' AND is_primary = true
         LIMIT 1`,
        [store_id, tenant_id],
      );
      const platformBase = process.env.APP_URL ?? 'https://lojas.samjoe.com.br';
      const storeBaseUrl = domainRows[0]
        ? `https://${domainRows[0].hostname}`
        : `${platformBase}/${order.store_slug}`;

      const webhookUrl = `${process.env.PAYMENT_WEBHOOK_BASE_URL ?? 'https://lojas.samjoe.com.br'}/api/webhooks/mercado-pago?store=${encodeURIComponent(order.store_slug)}`;

      const { checkout_url, mp_id } = await createMpPreference({
        accessToken: integRows[0].access_token,
        orderId: order.order_id,
        publicNumber: order.public_number,
        storeName: order.store_name,
        storeBaseUrl,
        items: mpItems,
        customerName: order.customer_name,
        customerEmail: order.customer_email,
        webhookUrl,
      });

      await database.query(
        `UPDATE payments SET checkout_url = $1, provider_reference = $2, provider = 'mercado_pago', status = 'PENDING', updated_at = now()
         WHERE id = $3 AND tenant_id = $4`,
        [checkout_url, mp_id, order.payment_id, tenant_id],
      );

      return { checkout_url, payment_id: order.payment_id };
    },
  );

  // ── Public: create/fetch PIX QR code via Mercado Pago ────────────────────
  app.post<{ Params: OrderParams }>(
    '/v1/public/stores/:storeSlug/orders/:orderId/pix-payment',
    async (request, reply) => {
      const { storeSlug, orderId } = request.params;

      const { rows: storeRows } = await database.query<{ tenant_id: string; store_id: string; pix_key: string | null }>(
        `SELECT tenant_id, id AS store_id, pix_key FROM stores WHERE slug = $1 AND status = 'ACTIVE'`,
        [storeSlug],
      );
      if (!storeRows[0]) return reply.status(404).send({ error: { code: 'store_not_found' } });
      const { tenant_id, store_id, pix_key } = storeRows[0];

      const { rows: orderRows } = await database.query<{
        order_id: string; public_number: string; store_slug: string;
        total_cents: number; currency: string;
        customer_name: string | null; customer_email: string | null;
        payment_id: string; payment_status: string; provider_reference: string | null; payment_expires_at: string | null;
      }>(`
        SELECT o.id AS order_id, o.public_number, s.slug AS store_slug,
          o.total_cents, o.currency,
          (o.customer_snapshot->>'name')  AS customer_name,
          (o.customer_snapshot->>'email') AS customer_email,
          p.id AS payment_id, p.status AS payment_status, p.provider_reference,
          p.expires_at::text AS payment_expires_at
        FROM orders o
        JOIN stores s ON s.id = o.store_id AND s.tenant_id = o.tenant_id
        LEFT JOIN payments p ON p.order_id = o.id AND p.tenant_id = o.tenant_id
        WHERE o.id = $1 AND o.tenant_id = $2 AND o.store_id = $3 AND o.status = 'PAYMENT_PENDING'
        ORDER BY p.created_at DESC LIMIT 1
      `, [orderId, tenant_id, store_id]);
      if (!orderRows[0]) {
        return reply.status(404).send({ error: { code: 'order_not_found', message: 'Pedido não encontrado ou já processado.' } });
      }
      const order = orderRows[0];

      const { rows: integRows } = await database.query<{ access_token: string }>(
        `SELECT access_token FROM store_payment_integrations
         WHERE tenant_id = $1 AND store_id = $2 AND provider = 'mercado_pago' AND is_active = true AND access_token IS NOT NULL`,
        [tenant_id, store_id],
      );

      const mpToken = integRows[0]?.access_token;

      // No active MP integration — fall back to static PIX key
      if (!mpToken) {
        if (!pix_key) return reply.status(422).send({ error: { code: 'pix_not_available', message: 'Integração com Mercado Pago não configurada e nenhuma chave PIX estática definida.' } });
        return { pix_key };
      }

      // Re-fetch QR code if payment already created via MP
      if (order.provider_reference) {
        try {
          const qr = await fetchMpPixQr(mpToken, order.provider_reference);
          return { ...qr, expires_at: qr.expires_at ?? order.payment_expires_at };
        } catch {
          if (pix_key) return { pix_key };
          throw new HttpError(502, 'mp_pix_refetch_failed', 'Não foi possível recuperar o QR code PIX.');
        }
      }

      const webhookUrl = `${process.env.PAYMENT_WEBHOOK_BASE_URL ?? 'https://lojas.samjoe.com.br'}/api/webhooks/mercado-pago?store=${encodeURIComponent(order.store_slug)}`;

      try {
        const { mp_id, qr_code, qr_code_base64, expires_at } = await createMpPixPayment({
          accessToken: mpToken,
          orderId: order.order_id,
          publicNumber: order.public_number,
          totalCents: order.total_cents,
          currency: order.currency,
          customerName: order.customer_name,
          customerEmail: order.customer_email,
          webhookUrl,
        });

        await database.query(
          `UPDATE payments SET provider_reference = $1, provider = 'mercado_pago', status = 'PENDING', expires_at = $4, updated_at = now()
           WHERE id = $2 AND tenant_id = $3`,
          [mp_id, order.payment_id, tenant_id, expires_at],
        );

        return { qr_code, qr_code_base64, expires_at };
      } catch (mpErr) {
        // MP PIX unavailable (account not approved for transparent checkout) — fall back to static key
        if (pix_key) return { pix_key };
        throw mpErr;
      }
    },
  );

  app.post<{
    Params: OrderParams;
    Body: { payment_id: string };
  }>(
    '/v1/public/stores/:storeSlug/orders/:orderId/mp-payment/reconcile',
    {
      schema: {
        body: {
          type: 'object', additionalProperties: false, required: ['payment_id'],
          properties: { payment_id: { type: 'string', minLength: 1, maxLength: 100 } },
        },
      },
    },
    async (request, reply) => {
      const { storeSlug, orderId } = request.params;
      const { rows: integrationRows } = await database.query<{ tenant_id: string; store_id: string; access_token: string }>(`
        SELECT spi.tenant_id, spi.store_id, spi.access_token
          FROM store_payment_integrations spi
          JOIN stores s ON s.id = spi.store_id AND s.tenant_id = spi.tenant_id
         WHERE s.slug = $1 AND spi.provider = 'mercado_pago' AND spi.is_active = true
           AND spi.access_token IS NOT NULL
         LIMIT 1
      `, [storeSlug]);
      const integration = integrationRows[0];
      if (!integration) {
        return reply.status(404).send({ error: { code: 'integration_not_found', message: 'Integração não encontrada.' } });
      }

      const mpPayment = await getMpPayment(integration.access_token, request.body.payment_id);
      const result = await database.transaction(async (tx) => {
        const { rows } = await tx.query<PaymentRow & { public_number: string }>(`
          SELECT p.id AS payment_id, p.order_id, p.provider, p.method, p.status,
            p.amount_cents, p.currency, p.provider_reference, p.tenant_id, p.paid_at::text,
            p.created_at::text, p.updated_at::text, p.checkout_url, o.public_number
          FROM payments p
          JOIN orders o ON o.id = p.order_id AND o.tenant_id = p.tenant_id
          WHERE o.id = $1 AND p.tenant_id = $2 AND o.store_id = $3
            AND p.provider IN ('fake_mercado_pago', 'mercado_pago')
          ORDER BY p.created_at DESC LIMIT 1
          FOR UPDATE OF p
        `, [orderId, integration.tenant_id, integration.store_id]);
        const payment = rows[0];
        if (!payment) throw new HttpError(404, 'payment_not_found', 'Pagamento não encontrado.');
        if (mpPayment.external_reference !== payment.public_number && mpPayment.external_reference !== payment.order_id) {
          throw new HttpError(409, 'payment_reference_mismatch', 'O pagamento não pertence a este pedido.');
        }
        const receivedCents = Math.round(Number(mpPayment.transaction_amount) * 100);
        if (receivedCents !== payment.amount_cents || mpPayment.currency_id !== payment.currency) {
          throw new HttpError(409, 'payment_amount_mismatch', 'O valor confirmado pelo Mercado Pago não corresponde ao total do pedido.');
        }
        const receipt = {
          public_number: payment.public_number,
          amount_cents: payment.amount_cents,
          currency: payment.currency,
        };
        if (payment.status === 'PAID') return { ...receipt, status: payment.status, applied: false, reason: 'already_paid' };

        const statusMap: Record<string, PaymentStatus> = {
          approved: 'PAID', authorized: 'AUTHORIZED', pending: 'PENDING', in_process: 'PENDING',
          rejected: 'FAILED', cancelled: 'CANCELLED', refunded: 'REFUNDED',
          charged_back: 'CHARGEBACK', expired: 'EXPIRED',
        };
        const normalizedStatus = statusMap[mpPayment.status] ?? 'PENDING';
        await tx.query(
          `UPDATE payments SET provider_reference = $1, provider = 'mercado_pago', updated_at = now()
           WHERE id = $2 AND tenant_id = $3`,
          [String(mpPayment.id), payment.payment_id, payment.tenant_id],
        );
        const applied = await applyPaymentEvent(
          tx, payment.tenant_id, payment, normalizedStatus, mpPayment.status,
          `reconcile-${mpPayment.id}-${mpPayment.date_last_updated ?? mpPayment.date_approved ?? 'current'}`,
          { source: 'checkout_return', payment: {
            id: String(mpPayment.id), status: mpPayment.status, status_detail: mpPayment.status_detail,
            external_reference: mpPayment.external_reference, transaction_amount: mpPayment.transaction_amount,
            currency_id: mpPayment.currency_id, date_approved: mpPayment.date_approved,
          } },
          new Date(mpPayment.date_last_updated ?? Date.now()),
        );
        return { ...receipt, status: normalizedStatus, ...applied };
      });
      if (result.status === 'PAID') {
        try {
          await dispatchOrderEvent(database, integration.tenant_id, orderId, 'order.paid');
        } catch (error) {
          console.error(JSON.stringify({ type: 'sales_engine_dispatch_failed', eventType: 'order.paid', reason: (error as Error).message }));
        }
      }
      return { ok: true, payment: result };
    },
  );
}
