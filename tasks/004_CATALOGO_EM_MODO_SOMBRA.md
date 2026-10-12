# Tarefa 004 — Catálogo em modo sombra

Status: **concluída (simulação local)**
Prioridade: **alta**

## Objetivo

Migrar a leitura de catálogo, disponibilidade e imagens antes de transferir a criação de pedidos.

## Escopo

- [x] Criar importador com `dry_run`, relatório de erros e reexecução idempotente.
- [x] Importar categorias, produtos, SKU, preço, disponibilidade e imagens.
- [x] Manter tabela de correspondência com `produto_id` legado.
- [x] Implementar APIs administrativa e pública de catálogo.
- [x] Implementar painel mínimo para manutenção de produtos.
- [x] Criar comparação automática entre catálogo legado e FoodApp.
- [ ] Publicar loja nova inicialmente em rota/hostname de homologação.
- [ ] Medir paridade, performance, acessibilidade e comportamento mobile.

## Decisões

- `external_identifiers` (source=`legacy-sheets`) rastreia `produto_id` → UUID.
- Catálogo público agrupado por categoria; variante TRACKED sem estoque = `available: false`.
- `image_url: null` em toda variante — sem S3 ainda.
- Painel admin em `apps/web/app/admin/products/page.tsx` (client component; login via `/v1/auth/login`).
- Importador idempotente: re-execução pula entidades com `external_identifiers` existente.
- Reconciliador sai com código 1 se houver divergentes ou ausentes.

## Artefatos criados

- `fixtures/legacy-catalog.json` — catálogo legado simulado (Doce Horizonte Demo).
- `scripts/import-catalog.ts` — importador; `npm run import:catalog [-- --dry-run]`.
- `scripts/reconcile-catalog.ts` — reconciliação; `npm run reconcile:catalog`.
- `apps/api/src/catalog-admin.ts` — rotas admin CRUD de produtos e variantes.
- `apps/api/src/catalog.ts` — catálogo público com categorias + disponibilidade por inventário.
- `apps/web/app/admin/products/page.tsx` — painel web mínimo.
- `apps/api/test/catalog-admin.test.ts` — 7 testes de rotas admin.

## Critérios de aceite

- [x] Catálogo importado é reconciliável item a item.
- [x] Diferenças aparecem em relatório e não são corrigidas silenciosamente.
- [x] Loja suporta ausência de imagem e produto indisponível.
- [x] O legado continua responsável pelos pedidos durante todo este marco.
- [x] Rollback de leitura exige apenas reversão de rota/configuração.

## Evidências

- `npm run typecheck`: aprovado em todos os workspaces.
- `npm test`: 12 testes aprovados (7 novos admin + 5 de catálogo público/checkout).
- Importador testado com `--dry-run` em modo offline.
- Reconciliador lê `external_identifiers` e compara nome, descrição, preço e disponibilidade.
