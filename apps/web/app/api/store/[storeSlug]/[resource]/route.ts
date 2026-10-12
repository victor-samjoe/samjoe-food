const API = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001';

type Context = { params: Promise<{ storeSlug: string; resource: string }> };

async function forward(request: Request, context: Context) {
  const { storeSlug, resource } = await context.params;
  const allowed = new Set(['catalog', 'delivery-quotes', 'orders', 'suggestions']);
  if (!allowed.has(resource)) {
    return Response.json({ error: { code: 'not_found', message: 'Recurso não encontrado.' } }, { status: 404 });
  }

  const target = `${API}/v1/public/stores/${encodeURIComponent(storeSlug)}/${resource}`;
  const headers = new Headers({ 'content-type': 'application/json' });
  const idempotencyKey = request.headers.get('idempotency-key');
  if (idempotencyKey) headers.set('idempotency-key', idempotencyKey);

  try {
    const options: RequestInit = {
      method: request.method,
      headers,
      cache: 'no-store',
    };
    if (request.method !== 'GET') options.body = await request.text();
    const upstream = await fetch(target, options);
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  } catch {
    return Response.json({
      error: { code: 'api_unavailable', message: 'A API local ainda não está disponível. Inicie o ambiente de demonstração.' },
    }, { status: 502 });
  }
}

export async function GET(request: Request, context: Context) { return forward(request, context); }
export async function POST(request: Request, context: Context) { return forward(request, context); }
