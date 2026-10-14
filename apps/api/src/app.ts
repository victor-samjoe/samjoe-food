import Fastify from 'fastify';
import cors from '@fastify/cors';
import { registerCatalogRoutes, type TransactionalDatabase } from './catalog.js';
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

export type AppDependencies = {
  pool?: TransactionalDatabase;
};

export function buildApp(dependencies: AppDependencies = {}) {
  const app = Fastify({
    logger: true,
    bodyLimit: 3 * 1024 * 1024,
    genReqId: (request) => {
      const supplied = request.headers['x-request-id'];
      return typeof supplied === 'string' && supplied.length <= 100 ? supplied : crypto.randomUUID();
    },
  });

  void app.register(cors, {
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',')
      : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    credentials: true,
  });

  app.addSchema({
    $id: 'address',
    type: 'object',
    additionalProperties: false,
    required: ['street', 'number', 'district', 'city', 'state', 'postal_code'],
    properties: {
      street: { type: 'string', minLength: 1, maxLength: 160 },
      number: { type: 'string', minLength: 1, maxLength: 30 },
      complement: { type: ['string', 'null'], maxLength: 120 },
      district: { type: 'string', minLength: 1, maxLength: 100 },
      city: { type: 'string', minLength: 1, maxLength: 100 },
      state: { type: 'string', pattern: '^[A-Z]{2}$' },
      postal_code: { type: 'string', pattern: '^[0-9]{8}$' },
      reference: { type: ['string', 'null'], maxLength: 240 },
    },
  });

  app.get('/health', async () => ({ status: 'ok', service: 'foodapp-api' }));
  app.get('/ready', async (_request, reply) => {
    if (!dependencies.pool) {
      return reply.status(503).send({
        status: 'not_ready', service: 'foodapp-api', database: 'not_configured', external_integrations: 'disabled',
      });
    }
    try {
      await dependencies.pool.query('SELECT 1');
      return { status: 'ready', service: 'foodapp-api', database: 'ready', external_integrations: 'disabled' };
    } catch {
      return reply.status(503).send({
        status: 'not_ready', service: 'foodapp-api', database: 'unavailable', external_integrations: 'disabled',
      });
    }
  });

  if (dependencies.pool) {
    registerCatalogRoutes(app, dependencies.pool);
    registerAuthRoutes(app, dependencies.pool);
    registerCheckoutRoutes(app, dependencies.pool);
    registerCatalogAdminRoutes(app, dependencies.pool);
    registerCustomerRoutes(app, dependencies.pool);
    registerOrderRoutes(app, dependencies.pool);
    registerDeliveryRoutes(app, dependencies.pool);
    registerPaymentRoutes(app, dependencies.pool);
    registerPaymentConfigRoutes(app, dependencies.pool);
    registerControlCenterRoutes(app, dependencies.pool);
  }

  app.setNotFoundHandler((request, reply) => reply.status(404).send({
    error: { code: 'not_found', message: 'Recurso não encontrado.', request_id: request.id },
  }));

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, request_id: request.id },
      });
    }
    const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
      ? (error as { statusCode?: unknown }).statusCode
      : undefined;
    if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
      return reply.status(statusCode).send({
        error: { code: 'invalid_request', message: 'Requisição inválida.', request_id: request.id },
      });
    }
    request.log.error({ err: error }, 'request failed');
    void reply.status(500).send({
      error: { code: 'internal_error', message: 'Erro interno.', request_id: request.id },
    });
  });

  return app;
}

