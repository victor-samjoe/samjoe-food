import { forwardFoodApi } from '../../_lib/food-api';

export async function PUT(request: Request) {
  return forwardFoodApi(request, '/v1/admin/webhook-config');
}
