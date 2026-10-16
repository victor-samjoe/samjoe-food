import { purgeCatalogCache } from '../../_lib/food-api';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { storeSlug?: unknown };
  const storeSlug = typeof body.storeSlug === 'string' ? body.storeSlug : null;
  if (!storeSlug || !/^[a-z0-9-]{2,100}$/i.test(storeSlug)) {
    return Response.json({ error: { code: 'invalid_store_slug' } }, { status: 400 });
  }
  await purgeCatalogCache(storeSlug, request.url);
  return Response.json({ ok: true });
}
