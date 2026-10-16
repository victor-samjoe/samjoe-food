import { Buffer } from 'node:buffer';
import { Client } from 'pg';

type CacheLike = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};

type RuntimeCaches = { default?: CacheLike };

function runtimeCache(): CacheLike | undefined {
  return (globalThis as typeof globalThis & { caches?: RuntimeCaches }).caches?.default;
}

function imageResponse(source: string): Response {
  if (/^https?:\/\//i.test(source)) return Response.redirect(source, 302);
  const match = /^data:(image\/(?:png|jpeg|webp|gif|avif));base64,([a-z0-9+/=\s]+)$/i.exec(source);
  if (!match) return Response.json({ error: { code: 'media_not_found', message: 'Imagem não encontrada.' } }, { status: 404 });
  const [, mimeType, payload] = match;
  if (!mimeType || !payload) return Response.json({ error: { code: 'media_not_found', message: 'Imagem não encontrada.' } }, { status: 404 });
  const bytes = new Uint8Array(Buffer.from(payload.replace(/\s/g, ''), 'base64'));
  if (bytes.byteLength > 3 * 1024 * 1024) {
    return Response.json({ error: { code: 'media_too_large', message: 'Imagem excede o limite permitido.' } }, { status: 413 });
  }
  return new Response(bytes, {
    headers: {
      'content-type': mimeType.toLowerCase(),
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
}

export type PublicMediaRequest = {
  connectionString: string;
  storeSlug: string;
  mediaPath: string[];
  request: Request;
};

export async function fetchPublicMedia({ connectionString, storeSlug, mediaPath, request }: PublicMediaRequest): Promise<Response> {
  const cache = runtimeCache();
  const cacheKey = new Request(request.url, { method: 'GET' });
  const cached = await cache?.match(cacheKey);
  if (cached) return cached;

  const client = new Client({ connectionString, connectionTimeoutMillis: 10_000 });
  try {
    await client.connect();
    let source: string | null = null;

    if (mediaPath[0] === 'products' && mediaPath.length === 2) {
      const productId = mediaPath[1];
      if (!productId || !/^[0-9a-f-]{36}$/i.test(productId)) return new Response(null, { status: 404 });
      const result = await client.query<{ source: string | null }>(`
        SELECT product.cover_image_url AS source
        FROM products product
        JOIN stores store ON store.id = product.store_id AND store.tenant_id = product.tenant_id
        WHERE store.slug = $1 AND store.status = 'ACTIVE'
          AND product.id = $2 AND product.is_active = true AND product.is_archived = false
        LIMIT 1
      `, [storeSlug, productId]);
      source = result.rows[0]?.source ?? null;
    } else if (mediaPath[0] === 'storefront' && mediaPath.length >= 2) {
      const result = await client.query<{ storefront_config: Record<string, unknown> | null }>(`
        SELECT storefront_config
        FROM stores
        WHERE slug = $1 AND status = 'ACTIVE'
        LIMIT 1
      `, [storeSlug]);
      const config = result.rows[0]?.storefront_config ?? {};
      const field = mediaPath[1];
      if (field && ['logo_url', 'hero_image_url', 'hero_bg_image_url'].includes(field) && mediaPath.length === 2) {
        source = typeof config[field] === 'string' ? config[field] as string : null;
      } else if (field === 'hero_slides' && mediaPath.length === 3) {
        const index = Number(mediaPath[2]);
        const slides = Array.isArray(config.hero_slides) ? config.hero_slides : [];
        const slide = Number.isInteger(index) && index >= 0 ? slides[index] : null;
        source = slide && typeof slide === 'object' && !Array.isArray(slide)
          && typeof (slide as Record<string, unknown>).image_url === 'string'
          ? (slide as Record<string, unknown>).image_url as string
          : null;
      } else if (field === 'hero_images' && mediaPath.length === 3) {
        const index = Number(mediaPath[2]);
        const images = Array.isArray(config.hero_images) ? config.hero_images : [];
        source = Number.isInteger(index) && index >= 0 && typeof images[index] === 'string'
          ? images[index] as string
          : null;
      }
    }

    if (!source) return Response.json({ error: { code: 'media_not_found', message: 'Imagem não encontrada.' } }, { status: 404 });
    const response = imageResponse(source);
    if (response.ok && response.status !== 302) await cache?.put(cacheKey, response.clone());
    return response;
  } catch (error) {
    console.error('Public media request failed', error);
    return Response.json({ error: { code: 'media_unavailable', message: 'Imagem temporariamente indisponível.' } }, { status: 503 });
  } finally {
    await client.end().catch(() => undefined);
  }
}
