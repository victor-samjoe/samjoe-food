const API = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001';

type Context = { params: Promise<{ storeSlug: string }> };

export async function GET(request: Request, context: Context) {
  const { storeSlug } = await context.params;
  const { searchParams } = new URL(request.url);
  const phone = searchParams.get('phone');
  if (!phone) return Response.json({ error: { code: 'missing_phone' } }, { status: 400 });

  const target = `${API}/v1/public/stores/${encodeURIComponent(storeSlug)}/customers/lookup?phone=${encodeURIComponent(phone)}`;
  try {
    const upstream = await fetch(target, { cache: 'no-store' });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  } catch {
    return Response.json({ error: { code: 'api_unavailable' } }, { status: 502 });
  }
}
