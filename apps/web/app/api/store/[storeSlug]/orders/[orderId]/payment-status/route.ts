import { forwardFoodApi } from '../../../../../_lib/food-api';

type Context = { params: Promise<{ storeSlug: string; orderId: string }> };

export async function GET(request: Request, context: Context) {
  const { storeSlug, orderId } = await context.params;
  return forwardFoodApi(request, `/v1/public/stores/${encodeURIComponent(storeSlug)}/orders/${encodeURIComponent(orderId)}/payment-status`);
}
