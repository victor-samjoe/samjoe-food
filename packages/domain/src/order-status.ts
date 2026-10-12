export const orderStatuses = [
  'PAYMENT_PENDING', 'PAYMENT_FAILED', 'NEW', 'CONFIRMED', 'IN_PREPARATION',
  'READY', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED',
] as const;

export type OrderStatus = typeof orderStatuses[number];

const transitions: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PAYMENT_PENDING: ['NEW', 'PAYMENT_FAILED', 'CANCELLED'],
  PAYMENT_FAILED: ['PAYMENT_PENDING', 'CANCELLED'],
  NEW: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['IN_PREPARATION', 'CANCELLED'],
  IN_PREPARATION: ['READY', 'CANCELLED'],
  READY: ['READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'],
  READY_FOR_PICKUP: ['COMPLETED', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return transitions[from].includes(to);
}

