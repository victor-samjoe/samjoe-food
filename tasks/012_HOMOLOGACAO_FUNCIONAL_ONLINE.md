# Tarefa 012 — Homologação funcional online

Status: **pronta para execução**
Prioridade: **crítica**

## Objetivo

Validar o fluxo completo da SamJoE Confeitaria no ambiente publicado antes de alterar o domínio usado pelo cliente.

## Dependências

- Worker `samjoe-food-web` publicado e saudável.
- Supabase e Hyperdrive de produção técnica disponíveis.
- Usuário OWNER de homologação criado com credencial temporária.
- Pagamentos, mensagens e integrações reais mantidos desativados.

## Escopo

- [ ] Criar ou confirmar usuário OWNER pelo fluxo da Tarefa 016, com troca obrigatória de senha.
- [ ] Validar login, logout, sessão expirada e recuperação de acesso.
- [ ] Confirmar isolamento do tenant `samjoe-confeitaria` com teste negativo de outro tenant.
- [ ] Validar catálogo público, imagens, preços, disponibilidade e produtos arquivados.
- [ ] Validar navegação mobile e desktop na rota `/loja/samjoe-confeitaria`.
- [ ] Montar carrinho, alterar quantidades e conferir totais e observações.
- [ ] Criar pedido com pagamento simulado, sem cobrança real.
- [ ] Confirmar reserva/baixa de estoque e proteção contra pedido duplicado.
- [ ] Localizar e atualizar o pedido no painel administrativo.
- [ ] Validar cancelamento e liberação de estoque quando aplicável.
- [ ] Conferir datas e filtros usando `America/Sao_Paulo`.
- [ ] Executar verificação básica de acessibilidade e performance.
- [ ] Registrar evidências, horário, usuário, pedido de teste e resultado de cada cenário.
- [ ] Remover ou identificar claramente os dados de homologação após o aceite.

## Critérios de aceite

- Todos os cenários críticos passam sem erro de aplicação ou divergência de dados.
- Nenhuma cobrança, mensagem ou integração externa real é acionada.
- O teste confirma isolamento entre tenants.
- O sistema permanece acessível com o notebook desligado.
- Falhas encontradas possuem tarefa, severidade, responsável e decisão de bloqueio.
- A Tarefa 013 só pode começar após aceite explícito desta homologação.

## Evidências esperadas

- Checklist preenchido com data e executor.
- IDs dos pedidos de teste e consultas de reconciliação.
- Capturas das telas críticas sem exposição de senha ou dado pessoal real.
- Resultado dos health checks antes e depois dos testes.
