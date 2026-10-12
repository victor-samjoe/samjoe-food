import { createHash, createHmac, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Database, TransactionalDatabase } from './catalog.js';
import { HttpError } from './errors.js';
import { resolveDistance, postalCodeDistance } from './services/routing.js';

type Address = {
  street: string; number: string; complement?: string | null; district: string;
  city: string; state: string; postal_code: string; reference?: string | null;
};
type QuoteBody = { address: Address };
type OrderBody = {
  customer: { name: string; phone_e164: string; email?: string | null };
  fulfillment: 'DELIVERY' | 'PICKUP';
  address?: Address | null;
  delivery_quote_id?: string | null;
  items: Array<{ variant_id: string; quantity: number; notes?: string | null }>;
  payment_method: 'CASH' | 'PIX' | 'MERCADO_PAGO';
  notes?: string | null;
};
type StoreParams = { storeSlug: string };
type StoreRow = { tenant_id: string; store_id: string; currency: string };
type RuleRow = StoreRow & {
  rule_id: string; version: string; base_fee_cents: number; included_meters: number;
  price_per_extra_km_cents: number; standard_radius_meters: number;
  maximum_radius_meters: number; exception_fee_cents: number;
  store_postal_code: string | null;
  store_address: Record<string, string | null> | null;
};
type QuoteRow = { id: string; fee_cents: number; currency: string; status: string };
type VariantRow = {
  id: string; sku: string; name: string; attributes: Record<string, unknown>;
  price_cents: number; currency: string; inventory_policy: 'UNLIMITED' | 'TRACKED' | 'PREORDER';
};
type IdempotencyRow = { request_hash: string; response_body: Record<string, unknown>; resource_id: string };

/** @deprecated use resolveDistance from ./services/routing.js */
export function simulatedDistanceMeters(customerPostalCode: string, storePostalCode?: string | null): number {
  return postalCodeDistance(customerPostalCode, storePostalCode);
}

function deliveryFee(rule: RuleRow, distanceMeters: number): number {
  if (distanceMeters > rule.maximum_radius_meters) return 0;
  const variable = Math.round(Math.max(0, distanceMeters - rule.included_meters) * rule.price_per_extra_km_cents / 1_000);
  const exception = distanceMeters > rule.standard_radius_meters ? rule.exception_fee_cents : 0;
  return rule.base_fee_cents + variable + exception;
}

function trackingToken(orderId: string): string {
  const secret = process.env.TRACKING_TOKEN_SECRET ?? 'foodapp-local-tracking-only';
  return createHmac('sha256', secret).update(orderId).digest('base64url');
}

function orderResponse(order: Record<string, unknown>, orderId: string) {
  return { ...order, tracking_token: trackingToken(orderId) };
}

async function resolveStore(database: Database, slug: string): Promise<StoreRow> {
  const { rows } = await database.query<StoreRow>(`
    SELECT tenant_id, id AS store_id, currency FROM stores
    WHERE slug = $1 AND status = 'ACTIVE'
  `, [slug]);
  if (!rows[0]) throw new HttpError(404, 'store_not_found', 'Loja não encontrada.');
  return rows[0];
}

export function registerCheckoutRoutes(app: FastifyInstance, database: TransactionalDatabase) {
  app.post<{ Params: StoreParams; Body: QuoteBody }>('/v1/public/stores/:storeSlug/delivery-quotes', {
    schema: {
      body: {
        type: 'object', additionalProperties: false, required: ['address'],
        properties: { address: { $ref: 'address#' } },
      },
    },
  }, async (request) => {
    const { rows } = await database.query<RuleRow>(`
      SELECT s.tenant_id, s.id AS store_id, s.currency, r.id AS rule_id, r.version,
        r.base_fee_cents, r.included_meters, r.price_per_extra_km_cents,
        r.standard_radius_meters, r.maximum_radius_meters, r.exception_fee_cents,
        s.origin_address->>'postal_code' AS store_postal_code,
        s.origin_address AS store_address
      FROM stores s
      JOIN delivery_pricing_rules r ON r.tenant_id = s.tenant_id AND r.store_id = s.id AND r.is_active
      WHERE s.slug = $1 AND s.status = 'ACTIVE'
    `, [request.params.storeSlug]);
    const rule = rows[0];
    if (!rule) throw new HttpError(404, 'store_or_delivery_rule_not_found', 'Loja ou regra de entrega não encontrada.');

    const route = await resolveDistance({
      customerAddress: request.body.address,
      storeAddress: rule.store_address,
      storeCep: rule.store_postal_code,
      googleApiKey: process.env.GOOGLE_MAPS_API_KEY,
    });
    const distance = route.distanceMeters;
    const status = distance <= rule.maximum_radius_meters ? 'AVAILABLE' : 'OUTSIDE_AREA';
    const fee = deliveryFee(rule, distance);
    const quoteId = randomUUID();
    const durationSeconds = route.duration
      ? Math.round(Number(route.duration.replace('s', '')))
      : Math.ceil(distance / 8);
    await database.query(`
      INSERT INTO delivery_quotes (
        id, tenant_id, store_id, status, address_snapshot, distance_meters,
        duration_seconds, fee_cents, estimated_cost_cents, currency,
        rule_version, inputs, expires_at
      ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12::jsonb,now() + interval '15 minutes')
    `, [quoteId, rule.tenant_id, rule.store_id, status, JSON.stringify(request.body.address), distance,
      durationSeconds, fee, Math.round(distance / 1_000 * 150), rule.currency, rule.version,
      JSON.stringify({ source: route.source, distance_meters: distance })]);
    return {
      id: quoteId, status, fee: { amount_cents: fee, currency: rule.currency },
      distance_meters: distance, duration_seconds: durationSeconds,
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(), rule_version: rule.version,
    };
  });

  app.post<{ Params: StoreParams; Body: OrderBody; Headers: { 'idempotency-key'?: string } }>(
    '/v1/public/stores/:storeSlug/orders',
    { schema: { body: { type: 'object', additionalProperties: false, required: ['customer', 'fulfillment', 'items', 'payment_method'], properties: {
      customer: { type: 'object', additionalProperties: false, required: ['name', 'phone_e164'], properties: {
        name: { type: 'string', minLength: 1, maxLength: 160 }, phone_e164: { type: 'string', pattern: '^\\+[1-9][0-9]{7,14}$' }, email: { type: ['string', 'null'] },
      } },
      fulfillment: { enum: ['DELIVERY', 'PICKUP'] }, address: { anyOf: [{ $ref: 'address#' }, { type: 'null' }] },
      delivery_quote_id: { type: ['string', 'null'], format: 'uuid' }, items: { type: 'array', minItems: 1, maxItems: 100, items: {
        type: 'object', additionalProperties: false, required: ['variant_id', 'quantity'], properties: {
          variant_id: { type: 'string', format: 'uuid' }, quantity: { type: 'integer', minimum: 1, maximum: 100 }, notes: { type: ['string', 'null'], maxLength: 500 },
        },
      } }, payment_method: { enum: ['CASH', 'PIX', 'MERCADO_PAGO'] }, notes: { type: ['string', 'null'], maxLength: 1000 },
    } } } },
    async (request, reply) => {
      const key = request.headers['idempotency-key'];
      if (!key || key.length < 16 || key.length > 200) throw new HttpError(400, 'invalid_idempotency_key', 'Idempotency-Key deve ter entre 16 e 200 caracteres.');
      const requestHash = createHash('sha256').update(request.params.storeSlug + ':' + JSON.stringify(request.body)).digest('hex');
      const response = await database.transaction(async (tx) => createOrder(tx, request.params.storeSlug, key, requestHash, request.body));
      return reply.status(response.replayed ? 200 : 201).send(response.body);
    },
  );
}

async function createOrder(database: Database, storeSlug: string, key: string, requestHash: string, body: OrderBody) {
  const store = await resolveStore(database, storeSlug);
  const existing = await database.query<IdempotencyRow>(`
    SELECT request_hash, response_body, resource_id FROM idempotency_keys
    WHERE tenant_id=$1 AND scope='create_order' AND key=$2 AND expires_at > now()
    FOR UPDATE
  `, [store.tenant_id, key]);
  if (existing.rows[0]) {
    if (existing.rows[0].request_hash !== requestHash) throw new HttpError(409, 'idempotency_conflict', 'Chave idempotente reutilizada com conteúdo diferente.');
    return { replayed: true, body: orderResponse(existing.rows[0].response_body, existing.rows[0].resource_id) };
  }

  if (body.fulfillment === 'DELIVERY' && (!body.address || !body.delivery_quote_id)) {
    throw new HttpError(422, 'delivery_data_required', 'Endereço e cotação são obrigatórios para entrega.');
  }
  let deliveryFeeCents = 0;
  if (body.fulfillment === 'DELIVERY') {
    const quote = await database.query<QuoteRow>(`
      SELECT id, fee_cents, currency, status FROM delivery_quotes
      WHERE id=$1 AND tenant_id=$2 AND store_id=$3 AND expires_at > now()
      FOR UPDATE
    `, [body.delivery_quote_id, store.tenant_id, store.store_id]);
    if (!quote.rows[0] || quote.rows[0].status !== 'AVAILABLE') throw new HttpError(422, 'invalid_delivery_quote', 'Cotação ausente, expirada ou indisponível.');
    deliveryFeeCents = quote.rows[0].fee_cents;
  }

  const aggregated = new Map<string, { quantity: number; notes: string | null }>();
  for (const item of body.items) {
    const current = aggregated.get(item.variant_id) ?? { quantity: 0, notes: item.notes ?? null };
    current.quantity += item.quantity;
    if (current.quantity > 100) throw new HttpError(422, 'invalid_quantity', 'Quantidade agregada excede 100.');
    aggregated.set(item.variant_id, current);
  }
  const variantIds = [...aggregated.keys()];
  const variantsResult = await database.query<VariantRow>(`
    SELECT v.id, v.sku, v.name, v.attributes, v.price_cents, v.currency, v.inventory_policy
    FROM product_variants v JOIN products p ON p.tenant_id=v.tenant_id AND p.id=v.product_id
    WHERE v.tenant_id=$1 AND p.store_id=$2 AND v.id = ANY($3::uuid[]) AND v.is_active AND p.is_active
    FOR UPDATE OF v
  `, [store.tenant_id, store.store_id, variantIds]);
  if (variantsResult.rows.length !== variantIds.length) throw new HttpError(422, 'invalid_product', 'Produto inexistente ou indisponível.');
  const variants = new Map(variantsResult.rows.map((variant) => [variant.id, variant]));
  const subtotal = variantIds.reduce((total, id) => total + variants.get(id)!.price_cents * aggregated.get(id)!.quantity, 0);
  const orderId = randomUUID();
  const customerId = randomUUID();
  const customer = await database.query<{ id: string }>(`
    INSERT INTO customers (id, tenant_id, name, phone_e164, email)
    VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (tenant_id, phone_e164) DO UPDATE SET name=excluded.name, email=COALESCE(excluded.email, customers.email), updated_at=now()
    RETURNING id
  `, [customerId, store.tenant_id, body.customer.name, body.customer.phone_e164, body.customer.email ?? null]);
  const status = body.payment_method === 'CASH' ? 'NEW' : 'PAYMENT_PENDING';
  const publicNumber = `DEMO-${orderId.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
  const total = subtotal + deliveryFeeCents;
  await database.query(`
    INSERT INTO orders (id,tenant_id,store_id,customer_id,delivery_quote_id,public_number,tracking_token_hash,source,fulfillment,status,customer_snapshot,address_snapshot,subtotal_cents,delivery_fee_cents,total_cents,currency,notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,'WEB',$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14,$15,$16)
  `, [orderId, store.tenant_id, store.store_id, customer.rows[0]!.id, body.delivery_quote_id ?? null, publicNumber,
    createHash('sha256').update(trackingToken(orderId)).digest('hex'), body.fulfillment, status, JSON.stringify(body.customer),
    body.address ? JSON.stringify(body.address) : null, subtotal, deliveryFeeCents, total, store.currency, body.notes ?? null]);

  for (const variantId of variantIds) {
    const variant = variants.get(variantId)!;
    const item = aggregated.get(variantId)!;
    if (variant.inventory_policy === 'TRACKED') {
      const reserved = await database.query<{ variant_id: string }>(`
        UPDATE inventory_levels SET reserved=reserved+$1, version=version+1, updated_at=now()
        WHERE tenant_id=$2 AND variant_id=$3 AND on_hand-reserved >= $1
        RETURNING variant_id
      `, [item.quantity, store.tenant_id, variantId]);
      if (!reserved.rows[0]) throw new HttpError(409, 'insufficient_stock', `Estoque insuficiente para ${variant.sku}.`);
      await database.query(`
        INSERT INTO inventory_reservations (tenant_id,variant_id,order_id,quantity,status,expires_at)
        VALUES ($1,$2,$3,$4,'ACTIVE',now() + interval '15 minutes')
      `, [store.tenant_id, variantId, orderId, item.quantity]);
    }
    await database.query(`
      INSERT INTO order_items (tenant_id,order_id,variant_id,sku_snapshot,name_snapshot,attributes_snapshot,quantity,unit_price_cents,line_total_cents,notes)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)
    `, [store.tenant_id, orderId, variantId, variant.sku, variant.name, JSON.stringify(variant.attributes), item.quantity,
      variant.price_cents, variant.price_cents * item.quantity, item.notes]);
  }
  await database.query(`INSERT INTO order_status_events (tenant_id,order_id,to_status,actor_type) VALUES ($1,$2,$3,'CUSTOMER')`, [store.tenant_id, orderId, status]);
  await database.query(`INSERT INTO payments (tenant_id,order_id,provider,method,status,amount_cents,currency) VALUES ($1,$2,$3,$4,'CREATED',$5,$6)`,
    [store.tenant_id, orderId, body.payment_method === 'MERCADO_PAGO' ? 'fake_mercado_pago' : 'internal_simulator', body.payment_method, total, store.currency]);
  await database.query(`INSERT INTO integration_outbox (tenant_id,event_type,aggregate_type,aggregate_id,payload) VALUES ($1,'foodapp.order.created.v1','order',$2,$3::jsonb)`,
    [store.tenant_id, orderId, JSON.stringify({ order_id: orderId, public_number: publicNumber, status, currency: store.currency, total_cents: total })]);
  const storedResponse = { id: orderId, public_number: publicNumber, status, items: variantIds.map((id) => ({ variant_id: id, quantity: aggregated.get(id)!.quantity })),
    subtotal: { amount_cents: subtotal, currency: store.currency }, delivery_fee: { amount_cents: deliveryFeeCents, currency: store.currency }, total: { amount_cents: total, currency: store.currency } };
  await database.query(`INSERT INTO idempotency_keys (tenant_id,scope,key,request_hash,response_status,response_body,resource_id,expires_at) VALUES ($1,'create_order',$2,$3,201,$4::jsonb,$5,now()+interval '24 hours')`,
    [store.tenant_id, key, requestHash, JSON.stringify(storedResponse), orderId]);
  return { replayed: false, body: orderResponse(storedResponse, orderId) };
}

