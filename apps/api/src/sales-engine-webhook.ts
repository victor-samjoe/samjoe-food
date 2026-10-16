import { createHmac } from 'node:crypto';
import type { Database } from './catalog.js';

type WebhookConfig = { webhookUrl: string; hmacSecret: string };

export async function getSalesEngineConfig(db: Database, tenantId: string): Promise<WebhookConfig | null> {
  const { rows } = await db.query<{ integration_settings: Record<string, unknown> | string }>(
    `SELECT integration_settings FROM tenants WHERE id = $1`,
    [tenantId],
  );
  const row = rows[0];
  if (!row) return null;
  const s = typeof row.integration_settings === 'string'
    ? JSON.parse(row.integration_settings) as Record<string, unknown>
    : row.integration_settings;
  const webhookUrl = s.sales_engine_webhook_url;
  const hmacSecret = s.sales_engine_hmac_secret;
  if (typeof webhookUrl !== 'string' || typeof hmacSecret !== 'string') return null;
  return { webhookUrl, hmacSecret };
}

export async function saveSalesEngineConfig(db: Database, tenantId: string, config: WebhookConfig): Promise<void> {
  const { rows } = await db.query<{ integration_settings: Record<string, unknown> | string }>(
    `SELECT integration_settings FROM tenants WHERE id = $1`,
    [tenantId],
  );
  const row = rows[0];
  if (!row) return;
  const s = typeof row.integration_settings === 'string'
    ? JSON.parse(row.integration_settings) as Record<string, unknown>
    : { ...row.integration_settings };
  s.sales_engine_webhook_url = config.webhookUrl;
  s.sales_engine_hmac_secret = config.hmacSecret;
  await db.query(
    `UPDATE tenants SET integration_settings = $1::jsonb, updated_at = now() WHERE id = $2`,
    [JSON.stringify(s), tenantId],
  );
}

export type SalesEngineEventPayload = {
  event_type: string;
  tenantId: string;
  customer: { external_id: string; phone?: string | null; name?: string | null };
  order?: { external_id: string; ref?: string | null; total_cents?: number; from_status?: string; to_status?: string; fulfillment?: string; delivery_address?: string; items?: Array<{ name: string; quantity: number; unit_price_cents: number }> };
};

type SalesEngineDispatchResponse = {
  accepted?: boolean;
  event_type?: string;
  notification?: { kind?: string; reason?: string; providerMessageId?: string | null };
};

async function fetchSalesEngine(url: string, init: RequestInit): Promise<Response> {
  try {
    const { env } = await import('cloudflare:workers');
    const binding = (env as unknown as {
      SALES_ENGINE?: { fetch(input: Request | string, init?: RequestInit): Promise<Response> };
    }).SALES_ENGINE;
    if (binding) return binding.fetch(url, init);
  } catch {
    // Node/local development does not expose Cloudflare service bindings.
  }
  return fetch(url, init);
}

async function saveLastDispatchDiagnostic(
  db: Database,
  tenantId: string,
  diagnostic: Record<string, unknown>,
): Promise<void> {
  await db.query(
    `UPDATE tenants
        SET integration_settings = jsonb_set(
          COALESCE(integration_settings, '{}'::jsonb),
          '{sales_engine_last_dispatch}',
          $1::jsonb,
          true
        ),
        updated_at = now()
      WHERE id = $2`,
    [JSON.stringify({ ...diagnostic, occurredAt: new Date().toISOString() }), tenantId],
  );
}

export async function dispatchSalesEngineEvent(
  config: WebhookConfig,
  event: SalesEngineEventPayload,
): Promise<SalesEngineDispatchResponse> {
  const body = {
    event_id: crypto.randomUUID(),
    event_type: event.event_type,
    occurred_at: new Date().toISOString(),
    customer: event.customer,
    ...(event.order ? { order: event.order } : {}),
  };
  const bodyStr = JSON.stringify(body);
  const sig = 'sha256=' + createHmac('sha256', config.hmacSecret).update(bodyStr).digest('hex');
  let response: Response | undefined;
  let lastErrorBody = '';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    response = await fetchSalesEngine(config.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': event.tenantId,
        'x-samjoe-food-signature': sig,
        'x-samjoe-food-timestamp': new Date().toISOString(),
      },
      body: bodyStr,
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok) break;
    lastErrorBody = (await response.text().catch(() => '')).slice(0, 300);
    const retryable = response.status === 404 || response.status === 408
      || response.status === 429 || response.status >= 500;
    if (!retryable || attempt === 3) break;
    await new Promise((resolve) => setTimeout(resolve, attempt * 250));
  }
  if (!response?.ok) {
    throw new Error(`Sales Engine webhook retornou HTTP ${response?.status ?? 0}${lastErrorBody ? `: ${lastErrorBody}` : ''}`);
  }
  const result = await response.json().catch(() => ({})) as SalesEngineDispatchResponse;
  console.info(JSON.stringify({
    type: 'sales_engine_dispatch_completed',
    eventType: event.event_type,
    toStatus: event.order?.to_status,
    accepted: result.accepted,
    notificationKind: result.notification?.kind,
    notificationReason: result.notification?.reason,
    providerAccepted: Boolean(result.notification?.providerMessageId),
  }));
  return result;
}

export async function dispatchOrderEvent(
  db: Database,
  tenantId: string,
  orderId: string,
  eventType: 'order.paid' | 'order.status_changed',
  status?: { from?: string; to?: string },
): Promise<boolean> {
  const config = await getSalesEngineConfig(db, tenantId);
  if (!config) return false;
  const { rows } = await db.query<{
    public_number: string;
    total_cents: number;
    customer_id: string;
    phone_e164: string | null;
    name: string | null;
  }>(
    `SELECT o.public_number, o.total_cents, o.customer_id, c.phone_e164, c.name
       FROM orders o
       JOIN customers c ON c.id = o.customer_id AND c.tenant_id = o.tenant_id
      WHERE o.id = $1 AND o.tenant_id = $2
      LIMIT 1`,
    [orderId, tenantId],
  );
  const order = rows[0];
  if (!order) return false;
  try {
    const result = await dispatchSalesEngineEvent(config, {
      event_type: eventType,
      tenantId,
      customer: { external_id: order.customer_id, phone: order.phone_e164, name: order.name },
      order: {
        external_id: orderId,
        ref: order.public_number,
        total_cents: order.total_cents,
        ...(status?.from ? { from_status: status.from } : {}),
        ...(status?.to ? { to_status: status.to } : {}),
      },
    });
    await saveLastDispatchDiagnostic(db, tenantId, {
      eventType,
      toStatus: status?.to,
      accepted: result.accepted ?? false,
      notificationKind: result.notification?.kind ?? null,
      notificationReason: result.notification?.reason ?? null,
      providerAccepted: Boolean(result.notification?.providerMessageId),
    });
  } catch (error) {
    await saveLastDispatchDiagnostic(db, tenantId, {
      eventType,
      toStatus: status?.to,
      accepted: false,
      error: (error as Error).message,
    });
    throw error;
  }
  return true;
}
