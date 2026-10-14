import type { FastifyInstance } from 'fastify';
import type { QueryResultRow } from 'pg';

export type Database = {
  query<T extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<{ rows: T[] }>;
};

export type TransactionalDatabase = Database & {
  transaction<T>(operation: (database: Database) => Promise<T>): Promise<T>;
};

type BusinessHoursDay = { open: boolean; from: string | null; to: string | null };

function computeOpenNow(isOpen: boolean, businessHours: Record<string, BusinessHoursDay> | null, timezone: string): boolean {
  if (!isOpen) return false;
  if (!businessHours || Object.keys(businessHours).length === 0) return true;
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false });
  const parts = fmt.formatToParts(now);
  const weekday = parts.find(p => p.type === 'weekday')?.value?.toLowerCase();
  const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10) % 24;
  const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
  if (!weekday) return true;
  const currentMinutes = h * 60 + m;
  const day = businessHours[weekday];
  if (!day?.open || !day.from || !day.to) return false;
  const [fh, fm] = day.from.split(':').map(Number);
  const [th, tm] = day.to.split(':').map(Number);
  return currentMinutes >= (fh ?? 0) * 60 + (fm ?? 0) && currentMinutes <= (th ?? 0) * 60 + (tm ?? 0);
}

type CatalogRow = {
  tenant_id: string;
  store_id: string;
  store_name: string;
  store_slug: string;
  timezone: string;
  category_id: string | null;
  category_name: string | null;
  category_slug: string | null;
  category_sort_order: number | null;
  product_id: string | null;
  product_name: string | null;
  description: string | null;
  cover_image_url: string | null;
  variant_id: string | null;
  sku: string | null;
  variant_name: string | null;
  price_cents: number | null;
  currency: string | null;
  inventory_policy: string | null;
  preorder_limit: number | null;
  stock_available: number | null;
  storefront_config: Record<string, unknown> | null;
  delivery_status: 'PENDING' | 'ACTIVE';
  is_open: boolean;
  is_open_reason: string | null;
  business_hours: Record<string, BusinessHoursDay> | null;
  scheduled_delivery_enabled: boolean | null;
  pickup_in_person_enabled: boolean | null;
  pickup_by_app_enabled: boolean | null;
  pickup_scheduling_enabled: boolean | null;
  cash_enabled: boolean | null;
  card_on_site_enabled: boolean | null;
  pix_enabled: boolean | null;
  mercado_pago_enabled: boolean | null;
};

type StoreParams = { storeSlug: string };
type StorePhoneQuery = { storeSlug: string; phone: string };

function isVariantAvailable(row: CatalogRow): boolean {
  if (!row.inventory_policy) return true;
  if (row.inventory_policy === 'TRACKED') return (row.stock_available ?? 0) > 0;
  if (row.inventory_policy === 'PREORDER') return (row.preorder_limit ?? 0) > 0;
  return true;
}

export function registerCatalogRoutes(app: FastifyInstance, pool: Database) {
  app.get<{ Params: { hostname: string } }>('/v1/public/domains/:hostname', async (request, reply) => {
    const hostname = request.params.hostname.toLowerCase().replace(/:\d+$/, '');
    const { rows } = await pool.query<{ store_slug: string }>(`
      SELECT store.slug AS store_slug
      FROM store_domains domain
      JOIN stores store ON store.id=domain.store_id AND store.tenant_id=domain.tenant_id
      WHERE lower(domain.hostname)=lower($1) AND domain.status='VERIFIED'
        AND store.status='ACTIVE'
      LIMIT 1
    `, [hostname]);
    if (!rows[0]) return reply.status(404).send({
      error: { code: 'domain_not_found', message: 'Domínio não vinculado a uma loja ativa.', request_id: request.id },
    });
    return { store_slug: rows[0].store_slug };
  });

  app.get<{ Params: StoreParams }>('/v1/public/stores/:storeSlug/catalog', async (request, reply) => {
    const { rows } = await pool.query<CatalogRow>(`
      SELECT
        s.tenant_id,
        s.id AS store_id,
        s.name AS store_name,
        s.slug AS store_slug,
        s.timezone,
        s.storefront_config,
        s.delivery_status,
        COALESCE(s.is_open, true) AS is_open,
        s.is_open_reason,
        s.business_hours,
        s.scheduled_delivery_enabled,
        s.pickup_in_person_enabled,
        s.pickup_by_app_enabled,
        s.pickup_scheduling_enabled,
        s.cash_enabled,
        s.card_on_site_enabled,
        s.pix_enabled,
        s.mercado_pago_enabled,
        c.id AS category_id,
        c.name AS category_name,
        c.slug AS category_slug,
        c.sort_order AS category_sort_order,
        p.id AS product_id,
        p.name AS product_name,
        p.description,
        p.cover_image_url,
        v.id AS variant_id,
        v.sku,
        v.name AS variant_name,
        v.price_cents,
        v.currency,
        v.inventory_policy,
        v.preorder_limit,
        COALESCE(il.on_hand, 0) - COALESCE(il.reserved, 0) AS stock_available
      FROM stores s
      LEFT JOIN products p
        ON p.tenant_id = s.tenant_id
       AND p.store_id = s.id
       AND p.is_active = true
       AND p.is_archived = false
      LEFT JOIN categories c
        ON c.tenant_id = p.tenant_id
       AND c.id = p.category_id
      LEFT JOIN product_variants v
        ON v.tenant_id = p.tenant_id
       AND v.product_id = p.id
       AND v.is_active = true
      LEFT JOIN inventory_levels il
        ON il.tenant_id = v.tenant_id
       AND il.variant_id = v.id
      WHERE s.slug = $1
        AND s.status = 'ACTIVE'
      ORDER BY COALESCE(c.sort_order, 999), COALESCE(c.id::text, ''), p.name, v.name
    `, [request.params.storeSlug]);

    const first = rows[0];
    if (!first) {
      return reply.status(404).send({
        error: { code: 'store_not_found', message: 'Loja não encontrada.', request_id: request.id },
      });
    }

    type ProductEntry = {
      id: string; name: string; description: string | null; image_url: string | null;
      variants: Array<{ id: string; sku: string; name: string; price: { amount_cents: number; currency: string }; available: boolean }>;
    };
    type CategoryEntry = { id: string | null; name: string | null; slug: string | null; products: Map<string, ProductEntry> };

    const categoryOrder: string[] = [];
    const categories = new Map<string, CategoryEntry>();

    for (const row of rows) {
      if (!row.product_id || !row.product_name) continue;
      const catKey = row.category_id ?? '__uncategorized__';
      if (!categories.has(catKey)) {
        categoryOrder.push(catKey);
        categories.set(catKey, { id: row.category_id, name: row.category_name, slug: row.category_slug, products: new Map() });
      }
      const cat = categories.get(catKey)!;
      if (!cat.products.has(row.product_id)) {
        cat.products.set(row.product_id, { id: row.product_id, name: row.product_name, description: row.description, image_url: row.cover_image_url ?? null, variants: [] });
      }
      const product = cat.products.get(row.product_id)!;
      if (row.variant_id && row.sku && row.variant_name && row.price_cents !== null && row.currency) {
        product.variants.push({
          id: row.variant_id, sku: row.sku, name: row.variant_name,
          price: { amount_cents: row.price_cents, currency: row.currency },
          available: isVariantAvailable(row),
        });
      }
    }

    const open_now = computeOpenNow(first.is_open, first.business_hours, first.timezone);
    return {
      store: {
        name: first.store_name, slug: first.store_slug, timezone: first.timezone,
        storefront: first.storefront_config ?? {},
        delivery_enabled: first.delivery_status === 'ACTIVE',
        is_open: first.is_open, open_now,
        reason_closed: !open_now ? (first.is_open_reason ?? null) : null,
        fulfillment_config: {
          delivery_enabled: first.delivery_status === 'ACTIVE',
          scheduled_delivery_enabled: first.scheduled_delivery_enabled ?? false,
          pickup_in_person_enabled: first.pickup_in_person_enabled ?? true,
          pickup_by_app_enabled: first.pickup_by_app_enabled ?? false,
          pickup_scheduling_enabled: first.pickup_scheduling_enabled ?? false,
        },
        payment_config: {
          cash_enabled: first.cash_enabled ?? true,
          card_on_site_enabled: first.card_on_site_enabled ?? false,
          pix_enabled: first.pix_enabled ?? true,
          mercado_pago_enabled: first.mercado_pago_enabled ?? false,
        },
      },
      categories: categoryOrder.map(key => {
        const cat = categories.get(key)!;
        return { id: cat.id, name: cat.name, slug: cat.slug, products: [...cat.products.values()] };
      }),
      version: 'v1',
    };
  });

  app.get<{ Params: StoreParams }>('/v1/public/stores/:storeSlug/status', async (request, reply) => {
    const { rows } = await pool.query<{ is_open: boolean; is_open_reason: string | null; business_hours: Record<string, BusinessHoursDay> | null; timezone: string }>(
      `SELECT COALESCE(is_open, true) AS is_open, is_open_reason, business_hours, timezone FROM stores WHERE slug = $1 AND status = 'ACTIVE'`,
      [request.params.storeSlug],
    );
    if (!rows[0]) return reply.status(404).send({ error: { code: 'store_not_found', message: 'Loja não encontrada.', request_id: request.id } });
    const { is_open, is_open_reason, business_hours, timezone } = rows[0];
    const open_now = computeOpenNow(is_open, business_hours, timezone);
    return { open_now, is_open, reason_closed: !open_now ? (is_open_reason ?? null) : null, business_hours: business_hours ?? null, timezone };
  });

  // Public: look up a customer by phone number for checkout pre-fill
  app.get<{ Params: StoreParams; Querystring: { phone: string } }>(
    '/v1/public/stores/:storeSlug/customers/lookup',
    {
      schema: {
        querystring: {
          type: 'object', required: ['phone'],
          properties: { phone: { type: 'string', pattern: '^\\+[1-9][0-9]{7,14}$' } },
        },
      },
    },
    async (request, reply) => {
      const { rows: storeRows } = await pool.query<{ tenant_id: string; store_id: string }>(
        `SELECT tenant_id, id AS store_id FROM stores WHERE slug = $1 AND status = 'ACTIVE'`,
        [request.params.storeSlug],
      );
      if (!storeRows[0]) return reply.status(404).send({ error: { code: 'store_not_found' } });
      const { tenant_id } = storeRows[0];

      const { rows } = await pool.query<{
        customer_id: string; name: string;
        address: Record<string, unknown> | null;
      }>(`
        SELECT c.id AS customer_id, c.name,
          (SELECT ca.address FROM customer_addresses ca
           WHERE ca.customer_id = c.id AND ca.tenant_id = c.tenant_id AND ca.is_active = true
           ORDER BY ca.is_primary DESC, ca.updated_at DESC LIMIT 1) AS address
        FROM customers c
        WHERE c.tenant_id = $1 AND c.phone_e164 = $2 AND c.status = 'ACTIVE'
      `, [tenant_id, request.query.phone]);

      if (!rows[0]) return { found: false };
      return { found: true, name: rows[0].name, address: rows[0].address ?? null };
    },
  );

  // Public: product suggestions — top products globally or for a returning customer
  app.get<{ Params: StoreParams; Querystring: { phone?: string; limit?: number } }>(
    '/v1/public/stores/:storeSlug/suggestions',
    {
      schema: {
        querystring: {
          type: 'object', additionalProperties: false,
          properties: {
            phone: { type: 'string', pattern: '^\\+[1-9][0-9]{7,14}$' },
            limit: { type: 'integer', minimum: 1, maximum: 12, default: 6 },
          },
        },
      },
    },
    async (request, reply) => {
      const { rows: storeRows } = await pool.query<{ tenant_id: string; store_id: string }>(
        `SELECT tenant_id, id AS store_id FROM stores WHERE slug = $1 AND status = 'ACTIVE'`,
        [request.params.storeSlug],
      );
      if (!storeRows[0]) return reply.status(404).send({ error: { code: 'store_not_found' } });
      const { tenant_id, store_id } = storeRows[0];
      const limit = request.query.limit ?? 6;

      type SuggestionRow = { product_id: string; product_name: string; description: string | null; image_url: string | null; variant_id: string; price_cents: number; currency: string; order_count: number };

      let rows: SuggestionRow[];

      if (request.query.phone) {
        // Returning customer: their own most ordered products
        const result = await pool.query<SuggestionRow>(`
          SELECT p.id AS product_id, p.name AS product_name, p.description, p.cover_image_url AS image_url,
            v.id AS variant_id, v.price_cents, v.currency,
            COUNT(oi.id)::int AS order_count
          FROM customers c
          JOIN orders o ON o.customer_id = c.id AND o.tenant_id = c.tenant_id
          JOIN order_items oi ON oi.order_id = o.id AND oi.tenant_id = o.tenant_id
          JOIN product_variants v ON v.id = oi.variant_id AND v.tenant_id = oi.tenant_id
          JOIN products p ON p.id = v.product_id AND p.tenant_id = v.tenant_id AND p.is_active = true AND p.is_archived = false
          WHERE c.tenant_id = $1 AND c.phone_e164 = $2 AND o.store_id = $3
            AND o.status NOT IN ('CANCELLED', 'REFUNDED')
          GROUP BY p.id, p.name, p.description, p.cover_image_url, v.id, v.price_cents, v.currency
          ORDER BY order_count DESC, p.name
          LIMIT $4
        `, [tenant_id, request.query.phone, store_id, limit]);
        rows = result.rows;
      } else {
        rows = [];
      }

      // If no personal history or new customer: fall back to store-wide top products
      if (rows.length < limit) {
        const excludeIds = rows.map(r => r.product_id);
        const remaining = limit - rows.length;
        const placeholders = excludeIds.map((_, i) => `$${i + 3}`).join(',');
        const excludeClause = excludeIds.length > 0 ? `AND p.id NOT IN (${placeholders})` : '';
        const result = await pool.query<SuggestionRow>(`
          SELECT p.id AS product_id, p.name AS product_name, p.description, p.cover_image_url AS image_url,
            v.id AS variant_id, v.price_cents, v.currency,
            COUNT(oi.id)::int AS order_count
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id AND o.tenant_id = oi.tenant_id
          JOIN product_variants v ON v.id = oi.variant_id AND v.tenant_id = oi.tenant_id
          JOIN products p ON p.id = v.product_id AND p.tenant_id = v.tenant_id AND p.is_active = true AND p.is_archived = false
          WHERE oi.tenant_id = $1 AND o.store_id = $2
            AND o.status NOT IN ('CANCELLED', 'REFUNDED')
            ${excludeClause}
          GROUP BY p.id, p.name, p.description, p.cover_image_url, v.id, v.price_cents, v.currency
          ORDER BY order_count DESC, p.name
          LIMIT $${excludeIds.length + 3}
        `, [tenant_id, store_id, ...excludeIds, remaining]);
        rows.push(...result.rows);
      }

      return {
        personalized: !!request.query.phone && rows.some(r => r.order_count > 0),
        suggestions: rows.map(r => ({
          product_id: r.product_id,
          product_name: r.product_name,
          description: r.description,
          image_url: r.image_url,
          variant_id: r.variant_id,
          price_cents: r.price_cents,
          currency: r.currency,
          order_count: r.order_count,
        })),
      };
    },
  );
}

