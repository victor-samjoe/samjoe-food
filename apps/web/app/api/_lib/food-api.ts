import { env as cloudflareEnv } from 'cloudflare:workers';

const EXTERNAL_API = process.env.API_INTERNAL_URL
  ?? process.env.NEXT_PUBLIC_API_URL
  ?? 'http://127.0.0.1:3001';

type CacheLike = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};

const catalogRequests = new Map<string, Promise<Response>>();

function runtimeCache(): CacheLike | undefined {
  return (globalThis as typeof globalThis & { caches?: { default?: CacheLike } }).caches?.default;
}

async function injectLocalApi(connectionString: string, path: string, request: Request): Promise<Response> {
  const { injectApiRequest } = await import('@foodapp/api/serverless');
  return injectApiRequest({ connectionString, path, request });
}

async function cachedCatalog(connectionString: string, path: string, request: Request): Promise<Response> {
  const cache = runtimeCache();
  const cacheKey = new Request(request.url, { method: 'GET' });
  const cached = await cache?.match(cacheKey);
  if (cached) return cached;

  const existing = catalogRequests.get(path);
  if (existing) return (await existing).clone();

  const pending = (async () => {
    const response = await injectLocalApi(connectionString, path, request);
    if (!response.ok) return response;
    const headers = new Headers(response.headers);
    headers.set('cache-control', 'public, max-age=60, stale-while-revalidate=300');
    headers.set('x-foodapp-catalog-cache', 'miss');
    const cacheable = new Response(response.body, { status: response.status, headers });
    await cache?.put(cacheKey, cacheable.clone());
    return cacheable;
  })();
  catalogRequests.set(path, pending);
  try {
    return (await pending).clone();
  } finally {
    catalogRequests.delete(path);
  }
}

export async function forwardFoodApi(request: Request, path: string) {
  let connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    const workerBindings = cloudflareEnv as {
      DATABASE_URL?: unknown;
      HYPERDRIVE?: { connectionString?: unknown };
    };
    const hyperdriveUrl = workerBindings.HYPERDRIVE?.connectionString;
    const databaseUrl = workerBindings.DATABASE_URL;
    connectionString = typeof hyperdriveUrl === 'string'
      ? hyperdriveUrl
      : typeof databaseUrl === 'string'
        ? databaseUrl
        : undefined;
  }
  if (connectionString) {
    if (request.method === 'GET' && path.endsWith('/catalog')) {
      return cachedCatalog(connectionString, path, request);
    }
    return injectLocalApi(connectionString, path, request);
  }

  const sourceUrl = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');

  const options: RequestInit = {
    method: request.method,
    headers,
    cache: 'no-store',
  };
  if (!['GET', 'HEAD'].includes(request.method)) options.body = await request.text();

  try {
    const upstream = await fetch(`${EXTERNAL_API}${path}${sourceUrl.search}`, options);
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  } catch {
    return Response.json({
      error: { code: 'api_unavailable', message: 'A API não está disponível.' },
    }, { status: 502 });
  }
}
