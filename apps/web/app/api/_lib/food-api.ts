import { injectApiRequest } from '@foodapp/api/serverless';
import { env as cloudflareEnv } from 'cloudflare:workers';

const EXTERNAL_API = process.env.API_INTERNAL_URL
  ?? process.env.NEXT_PUBLIC_API_URL
  ?? 'http://127.0.0.1:3001';

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
    return injectApiRequest({ connectionString, path, request });
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
