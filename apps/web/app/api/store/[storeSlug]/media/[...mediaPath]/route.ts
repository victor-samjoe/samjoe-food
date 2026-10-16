import { fetchPublicMedia } from '@foodapp/api/public-media';
import { env as cloudflareEnv } from 'cloudflare:workers';

type Context = { params: Promise<{ storeSlug: string; mediaPath: string[] }> };

export async function GET(request: Request, context: Context) {
  const { storeSlug, mediaPath } = await context.params;
  if (!/^[a-z0-9-]{2,100}$/i.test(storeSlug) || mediaPath.length > 4) {
    return new Response(null, { status: 404 });
  }

  const workerBindings = cloudflareEnv as {
    DATABASE_URL?: unknown;
    HYPERDRIVE?: { connectionString?: unknown };
  };
  const hyperdriveUrl = workerBindings.HYPERDRIVE?.connectionString;
  const databaseUrl = workerBindings.DATABASE_URL;
  const connectionString = typeof hyperdriveUrl === 'string'
    ? hyperdriveUrl
    : typeof databaseUrl === 'string'
      ? databaseUrl
      : process.env.DATABASE_URL;

  if (!connectionString) {
    return Response.json({ error: { code: 'media_unavailable', message: 'Imagem temporariamente indisponível.' } }, { status: 503 });
  }

  return fetchPublicMedia({ connectionString, storeSlug, mediaPath, request });
}
