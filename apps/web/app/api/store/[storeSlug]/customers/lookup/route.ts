import { forwardFoodApi } from '../../../../_lib/food-api';

type Context = { params: Promise<{ storeSlug: string }> };

export async function GET(request: Request, context: Context) {
  const { storeSlug } = await context.params;
  const { searchParams } = new URL(request.url);
  const phone = searchParams.get('phone');
  if (!phone) return Response.json({ error: { code: 'missing_phone' } }, { status: 400 });

  return forwardFoodApi(request, `/v1/public/stores/${encodeURIComponent(storeSlug)}/customers/lookup`);
}
