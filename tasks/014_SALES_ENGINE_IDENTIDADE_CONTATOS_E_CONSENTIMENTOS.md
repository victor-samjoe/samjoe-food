# Tarefa 014 — Identidade, contatos e consentimentos do Sales Engine

Status: **pronta para planejamento técnico**
Prioridade: **alta**

## Objetivo

Entregar o primeiro módulo utilizável do Sales Engine com autenticação, isolamento por tenant, cadastro de contatos e histórico auditável de consentimentos.

## Escopo de dados

- [ ] Definir modelo de organização, tenant, usuário, associação e papel.
- [ ] Definir contato, canais normalizados, origem e vínculo com cliente do FoodApp.
- [ ] Definir finalidade, base legal, estado e evidência de consentimento.
- [ ] Registrar concessão, revogação, origem, timestamp e ator sem sobrescrever histórico.
- [ ] Definir política de retenção, anonimização e exclusão compatível com LGPD.
- [ ] Criar migrations versionadas no schema `sales_engine`.

## Escopo de aplicação

- [ ] Implementar autenticação sem compartilhar credenciais do FoodApp.
- [ ] Implementar autorização por tenant e papel em todas as rotas privadas.
- [ ] Criar endpoints para contatos, busca, atualização e deduplicação.
- [ ] Criar endpoints para registrar e consultar consentimentos.
- [ ] Implementar idempotência para eventos e importações.
- [ ] Produzir trilha de auditoria das alterações sensíveis.
- [ ] Definir contrato versionado para eventos vindos do FoodApp.
- [ ] Garantir que indisponibilidade do Sales Engine nunca bloqueie checkout.

## Segurança e operação

- [ ] Usar a role `sales_engine_app` com privilégio mínimo via Hyperdrive próprio.
- [ ] Impedir acesso cruzado entre tenants com testes positivos e negativos.
- [ ] Validar entradas, limitar paginação e aplicar rate limiting nas rotas expostas.
- [ ] Manter segredos apenas no ambiente do Worker.
- [ ] Criar logs estruturados sem dados pessoais ou tokens.
- [ ] Adicionar health check de dependências e métricas operacionais.

## Testes e entrega

- [ ] Criar testes unitários do domínio de consentimento.
- [ ] Criar testes de integração do banco e migrations.
- [ ] Criar testes de contrato FoodApp → Sales Engine.
- [ ] Criar testes de isolamento e autorização por tenant.
- [ ] Publicar em preview e executar smoke test sem contatos reais.
- [ ] Documentar API, rollback de migration e procedimento de deploy.

## Critérios de aceite

- Usuário acessa somente tenants e operações autorizados.
- Contatos duplicados são tratados de forma determinística e auditável.
- Consentimento nunca é inferido e toda mudança preserva histórico.
- Reenvio do mesmo evento não cria efeitos duplicados.
- Testes não usam dados pessoais reais nem disparam campanhas.
- CI, migration, deploy e smoke test passam no ambiente publicado.
