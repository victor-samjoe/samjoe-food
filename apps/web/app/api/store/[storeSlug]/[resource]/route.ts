import { forwardFoodApi } from '../../../_lib/food-api';

type Context = { params: Promise<{ storeSlug: string; resource: string }> };

async function forward(request: Request, context: Context) {
  const { storeSlug, resource } = await context.params;
  const allowed = new Set(['catalog', 'delivery-quotes', 'orders', 'suggestions', 'status']);
  if (!allowed.has(resource)) {
    return Response.json({ error: { code: 'not_found', message: 'Recurso não encontrado.' } }, { status: 404 });
  }

  return forwardFoodApi(request, `/v1/public/stores/${encodeURIComponent(storeSlug)}/${resource}`);
}

export async function GET(request: Request, context: Context) { return forward(request, context); }
export async function POST(request: Request, context: Context) { return forward(request, context); }
