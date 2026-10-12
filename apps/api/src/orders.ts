import type { FastifyInstance } from 'fastify';
import type { Database, TransactionalDatabase } from './catalog.js';
import { resolveSession } from './auth.js';
import { HttpError } from './errors.js';

type OrderIdParams = { orderId: string };
type StoreSlugParams = { storeSlug: string };

type OrderStatus =
  | 'PAYMENT_PENDING' | 'PAYMENT_FAILED' | 'NEW' | 'CONFIRMED'
  | 'IN_PREPARATION' | 'READY' | 'READY_FOR_PICKUP'
  | 'OUT_FOR_DELIVERY' | 'COMPLETED' | 'CANCELLED';

const allowedTransitions: Record<OrderStatus, readonly OrderStatus[]> = {
  PAYMENT_PENDING: ['NEW', 'PAYMENT_FAILED', 'CANCELLED'],
  PAYMENT_FAILED:  ['PAYMENT_PENDING', 'CANCELLED'],
  NEW:             ['CONFIRMED', 'CANCELLED'],
  CONFIRMED:       ['IN_PREPARATION', 'CANCELLED'],
  IN_PREPARATION:  ['READY', 'CANCELLED'],
  READY:           ['READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'],
  READY_FOR_PICKUP:['COMPLETED', 'CANCELLED'],
  OUT_FOR_DELIVERY:['COMPLETED', 'CANCELLED'],
  COMPLETED:       [],
  CANCELLED:       [],
};

type OrderSummaryRow = {
  order_id: string; public_number: string; status: OrderStatus;
  customer_name: string; total_cents: number; delivery_fee_cents: number; currency: string;
  fulfillment: string; placed_at: string;
  district: string | null; items_label: string | null;
};
type OrderDetailRow = OrderSummaryRow & {
  customer_id: string; phone_e164: string | null; email: string | null;
  notes: string | null; subtotal_cents: number; delivery_fee_cents: number;
  address_snapshot: Record<string, unknown> | null;
};
type OrderItemRow = {
  item_id: string; sku_snapshot: string; name_snapshot: string;
  quantity: number; unit_price_cents: number; line_total_cents: number; notes: string | null;
};
type StatusEventRow = { event_id: string; to_status: string; actor_type: string; actor_id: string | null; notes: string | null; occurred_at: string };

async function requireOperator(request: Parameters<typeof resolveSession>[0], database: Database) {
  const session = await resolveSession(request, database);
  if (!session) throw new HttpError(401, 'unauthorized', 'Sessão ausente ou expirada.');
  if (!['OWNER', 'ADMIN', 'OPERATOR'].includes(session.role)) {
    throw new HttpError(403, 'forbidden', 'Permissão insuficiente.');
  }
  return session;
}

export function registerOrderRoutes(app: FastifyInstance, database: TransactionalDatabase) {
  app.get<{ Params: StoreSlugParams; Querystring: { status?: string; limit?: number; offset?: number } }>(
    '/v1/admin/stores/:storeSlug/orders',
    {
      schema: {
        querystring: {
          type: 'object', additionalProperties: false,
          properties: {
            status: { type: 'string', maxLength: 30 },
            limit: { type: 'integer', minimum: 1, maximum: 500, default: 30 },
            offset: { type: 'integer', minimum: 0, default: 0 },
          },
        },
      },
    },
    async (request) => {
      const session = await requireOperator(request, database);
      const { status, limit = 30, offset = 0 } = request.query;
      const conditions = ['o.tenant_id = $1', 's.slug = $2'];
      const values: unknown[] = [session.tenant_id, request.params.storeSlug];
      if (status) { conditions.push(`o.status = $${values.push(status)}`); }
      values.push(limit, offset);
      const { rows } = await database.query<OrderSummaryRow & { total: number }>(`
        SELECT o.id AS order_id, o.public_number, o.status,
          o.customer_snapshot->>'name' AS customer_name,
          o.total_cents, o.delivery_fee_cents, o.currency, o.fulfillment,
          o.placed_at::text,
          o.address_snapshot->>'district' AS district,
          (SELECT string_agg(oi.quantity::text || '× ' || oi.name_snapshot, ', ' ORDER BY oi.id)
           FROM order_items oi WHERE oi.order_id = o.id AND oi.tenant_id = o.tenant_id) AS items_label,
          COUNT(*) OVER () AS total
        FROM orders o
        JOIN stores s ON s.id = o.store_id AND s.tenant_id = o.tenant_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY o.placed_at DESC
        LIMIT $${values.length - 1} OFFSET $${values.length}
      `, values);
      return {
        orders: rows.map(({ total: _t, ...r }) => r),
        total: Number(rows[0]?.total ?? 0),
        limit, offset,
      };
    },
  );

  app.get<{ Params: OrderIdParams }>(
    '/v1/admin/orders/:orderId',
    async (request, reply) => {
      const session = await requireOperator(request, database);
      const { rows: orderRows } = await database.query<OrderDetailRow>(`
        SELECT o.id AS order_id, o.public_number, o.status, o.fulfillment, o.notes,
          o.customer_snapshot->>'name' AS customer_name,
          c.id AS customer_id, c.phone_e164, c.email,
          o.total_cents, o.subtotal_cents, o.delivery_fee_cents, o.currency,
          o.address_snapshot,
          o.placed_at::text
        FROM orders o
        JOIN customers c ON c.id = o.customer_id AND c.tenant_id = o.tenant_id
        WHERE o.id = $1 AND o.tenant_id = $2
      `, [request.params.orderId, session.tenant_id]);
      if (!orderRows[0]) return reply.status(404).send({ error: { code: 'order_not_found', message: 'Pedido não encontrado.', request_id: request.id } });

      const [itemRows, eventRows] = await Promise.all([
        database.query<OrderItemRow>(`
          SELECT id AS item_id, sku_snapshot, name_snapshot, quantity,
            unit_price_cents, line_total_cents, notes
          FROM order_items WHERE order_id = $1 AND tenant_id = $2 ORDER BY id
        `, [request.params.orderId, session.tenant_id]),
        database.query<StatusEventRow>(`
          SELECT id AS event_id, to_status, actor_type, actor_id::text, reason AS notes, occurred_at::text
          FROM order_status_events WHERE order_id = $1 AND tenant_id = $2 ORDER BY occurred_at
        `, [request.params.orderId, session.tenant_id]),
      ]);

      const order = orderRows[0];
      return {
        order: {
          ...order,
          next_states: allowedTransitions[order.status as OrderStatus] ?? [],
        },
        items: itemRows.rows,
        status_history: eventRows.rows,
      };
    },
  );

  app.post<{ Params: OrderIdParams; Body: { to: string; notes?: string | null; actor_id?: string | null } }>(
    '/v1/admin/orders/:orderId/transitions',
    {
      schema: {
        body: {
          type: 'object', additionalProperties: false, required: ['to'],
          properties: {
            to: { type: 'string', minLength: 1, maxLength: 30 },
            notes: { type: ['string', 'null'], maxLength: 500 },
            actor_id: { type: ['string', 'null'] },
          },
        },
      },
    },
    async (request) => {
      const session = await requireOperator(request, database);
      const { to, notes = null, actor_id = null } = request.body;

      return database.transaction(async (tx) => {
        const { rows } = await tx.query<{ order_id: string; status: OrderStatus; tenant_id: string }>(
          `SELECT id AS order_id, status, tenant_id FROM orders WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
          [request.params.orderId, session.tenant_id],
        );
        const order = rows[0];
        if (!order) throw new HttpError(404, 'order_not_found', 'Pedido não encontrado.');

        const allowed = allowedTransitions[order.status] ?? [];
        if (!allowed.includes(to as OrderStatus)) {
          throw new HttpError(422, 'invalid_transition', `Transição ${order.status} → ${to} não permitida.`);
        }

        if (to === 'CANCELLED') {
          await releaseReservations(tx, session.tenant_id, request.params.orderId);
        }

        await tx.query(
          `UPDATE orders SET status = $1, updated_at = now() WHERE id = $2 AND tenant_id = $3`,
          [to, request.params.orderId, session.tenant_id],
        );
        await tx.query(
          `INSERT INTO order_status_events (tenant_id, order_id, from_status, to_status, actor_type, actor_id, reason)
           VALUES ($1, $2, $3, $4, 'USER', $5, $6)`,
          [session.tenant_id, request.params.orderId, order.status, to, actor_id ?? session.user_id, notes],
        );
        await tx.query(
          `INSERT INTO integration_outbox (tenant_id, event_type, aggregate_type, aggregate_id, payload)
           VALUES ($1, 'foodapp.order.status_changed.v1', 'order', $2, $3::jsonb)`,
          [session.tenant_id, request.params.orderId, JSON.stringify({ order_id: request.params.orderId, from_status: order.status, to_status: to })],
        );

        return { order_id: request.params.orderId, from_status: order.status, to_status: to };
      });
    },
  );
}

async function releaseReservations(database: Database, tenantId: string, orderId: string) {
  const { rows } = await database.query<{ variant_id: string; quantity: number }>(
    `UPDATE inventory_reservations SET status = 'RELEASED', updated_at = now()
     WHERE tenant_id = $1 AND order_id = $2 AND status = 'ACTIVE'
     RETURNING variant_id, quantity`,
    [tenantId, orderId],
  );
  for (const { variant_id, quantity } of rows) {
    await database.query(
      `UPDATE inventory_levels SET reserved = GREATEST(0, reserved - $1), version = version + 1, updated_at = now()
       WHERE tenant_id = $2 AND variant_id = $3`,
      [quantity, tenantId, variant_id],
    );
  }
}
