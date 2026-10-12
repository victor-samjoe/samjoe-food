export interface PaymentProvider {
  createCheckout(input: { orderId: string; amountCents: number; currency: 'BRL' }): Promise<{ providerReference: string; checkoutUrl: string }>;
  fetchStatus(providerReference: string): Promise<string>;
}

export class DisabledPaymentProvider implements PaymentProvider {
  async createCheckout(): Promise<never> { throw new Error('external_integrations_disabled'); }
  async fetchStatus(): Promise<never> { throw new Error('external_integrations_disabled'); }
}

