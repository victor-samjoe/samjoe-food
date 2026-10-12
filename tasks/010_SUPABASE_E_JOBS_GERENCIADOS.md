# Tarefa 010 — Supabase e jobs gerenciados

Status: **em andamento**  
Prioridade: **crítica**

## Objetivo

Transferir persistência, imagens e tarefas periódicas para serviços gerenciados, removendo PostgreSQL, Redis e worker contínuo da máquina local.

## Escopo

- [x] Criar projeto Supabase de staging em São Paulo; produção permanece pendente até o aceite.
- [ ] Criar organização oficial SamJoE com `victor.conceicao@samjoe.com.br` como proprietário principal e MFA habilitado.
- [x] Implementar runner versionado de migrations.
- [ ] Aplicar modelo canônico sem seed de demonstração em produção.
- [ ] Usar conexão serverless pelo transaction pooler com SSL e pool mínimo.
- [ ] Criar papel de aplicação com menor privilégio.
- [ ] Configurar Supabase Storage e caminhos isolados por tenant.
- [ ] Migrar imagens base64/URLs para objetos do Storage.
- [x] Converter expiração de reservas em função SQL idempotente.
- [x] Converter expiração de pagamentos simulados em função SQL idempotente.
- [x] Configurar Supabase Cron e histórico de execução.
- [ ] Implementar backup lógico e cópia externa dos objetos.
- [ ] Ensaiar restauração em projeto separado.

## Critérios de aceite

- Checkout concorrente continua sem overselling.
- Jobs podem repetir sem aplicar efeito duplicado.
- Aplicação não depende de Redis/BullMQ em produção.
- Backup de banco e arquivos é restaurável.
- Segredos administrativos nunca chegam ao navegador.

## Evidências de 2026-10-11

- As 11 migrations foram aplicadas em PostgreSQL 16 descartável e reaplicadas sem duplicação.
- Foram verificadas as funções `expire_inventory_reservations` e `expire_simulated_payments`.
- A CLI Supabase 2.120.0 está disponível e autenticada.
- Staging oficial `samjoe-food-staging` (`ikboutpjeayqnamuhmqo`) criado em `sa-east-1` e vinculado à CLI.
- As 12 migrations estão sincronizadas no histórico remoto; 38 tabelas públicas foram verificadas.
- Jobs `foodapp-expire-inventory-reservations` e `foodapp-expire-simulated-payments` estão ativos.

