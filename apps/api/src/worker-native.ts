import { AsyncLocalStorage } from 'node:async_hooks';
import { Client, type QueryResultRow } from 'pg';
import type { FastifyInstance } from 'fastify';
import { registerCatalogRoutes, type Database, type TransactionalDatabase } from './catalog.js';
import { registerAuthRoutes } from './auth.js';
import { registerCheckoutRoutes } from './checkout.js';
import { registerCatalogAdminRoutes } from './catalog-admin.js';
import { registerCustomerRoutes } from './customers.js';
import { registerOrderRoutes } from './orders.js';
import { registerDeliveryRoutes } from './deliveries.js';
import { registerPaymentRoutes } from './payments.js';
import { registerPaymentConfigRoutes } from './payment-config.js';
import { registerControlCenterRoutes } from './control-center.js';
import { HttpError } from './errors.js';

export type ApiDatabaseClient = {
  connect(): Promise<unknown>;
  end(): Promise<unknown>;
  query<T extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<{ rows: T[] }>;
};
export type ApiClientFactory = (connectionString: string) => ApiDatabaseClient;

type JsonSchema = {
  $ref?: string; type?: string | string[]; enum?: unknown[]; anyOf?: JsonSchema[];
  required?: string[]; properties?: Record<string, JsonSchema>; items?: JsonSchema;
  additionalProperties?: boolean; minProperties?: number; minLength?: number; maxLength?: number;
  minimum?: number; maximum?: number; minItems?: number; maxItems?: number; uniqueItems?: boolean;
  pattern?: string; format?: string;
};
type RouteOptions = { schema?: { body?: JsonSchema; querystring?: JsonSchema; params?: JsonSchema } };
type NativeRequest = { id: string; body: any; params: any; query: any; headers: Record<string, string | undefined> };
type NativeReply = { status(code: number): NativeReply; send(payload?: unknown): unknown };
type RouteHandler = (request: NativeRequest, reply: NativeReply) => unknown | Promise<unknown>;
type Route = { method: string; path: string; options: RouteOptions; handler: RouteHandler };

const addressSchema: JsonSchema = {
  type: 'object', additionalProperties: false,
  required: ['street', 'number', 'district', 'city', 'state', 'postal_code'],
  properties: {
    street: { type: 'string', minLength: 1, maxLength: 160 }, number: { type: 'string', minLength: 1, maxLength: 30 },
    complement: { type: ['string', 'null'], maxLength: 120 }, district: { type: 'string', minLength: 1, maxLength: 100 },
    city: { type: 'string', minLength: 1, maxLength: 100 }, state: { type: 'string', pattern: '^[A-Z]{2}$' },
    postal_code: { type: 'string', pattern: '^[0-9]{8}$' }, reference: { type: ['string', 'null'], maxLength: 240 },
  },
};

function matchesType(value: unknown, type: string) {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value);
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === type;
}

function validate(schema: JsonSchema, value: unknown): boolean {
  if (schema.$ref === 'address#') return validate(addressSchema, value);
  if (schema.anyOf) return schema.anyOf.some((candidate) => validate(candidate, value));
  if (schema.enum && !schema.enum.includes(value)) return false;
  const types = typeof schema.type === 'string' ? [schema.type] : schema.type;
  if (types && !types.some((type) => matchesType(value, type))) return false;
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) return false;
    if (schema.maxLength !== undefined && value.length > schema.maxLength) return false;
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) return false;
    if (schema.format === 'uuid' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) return false;
    if (schema.format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return false;
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) return false;
    if (schema.maximum !== undefined && value > schema.maximum) return false;
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) return false;
    if (schema.maxItems !== undefined && value.length > schema.maxItems) return false;
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) return false;
    if (schema.items && !value.every((item) => validate(schema.items!, item))) return false;
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (schema.minProperties !== undefined && Object.keys(record).length < schema.minProperties) return false;
    if (schema.required?.some((key) => !(key in record))) return false;
    if (schema.additionalProperties === false && Object.keys(record).some((key) => !schema.properties?.[key])) return false;
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (key in record && !validate(child, record[key])) return false;
    }
  }
  return true;
}

function coerceQuery(schema: JsonSchema | undefined, query: Record<string, unknown>) {
  for (const [key, child] of Object.entries(schema?.properties ?? {})) {
    const value = query[key];
    if (typeof value === 'string' && (child.type === 'integer' || child.type === 'number')) {
      const number = Number(value);
      if (Number.isFinite(number)) query[key] = number;
    }
  }
}

function matchPath(pattern: string, pathname: string) {
  const expected = pattern.split('/').filter(Boolean);
  const actual = pathname.split('/').filter(Boolean);
  if (expected.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (let index = 0; index < expected.length; index += 1) {
    const segment = expected[index]!;
    const value = actual[index]!;
    if (segment.startsWith(':')) params[segment.slice(1)] = decodeURIComponent(value);
    else if (segment !== value) return null;
  }
  return params;
}

class WorkerRouter {
  readonly routes: Route[] = [];
  private register(method: string, path: string, optionsOrHandler: RouteOptions | RouteHandler, maybeHandler?: RouteHandler) {
    this.routes.push({ method, path, options: typeof optionsOrHandler === 'function' ? {} : optionsOrHandler,
      handler: typeof optionsOrHandler === 'function' ? optionsOrHandler : maybeHandler! });
  }
  get(path: string, optionsOrHandler: RouteOptions | RouteHandler, handler?: RouteHandler) { this.register('GET', path, optionsOrHandler, handler); }
  post(path: string, optionsOrHandler: RouteOptions | RouteHandler, handler?: RouteHandler) { this.register('POST', path, optionsOrHandler, handler); }
  put(path: string, optionsOrHandler: RouteOptions | RouteHandler, handler?: RouteHandler) { this.register('PUT', path, optionsOrHandler, handler); }
  patch(path: string, optionsOrHandler: RouteOptions | RouteHandler, handler?: RouteHandler) { this.register('PATCH', path, optionsOrHandler, handler); }
  delete(path: string, optionsOrHandler: RouteOptions | RouteHandler, handler?: RouteHandler) { this.register('DELETE', path, optionsOrHandler, handler); }
}

const clientContext = new AsyncLocalStorage<ApiDatabaseClient>();
function currentClient() {
  const client = clientContext.getStore();
  if (!client) throw new Error('Database client is unavailable outside a request context.');
  return client;
}
const contextualDatabase: TransactionalDatabase = {
  async query<T extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]) {
    const result = await currentClient().query<T>(sql, values);
    return { rows: result.rows };
  },
  async transaction<T>(operation: (database: Database) => Promise<T>) {
    const client = currentClient();
    await client.query('BEGIN');
    try {
      const result = await operation(contextualDatabase);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  },
};

const router = new WorkerRouter();
router.get('/ready', async () => {
  await contextualDatabase.query('SELECT 1');
  return { status: 'ready', service: 'foodapp-api', database: 'ready', external_integrations: 'disabled' };
});
const compatibleRouter = router as unknown as FastifyInstance;
registerCatalogRoutes(compatibleRouter, contextualDatabase);
registerAuthRoutes(compatibleRouter, contextualDatabase);
registerCheckoutRoutes(compatibleRouter, contextualDatabase);
registerCatalogAdminRoutes(compatibleRouter, contextualDatabase);
registerCustomerRoutes(compatibleRouter, contextualDatabase);
registerOrderRoutes(compatibleRouter, contextualDatabase);
registerDeliveryRoutes(compatibleRouter, contextualDatabase);
registerPaymentRoutes(compatibleRouter, contextualDatabase);
registerPaymentConfigRoutes(compatibleRouter, contextualDatabase);
registerControlCenterRoutes(compatibleRouter, contextualDatabase);

const defaultClientFactory: ApiClientFactory = (connectionString) => {
  return new Client({
    connectionString,
    connectionTimeoutMillis: 10_000,
  });
};
export type InjectApiRequestOptions = { connectionString: string; path: string; request: Request; clientFactory?: ApiClientFactory };

export async function injectApiRequest({ connectionString, path, request, clientFactory = defaultClientFactory }: InjectApiRequestOptions) {
  const client = clientFactory(connectionString);
  try {
    await client.connect();
  } catch (error) {
    console.error('Worker database connection failed', error);
    return Response.json({ error: { code: 'db_unavailable', message: 'Serviço temporariamente indisponível.' } }, { status: 503 });
  }
  try {
    return await clientContext.run(client, async () => {
      const url = new URL(request.url);
      const route = router.routes.find((candidate) => candidate.method === request.method && matchPath(candidate.path, path));
      if (!route) return Response.json({ error: { code: 'not_found', message: 'Recurso não encontrado.' } }, { status: 404 });
      const params = matchPath(route.path, path)!;
      const query: Record<string, unknown> = Object.fromEntries(url.searchParams.entries());
      coerceQuery(route.options.schema?.querystring, query);
      const rawBody = ['GET', 'HEAD'].includes(request.method) ? '' : await request.text();
      if (new TextEncoder().encode(rawBody).length > 3 * 1024 * 1024) return invalidResponse(413);
      let body: unknown;
      if (rawBody) {
        try { body = JSON.parse(rawBody); } catch { return invalidResponse(400); }
      }
      const schema = route.options.schema;
      if ((schema?.body && !validate(schema.body, body)) || (schema?.querystring && !validate(schema.querystring, query))
        || (schema?.params && !validate(schema.params, params))) return invalidResponse(400);

      const suppliedId = request.headers.get('x-request-id');
      const requestId = suppliedId && suppliedId.length <= 100 ? suppliedId : crypto.randomUUID();
      let status = 200;
      let sent = false;
      let payload: unknown;
      const reply: NativeReply = { status(code) { status = code; return reply; }, send(value) { sent = true; payload = value; return value; } };
      const nativeRequest: NativeRequest = { id: requestId, body, params, query, headers: Object.fromEntries(request.headers.entries()) };
      try {
        const returned = await route.handler(nativeRequest, reply);
        if (!sent) payload = returned;
        return Response.json(payload ?? null, { status, headers: { 'x-request-id': requestId } });
      } catch (error) {
        if (error instanceof HttpError) return Response.json({ error: { code: error.code, message: error.message, request_id: requestId } }, { status: error.statusCode });
        console.error('Worker API request failed', error);
        return Response.json({ error: { code: 'internal_error', message: 'Erro interno.', request_id: requestId } }, { status: 500 });
      }
    });
  } finally {
    try {
      await client.end();
    } catch (error) {
      console.warn('Worker database client close failed', error);
    }
  }
}

function invalidResponse(status: number) {
  return Response.json({ error: { code: 'invalid_request', message: 'Requisição inválida.' } }, { status });
}
