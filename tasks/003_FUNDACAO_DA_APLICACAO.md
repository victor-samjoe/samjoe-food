# Tarefa 003 — Fundação da aplicação

Status: **em andamento**  
Prioridade: **alta**

## Objetivo

Criar a base executável e observável do FoodApp antes de migrar funcionalidades.

## Escopo

- [x] Inicializar monorepo TypeScript com `apps/web`, `apps/api` e `apps/worker`.
- [x] Criar pacotes de domínio, contratos, banco, integrações e configuração.
- [x] Configurar PostgreSQL, Redis/BullMQ e storage S3 compatível para ambiente local.
- [x] Implementar migration inicial e seed fictício; reset permanece restrito ao ambiente local.
- [x] Implementar tenant, usuários, memberships, sessões opacas e autorização inicial por papel.
- [x] Implementar health, readiness, logs estruturados e request ID.
- [x] Configurar base de testes unitários e plano de testes de integração/contrato.
- [x] Criar Docker Compose local com portas vinculadas somente a `127.0.0.1`.
- [x] Criar CI para typecheck, testes e build; lint e verificação automatizada de migrations ainda serão adicionados.
- [ ] Documentar configuração local, staging, backup e rollback.

## Critérios de aceite

- Um ambiente limpo sobe por procedimento documentado.
- Dois tenants fictícios passam em testes negativos de isolamento.
- Migrations funcionam em PostgreSQL real e não apenas em emulador.
- API e worker encerram corretamente e expõem sinais de saúde úteis.
- Nenhuma integração real é ativada por seed ou configuração padrão.

## Evidências atuais

- `npm run typecheck`: aprovado em todos os workspaces.
- `npm test`: 2 testes de transição de pedido aprovados.
- `npm run build`: API, web, worker e pacotes compilados; Next.js gerou as páginas estáticas.
- Smoke test local: `/health` e `/ready` responderam `200`; readiness confirmou integrações externas desabilitadas.
- Migration e seed: aprovados em PostgreSQL 17 temporário, com 32 tabelas.
- Catálogo público conectado ao PostgreSQL com dois tenants fictícios e identificadores públicos globais de loja.
- Teste negativo unitário e teste ponta a ponta confirmaram ausência de produtos cruzados entre `Doce Horizonte Demo` e `Sabor Nuvem Demo`.
- Readiness retorna indisponível sem banco e `database: ready` somente após consulta bem-sucedida.
- Login OWNER, sessão autenticada e rota administrativa foram aprovados em PostgreSQL real.
- Login do OWNER no tenant errado retornou `401`; VIEWER na rota administrativa retornou `403`.
- BullMQ processou `simulation.ping` em Redis real e registrou conclusão; integrações externas permaneceram desabilitadas.

