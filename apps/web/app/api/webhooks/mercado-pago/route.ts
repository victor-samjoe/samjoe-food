import { forwardFoodApi } from '../../_lib/food-api';

export async function POST(request: Request) {
  return forwardFoodApi(request, '/v1/public/webhooks/payment/mercado-pago');
}
