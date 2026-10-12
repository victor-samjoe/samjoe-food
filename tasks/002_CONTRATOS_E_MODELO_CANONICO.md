# Tarefa 002 — Contratos e modelo canônico

Status: **concluída (v1 simulada)**  
Prioridade: **bloqueadora**

## Objetivo

Definir o modelo de dados do FoodApp e os contratos que permitem migrar sem acoplar o núcleo a Apps Script, Mercado Pago, Evolution, Google ou Sales Engine.

## Escopo

- [x] Fechar o vocabulário de tenant, loja, cliente, produto, SKU, pedido, pagamento e entrega.
- [x] Modelar catálogo, variantes, adicionais, disponibilidade e imagens.
- [x] Modelar cliente, endereços e identidade externa.
- [x] Modelar pedido e itens como snapshot histórico, não como referência mutável ao catálogo.
- [x] Modelar estoque, reservas e expiração.
- [x] Modelar pagamentos, eventos e reembolsos.
- [x] Modelar entregas, rotas, paradas e motoristas.
- [x] Modelar auditoria, idempotência, inbox, outbox e tentativas de webhook.
- [x] Criar mapa explícito dos estados legados para estados canônicos.
- [x] Publicar JSON Schemas/OpenAPI dos contratos públicos e de integração.
- [x] Versionar o envelope de eventos compartilhado com o Sales Engine.

## Evidências

- `docs/architecture/CANONICAL_MODEL.md`;
- `supabase/migrations/0001_canonical_model.sql`;
- `database/seeds/0001_demo.sql`;
- `contracts/openapi/foodapp.v1.yaml`;
- `contracts/schemas/*.json`;
- `contracts/COMPATIBILITY.md` e `contracts/CONTRACT_TEST_PLAN.md`.
- Migration e seed executados com sucesso em PostgreSQL 17 temporário em 2026-10-10.

## Decisões obrigatórias

- dinheiro em centavos inteiros;
- timestamps em UTC, com timezone do tenant separado;
- UUID interno e tabela de identificadores externos;
- `tenant_id` validado no servidor em toda entidade comercial;
- eventos imutáveis e processadores idempotentes;
- provedor externo atrás de interface interna;
- segredo nunca armazenado em texto puro ou devolvido pela API.

## Critérios de aceite

- Diagrama e migrations propostas cobrem todos os dados comprovados no Marco 0.
- Contratos incluem exemplos, erros, versão e política de compatibilidade.
- Há testes de contrato planejados para FoodApp → Sales Engine e provedores.
- Nenhuma tabela ou API depende de nomes de aba ou colunas da planilha.

