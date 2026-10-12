import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Database, TransactionalDatabase } from './catalog.js';
import { resolveSession } from './auth.js';
import { HttpError } from './errors.js';

type StoreParams = { storeSlug: string };
type DriverParams = { driverId: string };
type RouteParams = { routeId: string };
type StopParams = { stopId: string };
type OrderParams = { orderId: string };
type DeliveryParams = { deliveryId: string };
type DriverStatus = 'UNAVAILABLE' | 'AVAILABLE' | 'RESERVED' | 'DELIVERING' | 'RETURNING';
type RouteStatus = 'DRAFT' | 'AWAITING_ACCEPTANCE' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';
type DeliveryStatus = 'PENDING' | 'ASSIGNED' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | 'CANCELLED';

type DriverRow = { id: string; name: string; phone_e164: string | null; status: DriverStatus; is_active: boolean };
type EligibleOrderRow = { order_id: string; public_number: string; customer_name: string; address_snapshot: Record<string, unknown>; placed_at: string };
type RouteRow = { route_id: string; driver_id: string | null; driver_name: string | null; status: RouteStatus; created_at: string; stop_count: number; completed_count: number };
type StopRow = { stop_id: string; route_id: string; delivery_id: string; order_id: string; public_number: string; sequence: number; address_snapshot: Record<string, unknown>; status: string; customer_name: string };

const routeTransitions: Record<RouteStatus, readonly RouteStatus[]> = {
  DRAFT: ['AWAITING_ACCEPTANCE', 'CANCELLED'],
  AWAITING_ACCEPTANCE: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [], REJECTED: [], CANCELLED: [],
};

async function requireOperator(request: FastifyRequest, database: Database) {
  const session = await resolveSession(request, database);
  if (!session) throw new HttpError(401, 'unauthorized', 'Sessão ausente ou expirada.');
  if (!['OWNER', 'ADMIN', 'OPERATOR'].includes(session.role)) throw new HttpError(403, 'forbidden', 'Permissão insuficiente.');
  return session;
}

export function registerDeliveryRoutes(app: FastifyInstance, database: TransactionalDatabase) {
  // Compatibility endpoints used by the operational back office. The richer
  // delivery-board endpoints below remain the source for the dispatch screen.
  app.get<{ Params: StoreParams }>('/v1/admin/stores/:storeSlug/drivers', async (request) => {
    const session = await requireOperator(request, database);
    const { rows } = await database.query<DriverRow>(`
      SELECT d.id AS driver_id,d.name,d.phone_e164,d.status,d.is_active
      FROM drivers d
      WHERE d.tenant_id=$1 AND d.is_active
        AND EXISTS (
          SELECT s.id FROM stores s
          WHERE s.id IS NOT NULL AND s.tenant_id=d.tenant_id AND s.slug=$2 AND s.status='ACTIVE'
        )
      ORDER BY d.name
    `, [session.tenant_id, request.params.storeSlug]);
    return { drivers: rows };
  });

  app.post<{ Params: OrderParams; Body: { instructions?: string | null } }>('/v1/admin/orders/:orderId/delivery', {
    schema: { body: { type: 'object', additionalProperties: false, properties: {
      instructions: { type: ['string','null'], maxLength: 500 },
    } } },
  }, async (request, reply) => {
    const session = await requireOperator(request, database);
    const result = await database.transaction(async tx => {
      const order = await tx.query<{ address_snapshot: Record<string, unknown> | null; fulfillment: string }>(`
        SELECT address_snapshot,fulfillment FROM orders WHERE id=$1 AND tenant_id=$2 FOR UPDATE
      `, [request.params.orderId, session.tenant_id]);
      if (!order.rows[0]) throw new HttpError(404, 'order_not_found', 'Pedido não encontrado.');
      if (order.rows[0].fulfillment !== 'DELIVERY') throw new HttpError(422, 'not_delivery', 'O pedido não é para entrega.');
      const delivery = await tx.query<{ delivery_id: string }>(`
        INSERT INTO deliveries (tenant_id,order_id,status,address_snapshot,instructions)
        VALUES ($1,$2,'PENDING',$3::jsonb,$4)
        ON CONFLICT (tenant_id,order_id) DO UPDATE SET
          instructions=COALESCE(EXCLUDED.instructions,deliveries.instructions),updated_at=now()
        RETURNING id AS delivery_id
      `, [session.tenant_id, request.params.orderId, JSON.stringify(order.rows[0].address_snapshot), request.body.instructions ?? null]);
      return delivery.rows[0]!;
    });
    return reply.status(201).send(result);
  });

  app.patch<{ Params: DeliveryParams; Body: { status: DeliveryStatus } }>('/v1/admin/deliveries/:deliveryId', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['status'], properties: {
      status: { enum: ['PENDING','ASSIGNED','IN_TRANSIT','DELIVERED','FAILED','CANCELLED'] },
    } } },
  }, async (request) => {
    const session = await requireOperator(request, database);
    return database.transaction(async tx => {
      const found = await tx.query<{ delivery_id: string; status: DeliveryStatus }>(`
        SELECT id AS delivery_id,status FROM deliveries WHERE id=$1 AND tenant_id=$2 FOR UPDATE
      `, [request.params.deliveryId, session.tenant_id]);
      const delivery = found.rows[0];
      if (!delivery) throw new HttpError(404, 'delivery_not_found', 'Entrega não encontrada.');
      const transitions: Record<DeliveryStatus, readonly DeliveryStatus[]> = {
        PENDING: ['ASSIGNED','CANCELLED'], ASSIGNED: ['IN_TRANSIT','CANCELLED'],
        IN_TRANSIT: ['DELIVERED','FAILED','CANCELLED'], DELIVERED: [], FAILED: [], CANCELLED: [],
      };
      if (!transitions[delivery.status].includes(request.body.status)) {
        throw new HttpError(422, 'invalid_transition', `Transição ${delivery.status} → ${request.body.status} não permitida.`);
      }
      await tx.query(`
        UPDATE deliveries SET status=$1,delivered_at=CASE WHEN $1='DELIVERED' THEN now() ELSE delivered_at END,updated_at=now()
        WHERE id=$2 AND tenant_id=$3
      `, [request.body.status, delivery.delivery_id, session.tenant_id]);
      return { delivery_id: delivery.delivery_id, from_status: delivery.status, to_status: request.body.status };
    });
  });

  app.patch<{ Params: RouteParams; Body: { status: RouteStatus } }>('/v1/admin/routes/:routeId', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['status'], properties: {
      status: { enum: ['DRAFT','AWAITING_ACCEPTANCE','ACCEPTED','IN_PROGRESS','COMPLETED','REJECTED','CANCELLED'] },
    } } },
  }, async (request) => {
    const session = await requireOperator(request, database);
    return database.transaction(async tx => {
      const found = await tx.query<{ route_id: string; status: RouteStatus; driver_id: string | null }>(`
        SELECT id AS route_id,status,driver_id FROM delivery_routes WHERE id=$1 AND tenant_id=$2 FOR UPDATE
      `, [request.params.routeId, session.tenant_id]);
      const route = found.rows[0];
      if (!route) throw new HttpError(404, 'route_not_found', 'Rota não encontrada.');
      if (!routeTransitions[route.status].includes(request.body.status)) {
        throw new HttpError(422, 'invalid_transition', `Transição ${route.status} → ${request.body.status} não permitida.`);
      }
      await tx.query(`UPDATE delivery_routes SET status=$1,updated_at=now() WHERE id=$2 AND tenant_id=$3`, [request.body.status, route.route_id, session.tenant_id]);
      if (route.driver_id && ['COMPLETED','REJECTED','CANCELLED'].includes(request.body.status)) {
        await tx.query(`UPDATE drivers SET status=$1 WHERE id=$2 AND tenant_id=$3`, ['AVAILABLE', route.driver_id, session.tenant_id]);
      }
      return { route_id: route.route_id, from_status: route.status, to_status: request.body.status };
    });
  });

  app.get<{ Params: StoreParams }>('/v1/admin/stores/:storeSlug/delivery-board', async (request) => {
    const session = await requireOperator(request, database);
    const store = await resolveStore(database, session.tenant_id, request.params.storeSlug);
    const [drivers, orders, routes, stops] = await Promise.all([
      database.query<DriverRow>(`
        SELECT id, name, phone_e164, status, is_active FROM drivers
        WHERE tenant_id=$1 AND is_active ORDER BY name
      `, [session.tenant_id]),
      database.query<EligibleOrderRow>(`
        SELECT o.id AS order_id, o.public_number, o.customer_snapshot->>'name' AS customer_name,
          o.address_snapshot, o.placed_at::text
        FROM orders o
        LEFT JOIN deliveries d ON d.tenant_id=o.tenant_id AND d.order_id=o.id
        WHERE o.tenant_id=$1 AND o.store_id=$2 AND o.fulfillment='DELIVERY'
          AND o.status='READY' AND d.id IS NULL
        ORDER BY o.placed_at
      `, [session.tenant_id, store.id]),
      database.query<RouteRow>(`
        SELECT r.id AS route_id, r.driver_id, d.name AS driver_name, r.status, r.created_at::text,
          COUNT(rs.id)::int AS stop_count,
          COUNT(rs.id) FILTER (WHERE rs.status IN ('DELIVERED','FAILED','SKIPPED'))::int AS completed_count
        FROM delivery_routes r
        LEFT JOIN drivers d ON d.tenant_id=r.tenant_id AND d.id=r.driver_id
        LEFT JOIN route_stops rs ON rs.tenant_id=r.tenant_id AND rs.route_id=r.id
        WHERE r.tenant_id=$1 AND r.store_id=$2 AND r.status NOT IN ('COMPLETED','REJECTED','CANCELLED')
        GROUP BY r.id,d.name ORDER BY r.created_at
      `, [session.tenant_id, store.id]),
      database.query<StopRow>(`
        SELECT rs.id AS stop_id, rs.route_id, rs.delivery_id, de.order_id, o.public_number,
          rs.sequence, rs.address_snapshot, rs.status,
          o.customer_snapshot->>'name' AS customer_name
        FROM route_stops rs
        JOIN deliveries de ON de.tenant_id=rs.tenant_id AND de.id=rs.delivery_id
        JOIN orders o ON o.tenant_id=de.tenant_id AND o.id=de.order_id
        JOIN delivery_routes r ON r.tenant_id=rs.tenant_id AND r.id=rs.route_id
        WHERE rs.tenant_id=$1 AND r.store_id=$2 AND r.status NOT IN ('COMPLETED','REJECTED','CANCELLED')
        ORDER BY rs.route_id,rs.sequence
      `, [session.tenant_id, store.id]),
    ]);
    return {
      store: { id: store.id, slug: request.params.storeSlug }, drivers: drivers.rows,
      ready_orders: orders.rows,
      routes: routes.rows.map(route => ({ ...route, stops: stops.rows.filter(stop => stop.route_id === route.route_id) })),
    };
  });

  app.post<{ Body: { name: string; phone_e164?: string | null } }>('/v1/admin/drivers', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['name'], properties: {
      name: { type: 'string', minLength: 2, maxLength: 160 },
      phone_e164: { type: ['string', 'null'], pattern: '^\\+[1-9][0-9]{7,14}$' },
    } } },
  }, async (request, reply) => {
    const session = await requireOperator(request, database);
    const { rows } = await database.query<DriverRow>(`
      INSERT INTO drivers (tenant_id,name,phone_e164,status)
      VALUES ($1,$2,$3,'AVAILABLE')
      RETURNING id,name,phone_e164,status,is_active
    `, [session.tenant_id, request.body.name, request.body.phone_e164 ?? null]);
    return reply.status(201).send({ driver: rows[0] });
  });

  app.patch<{ Params: DriverParams; Body: { status?: DriverStatus; is_active?: boolean } }>('/v1/admin/drivers/:driverId', {
    schema: { body: { type: 'object', additionalProperties: false, minProperties: 1, properties: {
      status: { enum: ['UNAVAILABLE','AVAILABLE','RESERVED','DELIVERING','RETURNING'] }, is_active: { type: 'boolean' },
    } } },
  }, async (request) => {
    const session = await requireOperator(request, database);
    const { rows } = await database.query<DriverRow>(`
      UPDATE drivers SET status=COALESCE($1,status), is_active=COALESCE($2,is_active)
      WHERE id=$3 AND tenant_id=$4 RETURNING id,name,phone_e164,status,is_active
    `, [request.body.status ?? null, request.body.is_active ?? null, request.params.driverId, session.tenant_id]);
    if (!rows[0]) throw new HttpError(404, 'driver_not_found', 'Motoboy não encontrado.');
    return { driver: rows[0] };
  });

  app.post<{ Params: StoreParams; Body: { driver_id: string; order_ids: string[] } }>('/v1/admin/stores/:storeSlug/delivery-routes', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['driver_id','order_ids'], properties: {
      driver_id: { type: 'string', format: 'uuid' },
      order_ids: { type: 'array', minItems: 1, maxItems: 100, uniqueItems: true, items: { type: 'string', format: 'uuid' } },
    } } },
  }, async (request, reply) => {
    const session = await requireOperator(request, database);
    const result = await database.transaction(async tx => {
      const store = await resolveStore(tx, session.tenant_id, request.params.storeSlug);
      const driver = await tx.query<DriverRow>(`
        SELECT id,name,phone_e164,status,is_active FROM drivers
        WHERE id=$1 AND tenant_id=$2 FOR UPDATE
      `, [request.body.driver_id, session.tenant_id]);
      if (!driver.rows[0] || !driver.rows[0].is_active) throw new HttpError(404, 'driver_not_found', 'Motoboy não encontrado.');
      if (driver.rows[0].status !== 'AVAILABLE') throw new HttpError(409, 'driver_unavailable', 'Motoboy não está disponível.');

      const orders = await tx.query<EligibleOrderRow & { tenant_id: string }>(`
        SELECT o.id AS order_id,o.tenant_id,o.public_number,o.customer_snapshot->>'name' AS customer_name,
          o.address_snapshot,o.placed_at::text
        FROM orders o LEFT JOIN deliveries d ON d.tenant_id=o.tenant_id AND d.order_id=o.id
        WHERE o.tenant_id=$1 AND o.store_id=$2 AND o.id=ANY($3::uuid[])
          AND o.fulfillment='DELIVERY' AND o.status='READY' AND d.id IS NULL
        ORDER BY o.placed_at FOR UPDATE OF o
      `, [session.tenant_id, store.id, request.body.order_ids]);
      if (orders.rows.length !== request.body.order_ids.length) throw new HttpError(409, 'orders_not_ready', 'Um ou mais pedidos não estão prontos para rota.');

      const route = await tx.query<{ id: string; status: RouteStatus }>(`
        INSERT INTO delivery_routes (tenant_id,store_id,driver_id,status,metrics_snapshot)
        VALUES ($1,$2,$3,'AWAITING_ACCEPTANCE',$4::jsonb) RETURNING id,status
      `, [session.tenant_id, store.id, request.body.driver_id, JSON.stringify({ simulator: 'sequence-v1', stop_count: orders.rows.length })]);
      const routeId = route.rows[0]!.id;
      const stops: Array<{ id: string; order_id: string; sequence: number }> = [];
      for (const [index, order] of orders.rows.entries()) {
        const delivery = await tx.query<{ id: string }>(`
          INSERT INTO deliveries (tenant_id,order_id,status,address_snapshot)
          VALUES ($1,$2,'ASSIGNED',$3::jsonb) RETURNING id
        `, [session.tenant_id, order.order_id, JSON.stringify(order.address_snapshot)]);
        const stop = await tx.query<{ id: string }>(`
          INSERT INTO route_stops (tenant_id,route_id,delivery_id,sequence,address_snapshot)
          VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING id
        `, [session.tenant_id, routeId, delivery.rows[0]!.id, index + 1, JSON.stringify(order.address_snapshot)]);
        stops.push({ id: stop.rows[0]!.id, order_id: order.order_id, sequence: index + 1 });
      }
      await tx.query(`UPDATE drivers SET status='RESERVED' WHERE id=$1 AND tenant_id=$2`, [request.body.driver_id, session.tenant_id]);
      await writeOutbox(tx, session.tenant_id, 'foodapp.delivery.route_created.v1', routeId, { route_id: routeId, driver_id: request.body.driver_id, order_ids: request.body.order_ids });
      return { route_id: routeId, status: route.rows[0]!.status, stops };
    });
    return reply.status(201).send(result);
  });

  app.post<{ Params: RouteParams; Body: { to: RouteStatus } }>('/v1/admin/delivery-routes/:routeId/transitions', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['to'], properties: {
      to: { enum: ['AWAITING_ACCEPTANCE','ACCEPTED','IN_PROGRESS','COMPLETED','REJECTED','CANCELLED'] },
    } } },
  }, async (request) => {
    const session = await requireOperator(request, database);
    return database.transaction(async tx => {
      const current = await tx.query<{ id: string; status: RouteStatus; driver_id: string | null }>(`
        SELECT id,status,driver_id FROM delivery_routes WHERE id=$1 AND tenant_id=$2 FOR UPDATE
      `, [request.params.routeId, session.tenant_id]);
      const route = current.rows[0];
      if (!route) throw new HttpError(404, 'route_not_found', 'Rota não encontrada.');
      if (!routeTransitions[route.status].includes(request.body.to)) throw new HttpError(422, 'invalid_route_transition', `Transição ${route.status} → ${request.body.to} não permitida.`);

      if (request.body.to === 'COMPLETED') {
        const pending = await tx.query<{ count: number }>(`
          SELECT COUNT(*)::int AS count FROM route_stops
          WHERE route_id=$1 AND tenant_id=$2 AND status NOT IN ('DELIVERED','FAILED','SKIPPED')
        `, [route.id, session.tenant_id]);
        if (Number(pending.rows[0]?.count ?? 0) > 0) throw new HttpError(409, 'route_has_pending_stops', 'A rota ainda possui paradas pendentes.');
      }
      await applyRouteTransition(tx, session.tenant_id, route, request.body.to);
      await writeOutbox(tx, session.tenant_id, 'foodapp.delivery.route_status_changed.v1', route.id, { route_id: route.id, from: route.status, to: request.body.to });
      return { route_id: route.id, from_status: route.status, to_status: request.body.to };
    });
  });

  app.post<{ Params: StopParams; Body: { outcome: 'DELIVERED' | 'FAILED'; occurrence_type?: string; notes?: string | null } }>('/v1/admin/route-stops/:stopId/outcome', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['outcome'], properties: {
      outcome: { enum: ['DELIVERED','FAILED'] },
      occurrence_type: { enum: ['DELIVERED','DELIVERY_FAILED','CUSTOMER_UNAVAILABLE','ADDRESS_NOT_FOUND','DAMAGED','OTHER'] },
      notes: { type: ['string','null'], maxLength: 500 },
    } } },
  }, async (request) => {
    const session = await requireOperator(request, database);
    return database.transaction(async tx => {
      const found = await tx.query<{ stop_id: string; delivery_id: string; order_id: string; route_id: string; route_status: RouteStatus; stop_status: string; driver_id: string | null }>(`
        SELECT rs.id AS stop_id,rs.delivery_id,de.order_id,rs.route_id,r.status AS route_status,
          rs.status AS stop_status,r.driver_id
        FROM route_stops rs JOIN deliveries de ON de.tenant_id=rs.tenant_id AND de.id=rs.delivery_id
        JOIN delivery_routes r ON r.tenant_id=rs.tenant_id AND r.id=rs.route_id
        WHERE rs.id=$1 AND rs.tenant_id=$2 FOR UPDATE OF rs,de,r
      `, [request.params.stopId, session.tenant_id]);
      const stop = found.rows[0];
      if (!stop) throw new HttpError(404, 'stop_not_found', 'Parada não encontrada.');
      if (stop.route_status !== 'IN_PROGRESS') throw new HttpError(409, 'route_not_in_progress', 'A rota não está em andamento.');
      if (['DELIVERED','FAILED','SKIPPED'].includes(stop.stop_status)) throw new HttpError(409, 'stop_already_finished', 'Parada já finalizada.');

      const delivered = request.body.outcome === 'DELIVERED';
      await tx.query(`UPDATE route_stops SET status=$1,completed_at=now() WHERE id=$2 AND tenant_id=$3`, [request.body.outcome, stop.stop_id, session.tenant_id]);
      await tx.query(`UPDATE deliveries SET status=$1,delivered_at=$2,updated_at=now() WHERE id=$3 AND tenant_id=$4`, [delivered ? 'DELIVERED' : 'FAILED', delivered ? new Date() : null, stop.delivery_id, session.tenant_id]);
      if (delivered) {
        await tx.query(`UPDATE orders SET status='COMPLETED',updated_at=now() WHERE id=$1 AND tenant_id=$2 AND status='OUT_FOR_DELIVERY'`, [stop.order_id, session.tenant_id]);
        await tx.query(`INSERT INTO order_status_events (tenant_id,order_id,from_status,to_status,actor_type,actor_id,reason) VALUES ($1,$2,'OUT_FOR_DELIVERY','COMPLETED','USER',$3,$4)`, [session.tenant_id, stop.order_id, session.user_id, request.body.notes ?? null]);
      }
      const occurrenceType = request.body.occurrence_type ?? (delivered ? 'DELIVERED' : 'DELIVERY_FAILED');
      await tx.query(`
        INSERT INTO delivery_occurrences (tenant_id,delivery_id,route_stop_id,type,notes,actor_id)
        VALUES ($1,$2,$3,$4,$5,$6)
      `, [session.tenant_id, stop.delivery_id, stop.stop_id, occurrenceType, request.body.notes ?? null, session.user_id]);

      const pending = await tx.query<{ count: number }>(`
        SELECT COUNT(*)::int AS count FROM route_stops
        WHERE route_id=$1 AND tenant_id=$2 AND status NOT IN ('DELIVERED','FAILED','SKIPPED')
      `, [stop.route_id, session.tenant_id]);
      let routeCompleted = false;
      if (Number(pending.rows[0]?.count ?? 0) === 0) {
        await tx.query(`UPDATE delivery_routes SET status='COMPLETED',updated_at=now() WHERE id=$1 AND tenant_id=$2`, [stop.route_id, session.tenant_id]);
        if (stop.driver_id) await tx.query(`UPDATE drivers SET status='AVAILABLE' WHERE id=$1 AND tenant_id=$2`, [stop.driver_id, session.tenant_id]);
        routeCompleted = true;
      }
      await writeOutbox(tx, session.tenant_id, delivered ? 'foodapp.delivery.delivered.v1' : 'foodapp.delivery.failed.v1', stop.delivery_id, { delivery_id: stop.delivery_id, order_id: stop.order_id, route_id: stop.route_id, notes: request.body.notes ?? null });
      return { stop_id: stop.stop_id, outcome: request.body.outcome, route_completed: routeCompleted };
    });
  });
}

async function resolveStore(database: Database, tenantId: string, slug: string) {
  const { rows } = await database.query<{ id: string }>(`SELECT id FROM stores WHERE tenant_id=$1 AND slug=$2 AND status='ACTIVE'`, [tenantId, slug]);
  if (!rows[0]) throw new HttpError(404, 'store_not_found', 'Loja não encontrada.');
  return rows[0];
}

async function applyRouteTransition(database: Database, tenantId: string, route: { id: string; status: RouteStatus; driver_id: string | null }, to: RouteStatus) {
  await database.query(`UPDATE delivery_routes SET status=$1,updated_at=now() WHERE id=$2 AND tenant_id=$3`, [to, route.id, tenantId]);
  if (to === 'ACCEPTED' && route.driver_id) await database.query(`UPDATE drivers SET status='RESERVED' WHERE id=$1 AND tenant_id=$2`, [route.driver_id, tenantId]);
  if (to === 'IN_PROGRESS') {
    if (route.driver_id) await database.query(`UPDATE drivers SET status='DELIVERING' WHERE id=$1 AND tenant_id=$2`, [route.driver_id, tenantId]);
    await database.query(`UPDATE deliveries de SET status='IN_TRANSIT',updated_at=now() FROM route_stops rs WHERE rs.delivery_id=de.id AND rs.route_id=$1 AND de.tenant_id=$2`, [route.id, tenantId]);
    await database.query(`UPDATE orders o SET status='OUT_FOR_DELIVERY',updated_at=now() FROM deliveries de,route_stops rs WHERE de.order_id=o.id AND rs.delivery_id=de.id AND rs.route_id=$1 AND o.tenant_id=$2 AND o.status='READY'`, [route.id, tenantId]);
  }
  if (['COMPLETED','REJECTED','CANCELLED'].includes(to) && route.driver_id) await database.query(`UPDATE drivers SET status='AVAILABLE' WHERE id=$1 AND tenant_id=$2`, [route.driver_id, tenantId]);
  if (to === 'CANCELLED') {
    await database.query(`UPDATE route_stops SET status='SKIPPED',completed_at=now() WHERE route_id=$1 AND tenant_id=$2 AND status IN ('PENDING','IN_TRANSIT')`, [route.id, tenantId]);
    await database.query(`UPDATE deliveries de SET status='CANCELLED',updated_at=now() FROM route_stops rs WHERE rs.delivery_id=de.id AND rs.route_id=$1 AND de.tenant_id=$2 AND de.status IN ('ASSIGNED','IN_TRANSIT')`, [route.id, tenantId]);
  }
}

async function writeOutbox(database: Database, tenantId: string, eventType: string, aggregateId: string, payload: Record<string, unknown>) {
  await database.query(`INSERT INTO integration_outbox (tenant_id,event_type,aggregate_type,aggregate_id,payload) VALUES ($1,$2,'delivery',$3,$4::jsonb)`, [tenantId, eventType, aggregateId, JSON.stringify(payload)]);
}
