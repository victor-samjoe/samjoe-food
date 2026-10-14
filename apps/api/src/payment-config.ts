import type { FastifyInstance } from 'fastify';
import type { Database, TransactionalDatabase } from './catalog.js';
import { resolveSession } from './auth.js';
import { HttpError } from './errors.js';

type StoreSlugParams = { storeSlug: string };
type OrderParams = { storeSlug: string; orderId: string };

type IntegrationRow = {
  id: string;
  access_token: string | null;
  public_key: string | null;
  is_active: boolean;
};

type OrderRow = {
  order_id: string;
  tenant_id: string;
  store_id: string;
  total_cents: number;
  currency: string;
  customer_email: string | null;
  payment_id: string;
  payment_status: string;
  checkout_url: string | null;
};

async function requireOperator(request: Parameters<typeof resolveSession>[0], database: Database) {
  const session = await resolveSession(request, database);
  if (!session) throw new HttpError(401, 'unauthorized', 'Sessão ausente ou expirada.');
  if (!['OWNER', 'ADMIN', 'OPERATOR'].includes(session.role)) {
    throw new HttpError(403, 'forbidden', 'Permissão insuficiente.');
  }
  return session;
}

async function createMpPreference(
  accessToken: string,
  orderId: string,
  totalCents: number,
  currency: string,
  customerEmail: string | null,
  webhookUrl: string,
): Promise<{ checkout_url: string; mp_id: string }> {
  const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': orderId,
    },
    body: JSON.stringify({
      items: [{
        id: orderId,
        title: `Pedido ${orderId.slice(0, 8).toUpperCase()}`,
        quantity: 1,
        unit_price: totalCents / 100,
        currency_id: currency,
      }],
      external_reference: orderId,
      notification_url: webhookUrl,
      ...(customerEmail ? { payer: { email: customerEmail } } : {}),
      back_urls: {
        success: `${process.env.APP_URL ?? 'http://localhost:3000'}/pedido-confirmado`,
        failure: `${process.env.APP_URL ?? 'http://localhost:3000'}/pagamento-falhou`,
        pending: `${process.env.APP_URL ?? 'http://localhost:3000'}/pedido-confirmado`,
      },
      auto_return: 'approved',
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new HttpError(502, 'mp_api_error', `Mercado Pago retornou ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json() as { id: string; init_point: string };
  return { checkout_url: data.init_point, mp_id: data.id };
}

export function registerPaymentConfigRoutes(app: FastifyInstance, database: TransactionalDatabase) {

  // ── Admin: GET payment config ─────────────────────────────────────────────
  app.get<{ Params: StoreSlugParams }>('/v1/admin/stores/:storeSlug/payment-config', async (request, reply) => {
    const session = await requireOperator(request, database);
    const { rows: storeRows } = await database.query<{ store_id: string }>(
      `SELECT id AS store_id FROM stores WHERE slug = $1 AND tenant_id = $2`,
      [request.params.storeSlug, session.tenant_id],
    );
    if (!storeRows[0]) return reply.status(404).send({ error: { code: 'store_not_found' } });

    const { rows } = await database.query<IntegrationRow>(
      `SELECT id, access_token, public_key, is_active
       FROM store_payment_integrations
       WHERE tenant_id = $1 AND store_id = $2 AND provider = 'mercado_pago'`,
      [session.tenant_id, storeRows[0].store_id],
    );
    const mp = rows[0];
    return {
      integrations: {
        mercado_pago: mp
          ? { has_access_token: !!mp.access_token, public_key: mp.public_key, is_active: mp.is_active }
          : { has_access_token: false, public_key: null, is_active: false },
      },
    };
  });

  // ── Admin: PUT Mercado Pago credentials ───────────────────────────────────
  app.put<{
    Params: StoreSlugParams;
    Body: { access_token?: string; public_key?: string; is_active?: boolean };
  }>('/v1/admin/stores/:storeSlug/payment-config/mercado-pago', {
    schema: {
      body: {
        type: 'object', additionalProperties: false,
        properties: {
          access_token: { type: 'string', maxLength: 600 },
          public_key:   { type: 'string', maxLength: 600 },
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

    const { rows } = await database.query<{ has_access_token: boolean; public_key: string | null; is_active: boolean }>(
      `INSERT INTO store_payment_integrations (${colList})
       VALUES (${valList})
       ON CONFLICT (tenant_id, store_id, provider) DO UPDATE SET ${updateSets}
       RETURNING access_token IS NOT NULL AS has_access_token, public_key, is_active`,
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
        SELECT o.id AS order_id, o.tenant_id, o.store_id,
          o.total_cents, o.currency,
          (o.customer_snapshot->>'email') AS customer_email,
          p.id AS payment_id, p.status AS payment_status, p.checkout_url
        FROM orders o
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

      const webhookUrl = `${process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/v1/public/webhooks/payment/mercado-pago`;
      const { checkout_url, mp_id } = await createMpPreference(
        integRows[0].access_token,
        order.order_id,
        order.total_cents,
        order.currency,
        order.customer_email,
        webhookUrl,
      );

      await database.query(
        `UPDATE payments SET checkout_url = $1, provider_reference = $2, provider = 'mercado_pago', status = 'PENDING', updated_at = now()
         WHERE id = $3 AND tenant_id = $4`,
        [checkout_url, mp_id, order.payment_id, tenant_id],
      );

      return { checkout_url, payment_id: order.payment_id };
    },
  );
}
