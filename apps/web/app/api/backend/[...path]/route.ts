const API = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001';
type Context = { params: Promise<{ path: string[] }> };

async function forward(request: Request, context: Context) {
  const { path } = await context.params;
  const joined = path.join('/');
  if (joined !== 'auth/login' && !joined.startsWith('admin/')) {
    return Response.json({ error: { code: 'not_found', message: 'Recurso não encontrado.' } }, { status: 404 });
  }
  const headers = new Headers({ 'content-type': 'application/json' });
  const authorization = request.headers.get('authorization');
  if (authorization) headers.set('authorization', authorization);
  const options: RequestInit = { method: request.method, headers, cache: 'no-store' };
  if (!['GET', 'HEAD'].includes(request.method)) options.body = await request.text();
  try {
    const upstream = await fetch(`${API}/v1/${joined}`, options);
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  } catch {
    return Response.json({ error: { code: 'api_unavailable', message: 'A API local não está disponível.' } }, { status: 502 });
  }
}

export async function GET(request: Request, context: Context) { return forward(request, context); }
export async function POST(request: Request, context: Context) { return forward(request, context); }
export async function PATCH(request: Request, context: Context) { return forward(request, context); }
