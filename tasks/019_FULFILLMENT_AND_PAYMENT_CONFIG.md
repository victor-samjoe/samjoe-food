# Tarefa 019 — Modalidades de Atendimento e Meios de Pagamento

Status: **CONCLUÍDO**
Prioridade: P1
Originado por: refinamento do modelo de retirada de pedido

## O que foi feito

### Migration 0028
- Adicionados 8 toggles booleanos na tabela `stores`:
  - Fulfillment: `scheduled_delivery_enabled`, `pickup_in_person_enabled`, `pickup_by_app_enabled`, `pickup_scheduling_enabled`
  - Pagamento: `cash_enabled`, `card_on_site_enabled`, `pix_enabled`, `mercado_pago_enabled`
- Estendido `orders.fulfillment` CHECK para incluir `DELIVERY_SCHEDULED` e `PICKUP_BY_APP`
- Adicionado `scheduled_for timestamptz` nullable em `orders`

### API: catalog.ts
- Expõe `fulfillment_config` e `payment_config` no catálogo público

### API: catalog-admin.ts
- GET e PATCH /v1/admin/stores/:storeSlug incluem os 8 novos campos

### API: checkout.ts
- Aceita `DELIVERY_SCHEDULED`, `PICKUP_BY_APP` como fulfillment
- Aceita `CARD` como payment_method
- Valida fulfillment e payment_method contra as configs da loja
- Salva `scheduled_for` no pedido
- `PICKUP_BY_APP` requer endereço do cliente
- `DELIVERY_SCHEDULED` requer `scheduled_for`

### UI: admin/page.tsx
- Adicionado step 4 "Atendimento" nas configurações da loja
- Painel "Modalidades de atendimento" com 4 toggles
- Painel "Meios de pagamento" com 4 toggles
- Bug corrigido: OrderList agora usa `actionForOrder` em vez de `nextAction` diretamente
- `actionForOrder` atualizado: READY+delivery → "Saiu p/ entrega", READY+pickup → "Liberar retirada"

### UI: storefront.tsx
- Fulfillment selector dinâmico baseado em `fulfillment_config`
- Payment selector dinâmico baseado em `payment_config`
- Campo `scheduledFor` no form para agendamento
- Review mostra label correto de todos os novos tipos
- Endereço exibido também para `PICKUP_BY_APP`
