import type { FastifyInstance } from 'fastify';
import type { Database, TransactionalDatabase } from './catalog.js';
import { resolveSession } from './auth.js';
import { HttpError } from './errors.js';

type StoreSlugParams = { storeSlug: string };
type ProductIdParams = { productId: string };
type VariantIdParams = { variantId: string };

type AdminProductRow = {
  product_id: string;
  product_name: string;
  description: string | null;
  is_active: boolean;
  is_archived: boolean;
  cover_image_url: string | null;
  category_id: string | null;
  category_name: string | null;
  variant_id: string | null;
  sku: string | null;
  variant_name: string | null;
  price_cents: number | null;
  currency: string | null;
  inventory_policy: string | null;
  variant_active: boolean | null;
  legacy_id: string | null;
};

type StoreRow = {
  store_id: string; store_slug: string; store_name: string; currency: string;
  timezone?: string; status?: string; origin_address?: Record<string, unknown> | null;
  storefront_config?: Record<string, unknown>;
};
type DeliveryPricingRow = {
  id: string; version: string; base_fee_cents: number; included_meters: number;
  price_per_extra_km_cents: number; standard_radius_meters: number;
  maximum_radius_meters: number; exception_fee_cents: number; is_active: boolean;
};

async function requireOperator(request: Parameters<typeof resolveSession>[0], database: Database) {
  const session = await resolveSession(request, database);
  if (!session) throw new HttpError(401, 'unauthorized', 'Sessão ausente ou expirada.');
  if (!['OWNER', 'ADMIN', 'OPERATOR'].includes(session.role)) {
    throw new HttpError(403, 'forbidden', 'Permissão insuficiente.');
  }
  return session;
}

export function registerCatalogAdminRoutes(app: FastifyInstance, database: TransactionalDatabase) {
  app.get('/v1/admin/stores', async (request, reply) => {
    const session = await requireOperator(request, database);
    const { rows } = await database.query<StoreRow>(`
      SELECT id AS store_id, slug AS store_slug, name AS store_name, currency
      FROM stores WHERE tenant_id = $1 AND status = 'ACTIVE' ORDER BY name
    `, [session.tenant_id]);
    return { stores: rows };
  });

  app.get<{ Params: StoreSlugParams }>('/v1/admin/stores/:storeSlug', async (request) => {
    const session = await requireOperator(request, database);
    const { rows } = await database.query<StoreRow>(`
      SELECT id AS store_id,slug AS store_slug,name AS store_name,currency,timezone,status,origin_address,storefront_config
      FROM stores WHERE slug=$1 AND tenant_id=$2
    `, [request.params.storeSlug, session.tenant_id]);
    if (!rows[0]) throw new HttpError(404, 'store_not_found', 'Loja não encontrada.');
    return { store: rows[0] };
  });

  app.patch<{ Params: StoreSlugParams; Body: {
    name?: string; timezone?: string; currency?: string; status?: 'ACTIVE' | 'INACTIVE';
    origin_address?: Record<string, unknown> | null;
    storefront_config?: Record<string, unknown>;
  } }>('/v1/admin/stores/:storeSlug', {
    schema: { body: { type: 'object', additionalProperties: false, minProperties: 1, properties: {
      name: { type: 'string', minLength: 1, maxLength: 160 },
      timezone: { type: 'string', minLength: 1, maxLength: 80 },
      currency: { type: 'string', pattern: '^[A-Z]{3}$' },
      status: { enum: ['ACTIVE','INACTIVE'] },
      origin_address: { anyOf: [{ $ref: 'address#' }, { type: 'null' }] },
      storefront_config: { type: 'object', additionalProperties: false, properties: {
        brand_subtitle: { type: 'string', maxLength: 120 },
        hero_eyebrow: { type: 'string', maxLength: 120 },
        hero_title: { type: 'string', maxLength: 180 },
        hero_description: { type: 'string', maxLength: 500 },
        primary_color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
        accent_color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
        background_color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
        header_background_color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
        hero_image_enabled: { type: 'boolean' },
        hero_image_url: { type: ['string','null'], maxLength: 1500000 },
        hero_image_size: { enum: ['SMALL','MEDIUM','LARGE'] },
        hero_display_mode: { enum: ['CORNER','FULLSCREEN','FLAME','CAROUSEL'] },
        hero_images: { type: 'array', maxItems: 5, items: { type: 'string', maxLength: 750000 } },
        hero_section_size: { enum: ['COMPACT','NORMAL','TALL'] },
        hero_image_fit: { enum: ['FILL','FIT'] },
        hero_image_scale: { type: 'number', minimum: 1, maximum: 2 },
        hero_image_position_x: { type: 'integer', minimum: 0, maximum: 100 },
        hero_image_position_y: { type: 'integer', minimum: 0, maximum: 100 },
        hero_bg_type: { enum: ['GRADIENT','COLOR','IMAGE'] },
        hero_bg_color: { type: ['string','null'], pattern: '^#[0-9a-fA-F]{6}$' },
        hero_bg_image_url: { type: ['string','null'], maxLength: 750000 },
        hero_bg_image_scale: { type: 'number', minimum: 1, maximum: 2 },
        hero_bg_position_x: { type: 'integer', minimum: 0, maximum: 100 },
        hero_bg_position_y: { type: 'integer', minimum: 0, maximum: 100 },
        logo_url: { type: ['string','null'], maxLength: 750000 },
        font_family: { enum: ['CLASSIC','MODERN','ROUNDED'] },
        text_case: { enum: ['AS_TYPED','UPPERCASE'] },
      } },
    } } },
  }, async (request) => {
    const session = await requireOperator(request, database);
    const sets: string[] = [];
    const values: unknown[] = [request.params.storeSlug, session.tenant_id];
    if (request.body.name !== undefined) sets.push(`name=$${values.push(request.body.name)}`);
    if (request.body.timezone !== undefined) sets.push(`timezone=$${values.push(request.body.timezone)}`);
    if (request.body.currency !== undefined) sets.push(`currency=$${values.push(request.body.currency)}`);
    if (request.body.status !== undefined) sets.push(`status=$${values.push(request.body.status)}`);
    if (request.body.origin_address !== undefined) sets.push(`origin_address=$${values.push(JSON.stringify(request.body.origin_address))}::jsonb`);
    if (request.body.storefront_config !== undefined) sets.push(`storefront_config=$${values.push(JSON.stringify(request.body.storefront_config))}::jsonb`);
    sets.push('updated_at=now()');
    const { rows } = await database.query<StoreRow>(`
      UPDATE stores SET ${sets.join(',')} WHERE slug=$1 AND tenant_id=$2
      RETURNING id AS store_id,slug AS store_slug,name AS store_name,currency,timezone,status,origin_address,storefront_config
    `, values);
    if (!rows[0]) throw new HttpError(404, 'store_not_found', 'Loja não encontrada.');
    return { store: rows[0] };
  });

  app.get<{ Params: StoreSlugParams }>('/v1/admin/stores/:storeSlug/delivery-pricing', async (request) => {
    const session = await requireOperator(request, database);
    const { rows } = await database.query<DeliveryPricingRow>(`
      SELECT r.id,r.version,r.base_fee_cents,r.included_meters,r.price_per_extra_km_cents,
        r.standard_radius_meters,r.maximum_radius_meters,r.exception_fee_cents,r.is_active
      FROM delivery_pricing_rules r
      JOIN stores s ON s.id=r.store_id AND s.tenant_id=r.tenant_id
      WHERE s.slug=$1 AND r.tenant_id=$2 AND r.is_active
    `, [request.params.storeSlug, session.tenant_id]);
    if (!rows[0]) throw new HttpError(404, 'delivery_pricing_not_found', 'Regra de frete não encontrada.');
    return { pricing: rows[0] };
  });

  app.patch<{ Params: StoreSlugParams; Body: {
    base_fee_cents: number; included_meters: number; price_per_extra_km_cents: number;
    standard_radius_meters: number; maximum_radius_meters: number; exception_fee_cents: number;
  } }>('/v1/admin/stores/:storeSlug/delivery-pricing', {
    schema: { body: { type: 'object', additionalProperties: false, required: [
      'base_fee_cents','included_meters','price_per_extra_km_cents',
      'standard_radius_meters','maximum_radius_meters','exception_fee_cents',
    ], properties: {
      base_fee_cents: { type: 'integer', minimum: 0 }, included_meters: { type: 'integer', minimum: 0 },
      price_per_extra_km_cents: { type: 'integer', minimum: 0 }, standard_radius_meters: { type: 'integer', minimum: 0 },
      maximum_radius_meters: { type: 'integer', minimum: 0 }, exception_fee_cents: { type: 'integer', minimum: 0 },
    } } },
  }, async (request) => {
    const session = await requireOperator(request, database);
    if (request.body.standard_radius_meters < request.body.included_meters) {
      throw new HttpError(422, 'invalid_delivery_pricing', 'O raio padrão deve ser maior ou igual à distância incluída.');
    }
    if (request.body.maximum_radius_meters < request.body.standard_radius_meters) {
      throw new HttpError(422, 'invalid_delivery_pricing', 'O raio máximo deve ser maior ou igual ao raio padrão.');
    }
    return database.transaction(async tx => {
      const store = await tx.query<{ store_id: string }>(`
        SELECT id AS store_id FROM stores WHERE slug=$1 AND tenant_id=$2 FOR UPDATE
      `, [request.params.storeSlug, session.tenant_id]);
      if (!store.rows[0]) throw new HttpError(404, 'store_not_found', 'Loja não encontrada.');
      await tx.query(`
        UPDATE delivery_pricing_rules SET is_active=false
        WHERE tenant_id=$1 AND store_id=$2 AND is_active
      `, [session.tenant_id, store.rows[0].store_id]);
      const version = `admin-${Date.now()}`;
      const { rows } = await tx.query<DeliveryPricingRow>(`
        INSERT INTO delivery_pricing_rules (
          tenant_id,store_id,version,base_fee_cents,included_meters,price_per_extra_km_cents,
          standard_radius_meters,maximum_radius_meters,exception_fee_cents,is_active
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
        RETURNING id,version,base_fee_cents,included_meters,price_per_extra_km_cents,
          standard_radius_meters,maximum_radius_meters,exception_fee_cents,is_active
      `, [session.tenant_id, store.rows[0].store_id, version, request.body.base_fee_cents,
        request.body.included_meters, request.body.price_per_extra_km_cents,
        request.body.standard_radius_meters, request.body.maximum_radius_meters,
        request.body.exception_fee_cents]);
      return { pricing: rows[0] };
    });
  });

  app.get<{ Params: StoreSlugParams; Querystring: { include_archived?: string } }>('/v1/admin/stores/:storeSlug/products', async (request, reply) => {
    const session = await requireOperator(request, database);
    const { rows } = await database.query<AdminProductRow>(`
      SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.description,
        p.is_active,
        p.is_archived,
        p.cover_image_url,
        c.id AS category_id,
        c.name AS category_name,
        v.id AS variant_id,
        v.sku,
        v.name AS variant_name,
        v.price_cents,
        v.currency,
        v.inventory_policy,
        v.is_active AS variant_active,
        ei.external_id AS legacy_id
      FROM stores s
      JOIN products p ON p.tenant_id = s.tenant_id AND p.store_id = s.id
      LEFT JOIN categories c ON c.tenant_id = p.tenant_id AND c.id = p.category_id
      LEFT JOIN product_variants v ON v.tenant_id = p.tenant_id AND v.product_id = p.id
      LEFT JOIN external_identifiers ei
        ON ei.tenant_id = p.tenant_id
       AND ei.entity_type = 'product'
       AND ei.entity_id = p.id
       AND ei.source = 'legacy-sheets'
      WHERE s.slug = $1 AND s.tenant_id = $2
        AND (p.is_archived = false OR $3::boolean)
      ORDER BY p.name, v.name
    `, [request.params.storeSlug, session.tenant_id, request.query.include_archived === 'true']);

    if (rows.length === 0) {
      const { rows: storeCheck } = await database.query(
        `SELECT 1 FROM stores WHERE slug = $1 AND tenant_id = $2 AND status = 'ACTIVE'`,
        [request.params.storeSlug, session.tenant_id],
      );
      if (!storeCheck[0]) throw new HttpError(404, 'store_not_found', 'Loja não encontrada.');
    }

    type ProductEntry = {
      id: string; name: string; description: string | null; is_active: boolean; is_archived: boolean;
      cover_image_url: string | null;
      category: { id: string | null; name: string | null } | null; legacy_id: string | null;
      variants: Array<{ id: string; sku: string; name: string; price_cents: number; currency: string; inventory_policy: string | null; is_active: boolean }>;
    };
    const products = new Map<string, ProductEntry>();
    for (const row of rows) {
      if (!products.has(row.product_id)) {
        products.set(row.product_id, {
          id: row.product_id, name: row.product_name, description: row.description,
          is_active: row.is_active,
          is_archived: row.is_archived,
          cover_image_url: row.cover_image_url ?? null,
          category: row.category_id ? { id: row.category_id, name: row.category_name } : null,
          legacy_id: row.legacy_id,
          variants: [],
        });
      }
      if (row.variant_id && row.sku && row.variant_name && row.price_cents !== null && row.currency) {
        products.get(row.product_id)!.variants.push({
          id: row.variant_id, sku: row.sku, name: row.variant_name,
          price_cents: row.price_cents, currency: row.currency,
          inventory_policy: row.inventory_policy,
          is_active: row.variant_active ?? false,
        });
      }
    }
    return { products: [...products.values()] };
  });

  app.post<{ Params: StoreSlugParams; Body: { name: string; description?: string | null; category_id?: string | null; price_cents: number; sku: string; cover_image_url?: string | null } }>(
    '/v1/admin/stores/:storeSlug/products',
    {
      schema: {
        body: {
          type: 'object', additionalProperties: false,
          required: ['name', 'price_cents', 'sku'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200 },
            description: { type: ['string', 'null'], maxLength: 1000 },
            category_id: { type: ['string', 'null'], format: 'uuid' },
            price_cents: { type: 'integer', minimum: 0 },
            sku: { type: 'string', minLength: 1, maxLength: 80 },
            cover_image_url: { type: ['string', 'null'], maxLength: 750000 },
          },
        },
      },
    },
    async (request, reply) => {
      const session = await requireOperator(request, database);
      const { name, description = null, category_id = null, price_cents, sku, cover_image_url = null } = request.body;

      return database.transaction(async (tx) => {
        const { rows: storeRows } = await tx.query<{ store_id: string; currency: string }>(
          `SELECT id AS store_id, currency FROM stores WHERE slug = $1 AND tenant_id = $2 AND status = 'ACTIVE'`,
          [request.params.storeSlug, session.tenant_id],
        );
        if (!storeRows[0]) throw new HttpError(404, 'store_not_found', 'Loja não encontrada.');
        const { store_id, currency } = storeRows[0];

        const { rows: productRows } = await tx.query<{ product_id: string }>(
          `INSERT INTO products (tenant_id, store_id, category_id, name, description, cover_image_url)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id AS product_id`,
          [session.tenant_id, store_id, category_id, name, description, cover_image_url],
        );
        const product_id = productRows[0]?.product_id;
        if (!product_id) throw new HttpError(500, 'internal_error', 'Erro ao criar produto.');

        const { rows: variantRows } = await tx.query<{ variant_id: string }>(
          `INSERT INTO product_variants (tenant_id, product_id, sku, name, price_cents, currency)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id AS variant_id`,
          [session.tenant_id, product_id, sku, name, price_cents, currency],
        );
        const variant_id = variantRows[0]?.variant_id;
        if (!variant_id) throw new HttpError(500, 'internal_error', 'Erro ao criar variante.');

        return reply.status(201).send({ product_id, variant_id });
      });
    },
  );

  app.patch<{ Params: ProductIdParams; Body: { name?: string; description?: string | null; is_active?: boolean; is_archived?: boolean; cover_image_url?: string | null } }>(
    '/v1/admin/products/:productId',
    {
      schema: {
        body: {
          type: 'object', additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200 },
            description: { type: ['string', 'null'], maxLength: 1000 },
            is_active: { type: 'boolean' },
            is_archived: { type: 'boolean' },
            cover_image_url: { type: ['string', 'null'], maxLength: 750000 },
          },
        },
      },
    },
    async (request, reply) => {
      const session = await requireOperator(request, database);
      const { name, description, is_active, is_archived, cover_image_url } = request.body;

      const sets: string[] = [];
      const values: unknown[] = [request.params.productId, session.tenant_id];
      if (name !== undefined) { sets.push(`name = $${values.push(name)}`); }
      if (description !== undefined) { sets.push(`description = $${values.push(description)}`); }
      if (is_active !== undefined) { sets.push(`is_active = $${values.push(is_active)}`); }
      if (is_archived !== undefined) {
        sets.push(`is_archived = $${values.push(is_archived)}`);
        if (is_archived && is_active === undefined) sets.push('is_active = false');
      }
      if (cover_image_url !== undefined) { sets.push(`cover_image_url = $${values.push(cover_image_url)}`); }
      if (sets.length === 0) throw new HttpError(400, 'no_fields', 'Nenhum campo para atualizar.');

      sets.push(`updated_at = now()`);
      const { rows } = await database.query<{ product_id: string }>(
        `UPDATE products SET ${sets.join(', ')} WHERE id = $1 AND tenant_id = $2 RETURNING id AS product_id`,
        values,
      );
      if (!rows[0]) throw new HttpError(404, 'product_not_found', 'Produto não encontrado.');
      return { product_id: rows[0].product_id };
    },
  );

  app.post<{ Params: ProductIdParams; Body: { sku: string; name: string; price_cents: number; attributes?: Record<string, unknown> } }>(
    '/v1/admin/products/:productId/variants',
    {
      schema: {
        body: {
          type: 'object', additionalProperties: false,
          required: ['sku', 'name', 'price_cents'],
          properties: {
            sku: { type: 'string', minLength: 1, maxLength: 80 },
            name: { type: 'string', minLength: 1, maxLength: 200 },
            price_cents: { type: 'integer', minimum: 0 },
            attributes: { type: 'object' },
          },
        },
      },
    },
    async (request, reply) => {
      const session = await requireOperator(request, database);
      const { sku, name, price_cents, attributes = {} } = request.body;

      const { rows: prodRows } = await database.query<{ currency: string }>(
        `SELECT s.currency FROM products p JOIN stores s ON s.id = p.store_id AND s.tenant_id = p.tenant_id
         WHERE p.id = $1 AND p.tenant_id = $2`,
        [request.params.productId, session.tenant_id],
      );
      if (!prodRows[0]) throw new HttpError(404, 'product_not_found', 'Produto não encontrado.');

      const { rows } = await database.query<{ variant_id: string }>(
        `INSERT INTO product_variants (tenant_id, product_id, sku, name, price_cents, currency, attributes)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id AS variant_id`,
        [session.tenant_id, request.params.productId, sku, name, price_cents, prodRows[0].currency, JSON.stringify(attributes)],
      );
      const variant_id = rows[0]?.variant_id;
      if (!variant_id) throw new HttpError(500, 'internal_error', 'Erro ao criar variante.');
      return reply.status(201).send({ variant_id });
    },
  );

  app.patch<{ Params: VariantIdParams; Body: { name?: string; price_cents?: number; is_active?: boolean } }>(
    '/v1/admin/variants/:variantId',
    {
      schema: {
        body: {
          type: 'object', additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200 },
            price_cents: { type: 'integer', minimum: 0 },
            is_active: { type: 'boolean' },
          },
        },
      },
    },
    async (request) => {
      const session = await requireOperator(request, database);
      const { name, price_cents, is_active } = request.body;

      const sets: string[] = [];
      const values: unknown[] = [request.params.variantId, session.tenant_id];
      if (name !== undefined) { sets.push(`name = $${values.push(name)}`); }
      if (price_cents !== undefined) { sets.push(`price_cents = $${values.push(price_cents)}`); }
      if (is_active !== undefined) { sets.push(`is_active = $${values.push(is_active)}`); }
      if (sets.length === 0) throw new HttpError(400, 'no_fields', 'Nenhum campo para atualizar.');

      sets.push(`updated_at = now()`);
      const { rows } = await database.query<{ variant_id: string }>(
        `UPDATE product_variants SET ${sets.join(', ')} WHERE id = $1 AND tenant_id = $2 RETURNING id AS variant_id`,
        values,
      );
      if (!rows[0]) throw new HttpError(404, 'variant_not_found', 'Variante não encontrada.');
      return { variant_id: rows[0].variant_id };
    },
  );

  app.post<{ Params: StoreSlugParams; Body: { name: string } }>(
    '/v1/admin/stores/:storeSlug/categories',
    {
      schema: {
        body: {
          type: 'object', additionalProperties: false, required: ['name'],
          properties: { name: { type: 'string', minLength: 1, maxLength: 120 } },
        },
      },
    },
    async (request, reply) => {
      const session = await requireOperator(request, database);
      const { rows: storeRows } = await database.query<{ store_id: string }>(
        `SELECT id AS store_id FROM stores WHERE slug = $1 AND tenant_id = $2 AND status = 'ACTIVE'`,
        [request.params.storeSlug, session.tenant_id],
      );
      if (!storeRows[0]) throw new HttpError(404, 'store_not_found', 'Loja não encontrada.');
      const slug = request.body.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const { rows } = await database.query<{ category_id: string }>(
        `INSERT INTO categories (tenant_id, store_id, name, slug)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (tenant_id, store_id, slug) DO UPDATE SET name = EXCLUDED.name
         RETURNING id AS category_id`,
        [session.tenant_id, storeRows[0].store_id, request.body.name, slug],
      );
      if (!rows[0]) throw new HttpError(500, 'internal_error', 'Erro ao criar categoria.');
      return reply.status(201).send({ category_id: rows[0].category_id });
    },
  );

  app.get<{ Params: StoreSlugParams }>(
    '/v1/admin/stores/:storeSlug/categories',
    async (request) => {
      const session = await requireOperator(request, database);
      const { rows } = await database.query<{ category_id: string; name: string; slug: string }>(
        `SELECT c.id AS category_id, c.name, c.slug
         FROM categories c JOIN stores s ON s.id = c.store_id AND s.tenant_id = c.tenant_id
         WHERE s.slug = $1 AND c.tenant_id = $2 ORDER BY c.sort_order, c.name`,
        [request.params.storeSlug, session.tenant_id],
      );
      return { categories: rows };
    },
  );
}
