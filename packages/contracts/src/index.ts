export type EventEnvelope<T extends Record<string, unknown>> = {
  specversion: '1.0';
  id: string;
  type: `foodapp.${string}.${string}.v${number}`;
  source: `urn:samjoe:foodapp:${string}`;
  tenant_id: string;
  time: string;
  subject: string;
  correlation_id: string;
  causation_id?: string | null;
  data: T;
};

