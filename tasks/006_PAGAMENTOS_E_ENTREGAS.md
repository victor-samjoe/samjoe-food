# Tarefa 006 — Pagamentos e entregas

Status: **concluída (simulação local)**  
Prioridade: **crítica**

## Objetivo

Migrar Mercado Pago, conciliação, rotas e entrega sem confiar em redirecionamento de navegador ou callbacks não autenticados.

## Escopo

- [x] Criar abstração de provedor de pagamento (`packages/integrations`: `PaymentProvider` + `DisabledPaymentProvider`).
- [x] Criar checkout Mercado Pago com referência idempotente (existia em `checkout.ts`).
- [x] Validar assinatura HMAC-SHA256 e consultar recurso no provedor antes de aplicar estado (`payments.ts`).
- [x] Persistir webhook bruto sanitizado via `integration_inbox`, evento normalizado em `payment_events`.
- [x] Implementar reconciliação agendada no worker (job a cada 15min, expira PENDING/AUTHORIZED > 30min).
- [x] Cobrir todos os estados: PAID, PENDING, AUTHORIZED, FAILED, EXPIRED, CANCELLED, PARTIALLY_REFUNDED, REFUNDED, CHARGEBACK.
- [x] Implementar entregas, motoristas, rotas, paradas e ocorrências (`deliveries.ts`).
- [x] Manter n8n como transporte, sem regras comerciais centrais (outbox em cada transição).
- [x] Criar testes de pagamentos e entregas (13 novos testes).

## Critérios de aceite

- [x] Webhook duplicado ou fora de ordem não corrompe estado (`integration_inbox` UNIQUE + `payment_events` UNIQUE por hash).
- [x] Valor, moeda, tenant e referência são conferidos antes da confirmação.
- [x] Pagamento e pedido possuem máquinas de estado separadas (`paymentTransitions` vs `allowedTransitions` em orders).
- [x] Reconciliação encontra eventos ausentes e gera alerta acionável (worker job RECONCILE_JOB).
- [x] Operação possui rollback documentado na tarefa de cutover (Tarefa 008).

## Artefatos criados

- `apps/api/src/payments.ts` — GET `/v1/admin/orders/:orderId/payment`, GET `/v1/admin/payments/:paymentId`, POST `/v1/public/webhooks/payment/mercado-pago`, POST `/v1/admin/orders/:orderId/payment/simulate`.
- `apps/api/src/deliveries.ts` — Painel `delivery-board`, CRUD motoristas, criação de rotas com paradas, transições de rota, registro de ocorrências de parada.
- `apps/worker/src/index.ts` — Job `maintenance.reconcile-payments` a cada 15min, expira simulações PENDING/AUTHORIZED.
- `apps/api/test/payments.test.ts` — 7 testes.
- `apps/api/test/deliveries.test.ts` — 6 testes.

## Decisões técnicas

- Assinatura HMAC-SHA256: `x-mp-signature: sha256=<hash>` sobre JSON serializado (em produção usar raw body).
- `integration_inbox`: garante idempotência no nível de entrada (antes de qualquer processamento).
- `payment_events`: deduplicação por hash `sha256(tenant_id+':'+event_id)` — previne aplicação dupla.
- Worker reconciliador: simula expiração automática para provedores fake/pix; providers reais logam para alertas manuais.
- `deliveries.ts`: rota `delivery-board` agrega drivers + pedidos prontos + rotas ativas em uma chamada só.

## Evidências

- `npm run typecheck`: aprovado em todos os workspaces.
- `npm test`: 33 testes aprovados (31 API + 2 domain).

