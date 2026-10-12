# Plano mestre de migração — SamJoE FoodApp

## Objetivo

Substituir incrementalmente o sistema baseado em Apps Script e Google Sheets por uma aplicação multi-tenant, mantendo o serviço disponível e preservando rastreabilidade financeira e operacional.

## Estratégia

1. Caracterizar o legado antes de reproduzi-lo.
2. Definir modelo e contratos canônicos.
3. Construir a fundação isolada.
4. Migrar primeiro leituras de catálogo.
5. Transferir pedidos e estoque com uma única fonte de verdade.
6. Transferir pagamentos e entregas.
7. Integrar o Sales Engine por eventos confiáveis.
8. Cortar tráfego por capacidade e desativar o legado.

## Princípios de transição

- Nunca há duas fontes oficiais para o mesmo domínio no mesmo instante.
- Projeções temporárias são derivadas, observáveis e reconstruíveis.
- Toda chamada que pode se repetir é idempotente.
- Toda publicação externa nasce de uma outbox transacional.
- Toda entrada externa passa por inbox/deduplicação.
- Diferenças são reconciliadas e expostas; não são sobrescritas silenciosamente.
- Rollback muda roteamento e autoridade, sem apagar dados produzidos.

## Portões de decisão

### Gate A — Legado compreendido

Inventário, dados sanitizados e testes de caracterização aprovados.

### Gate B — Fundação confiável

Isolamento de tenant, migrations, backup, restauração e observabilidade aprovados.

### Gate C — Catálogo equivalente

Reconciliação sem diferenças críticas e loja pública validada em celular.

### Gate D — Pedido seguro

Concorrência de estoque, idempotência, preço e projeção operacional aprovados.

### Gate E — Financeiro seguro

Webhook, reconciliação, estorno e restauração aprovados.

### Gate F — Corte definitivo

Operação treinada, rollback ensaiado, métricas estáveis e divergências zeradas.

## Artefatos obrigatórios por marco

- decisão arquitetural ou atualização da existente;
- migrations e contratos versionados;
- testes e evidências de execução;
- dashboard/reconciliação aplicável;
- runbook de operação e rollback;
- riscos remanescentes e responsável.

