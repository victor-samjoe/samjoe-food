import { forwardFoodApi } from '../../_lib/food-api';
type Context = { params: Promise<{ path: string[] }> };

async function forward(request: Request, context: Context) {
  const { path } = await context.params;
  const joined = path.join('/');
  if (joined !== 'auth/login' && !joined.startsWith('admin/')) {
    return Response.json({ error: { code: 'not_found', message: 'Recurso não encontrado.' } }, { status: 404 });
  }
  return forwardFoodApi(request, `/v1/${joined}`);
}

export async function GET(request: Request, context: Context) { return forward(request, context); }
export async function POST(request: Request, context: Context) { return forward(request, context); }
export async function PATCH(request: Request, context: Context) { return forward(request, context); }
