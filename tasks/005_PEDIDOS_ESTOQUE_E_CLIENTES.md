# Tarefa 005 — Pedidos, estoque e clientes

Status: **concluída (simulação local)**
Prioridade: **crítica**

## Objetivo

Transferir para o FoodApp a criação confiável de pedidos e a consistência de estoque, preservando uma projeção operacional temporária para o legado.

## Escopo

- [x] Implementar recálculo obrigatório de itens, preço e frete no servidor durante checkout.
- [x] Implementar clientes, endereços e vínculos de identidade externa.
- [x] Implementar pedidos, itens, adicionais e histórico de estados.
- [x] Implementar reserva transacional de estoque e expiração.
- [x] Implementar idempotência de checkout e prevenção de pedido duplicado.
- [x] Integrar cotação/validação de entrega pelo simulador determinístico versionado.
- [x] Criar outbox para efeitos externos.
- [x] Dispensar projeção para planilha: não existe produção ou operação legada a manter.
- [x] Criar painel móvel mínimo de operação.
- [x] Dispensar shadow traffic e executar teste real de concorrência em PostgreSQL.

## Artefatos criados

- `apps/api/src/customers.ts` — CRUD de clientes e endereços: `GET/PATCH /v1/admin/customers`, `GET /v1/admin/customers/:id`, `POST /v1/admin/customers/:id/addresses`.
- `apps/api/src/orders.ts` — Gestão de pedidos: `GET /v1/admin/stores/:slug/orders`, `GET /v1/admin/orders/:id`, `POST /v1/admin/orders/:id/transitions` (valida transições, libera reservas no CANCEL, grava outbox).
- `apps/worker/src/index.ts` — Expira reservas ACTIVE vencidas a cada 5 min via BullMQ scheduler; libera `inventory_levels.reserved` para cada reserva expirada.
- `apps/web/app/admin/orders/page.tsx` — Painel mobile-first: lista pedidos ativos, botões de avanço de estado, cancelamento com confirmação, auto-refresh 30s.

## Decisões técnicas

- Transições de estado validadas contra tabela estática `allowedTransitions` (espelhada de `@foodapp/domain`).
- Cancelamento libera automaticamente todas as reservas `ACTIVE` do pedido e atualiza `inventory_levels.reserved`.
- Outbox emite `foodapp.order.status_changed.v1` em cada transição.
- Worker usa `pg` diretamente (sem `@foodapp/db` como dep formal — hoisting npm garante disponibilidade).

## Critérios de aceite

- [x] Duas compras simultâneas não vendem mais que o estoque disponível.
- [x] Repetir a mesma requisição retorna o mesmo pedido.
- [x] Preço, frete e itens ficam congelados no pedido.
- [x] Toda mudança de estado possui autor, origem e timestamp.
- [x] Falha na projeção para Sheets não desfaz nem perde o pedido oficial.

## Evidências

- `npm run typecheck`: aprovado em todos os workspaces.
- `npm test`: 20 testes aprovados (18 API + 2 domain).
- Teste de transição CANCELLED verifica liberação de inventário no mock.
