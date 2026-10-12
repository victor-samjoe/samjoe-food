import type { FastifyInstance } from 'fastify';
import type { Database, TransactionalDatabase } from './catalog.js';
import { resolveSession } from './auth.js';
import { HttpError } from './errors.js';

type CustomerIdParams = { customerId: string };
type CustomerRow = {
  customer_id: string; name: string; phone_e164: string | null; email: string | null;
  status: string; created_at: string; updated_at: string;
};
type AddressRow = {
  address_id: string; label: string | null; address: Record<string, unknown>;
  latitude: string | null; longitude: string | null; is_primary: boolean; is_active: boolean;
};

async function requireOperator(request: Parameters<typeof resolveSession>[0], database: Database) {
  const session = await resolveSession(request, database);
  if (!session) throw new HttpError(401, 'unauthorized', 'Sessão ausente ou expirada.');
  if (!['OWNER', 'ADMIN', 'OPERATOR'].includes(session.role)) {
    throw new HttpError(403, 'forbidden', 'Permissão insuficiente.');
  }
  return session;
}

export function registerCustomerRoutes(app: FastifyInstance, database: TransactionalDatabase) {
  app.get<{ Querystring: { phone?: string; name?: string; limit?: number; offset?: number } }>(
    '/v1/admin/customers',
    {
      schema: {
        querystring: {
          type: 'object', additionalProperties: false,
          properties: {
            phone: { type: 'string', maxLength: 20 },
            name: { type: 'string', maxLength: 160 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            offset: { type: 'integer', minimum: 0, default: 0 },
          },
        },
      },
    },
    async (request) => {
      const session = await requireOperator(request, database);
      const { phone, name, limit = 20, offset = 0 } = request.query;
      const conditions = ['c.tenant_id = $1'];
      const values: unknown[] = [session.tenant_id];
      if (phone) { conditions.push(`c.phone_e164 = $${values.push(phone)}`); }
      if (name) { conditions.push(`c.name ILIKE $${values.push(`%${name}%`)}`); }
      values.push(limit, offset);
      const { rows } = await database.query<CustomerRow & { total: number }>(`
        SELECT c.id AS customer_id, c.name, c.phone_e164, c.email, c.status,
          c.created_at::text, c.updated_at::text,
          COUNT(*) OVER () AS total
        FROM customers c WHERE ${conditions.join(' AND ')}
        ORDER BY c.created_at DESC
        LIMIT $${values.length - 1} OFFSET $${values.length}
      `, values);
      return {
        customers: rows.map(({ total: _total, ...r }) => r),
        total: Number(rows[0]?.total ?? 0),
        limit, offset,
      };
    },
  );

  app.get<{ Params: CustomerIdParams }>(
    '/v1/admin/customers/:customerId',
    async (request, reply) => {
      const session = await requireOperator(request, database);
      const { rows: custRows } = await database.query<CustomerRow>(`
        SELECT id AS customer_id, name, phone_e164, email, status,
          created_at::text, updated_at::text
        FROM customers
        WHERE id = $1 AND tenant_id = $2
      `, [request.params.customerId, session.tenant_id]);
      if (!custRows[0]) return reply.status(404).send({ error: { code: 'customer_not_found', message: 'Cliente não encontrado.', request_id: request.id } });

      const { rows: addrRows } = await database.query<AddressRow>(`
        SELECT id AS address_id, label, address, latitude::text, longitude::text, is_primary, is_active
        FROM customer_addresses
        WHERE customer_id = $1 AND tenant_id = $2
        ORDER BY is_primary DESC, created_at DESC
      `, [request.params.customerId, session.tenant_id]);

      const { rows: idRows } = await database.query<{ source: string; external_id: string }>(`
        SELECT source, external_id FROM external_identifiers
        WHERE tenant_id = $1 AND entity_type = 'customer' AND entity_id = $2
        ORDER BY created_at
      `, [session.tenant_id, request.params.customerId]);

      return { customer: custRows[0], addresses: addrRows, external_identifiers: idRows };
    },
  );

  app.patch<{ Params: CustomerIdParams; Body: { name?: string; email?: string | null; status?: 'ACTIVE' | 'INACTIVE' | 'BLOCKED' } }>(
    '/v1/admin/customers/:customerId',
    {
      schema: {
        body: {
          type: 'object', additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 160 },
            email: { type: ['string', 'null'], maxLength: 320 },
            status: { enum: ['ACTIVE', 'INACTIVE', 'BLOCKED'] },
          },
        },
      },
    },
    async (request) => {
      const session = await requireOperator(request, database);
      const { name, email, status } = request.body;
      const sets: string[] = [];
      const values: unknown[] = [request.params.customerId, session.tenant_id];
      if (name !== undefined) { sets.push(`name = $${values.push(name)}`); }
      if (email !== undefined) { sets.push(`email = $${values.push(email)}`); }
      if (status !== undefined) { sets.push(`status = $${values.push(status)}`); }
      if (sets.length === 0) throw new HttpError(400, 'no_fields', 'Nenhum campo para atualizar.');
      sets.push('updated_at = now()');
      const { rows } = await database.query<{ customer_id: string }>(
        `UPDATE customers SET ${sets.join(', ')} WHERE id = $1 AND tenant_id = $2 RETURNING id AS customer_id`,
        values,
      );
      if (!rows[0]) throw new HttpError(404, 'customer_not_found', 'Cliente não encontrado.');
      return { customer_id: rows[0].customer_id };
    },
  );

  app.post<{ Params: CustomerIdParams; Body: { label?: string | null; address: Record<string, unknown>; latitude?: number | null; longitude?: number | null; is_primary?: boolean } }>(
    '/v1/admin/customers/:customerId/addresses',
    {
      schema: {
        body: {
          type: 'object', additionalProperties: false, required: ['address'],
          properties: {
            label: { type: ['string', 'null'], maxLength: 80 },
            address: { $ref: 'address#' },
            latitude: { type: ['number', 'null'] },
            longitude: { type: ['number', 'null'] },
            is_primary: { type: 'boolean', default: false },
          },
        },
      },
    },
    async (request, reply) => {
      const session = await requireOperator(request, database);
      const { label = null, address, latitude = null, longitude = null, is_primary = false } = request.body;

      return database.transaction(async (tx) => {
        const { rows: check } = await tx.query(
          `SELECT 1 FROM customers WHERE id = $1 AND tenant_id = $2`,
          [request.params.customerId, session.tenant_id],
        );
        if (!check[0]) throw new HttpError(404, 'customer_not_found', 'Cliente não encontrado.');

        if (is_primary) {
          await tx.query(
            `UPDATE customer_addresses SET is_primary = false WHERE customer_id = $1 AND tenant_id = $2`,
            [request.params.customerId, session.tenant_id],
          );
        }
        const { rows } = await tx.query<{ address_id: string }>(
          `INSERT INTO customer_addresses (tenant_id, customer_id, label, address, latitude, longitude, is_primary)
           VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7) RETURNING id AS address_id`,
          [session.tenant_id, request.params.customerId, label, JSON.stringify(address), latitude, longitude, is_primary],
        );
        const address_id = rows[0]?.address_id;
        if (!address_id) throw new HttpError(500, 'internal_error', 'Erro ao criar endereço.');
        return reply.status(201).send({ address_id });
      });
    },
  );
}
