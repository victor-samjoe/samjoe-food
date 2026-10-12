# Backlog de migração — SamJoE FoodApp

Este diretório organiza a substituição incremental do sistema legado em `E:\samjoe` pelo SamJoE FoodApp.

## Ordem de execução

1. `001_MARCO_0_DESCOBERTA_E_CONTROLE.md`
2. `002_CONTRATOS_E_MODELO_CANONICO.md`
3. `003_FUNDACAO_DA_APLICACAO.md`
4. `004_CATALOGO_EM_MODO_SOMBRA.md`
5. `005_PEDIDOS_ESTOQUE_E_CLIENTES.md`
6. `006_PAGAMENTOS_E_ENTREGAS.md`
7. `007_INTEGRACAO_COM_SALES_ENGINE.md`
8. `008_CUTOVER_E_DESATIVACAO_DO_LEGADO.md`
9. `009_PRODUCAO_SERVERLESS_E_DOMINIOS.md`
10. `010_SUPABASE_E_JOBS_GERENCIADOS.md`
11. `011_HOMOLOGACAO_E_CUTOVER_SAMJOE_CONFEITARIA.md`

## Regras de execução

- A fonte de verdade de cada domínio deve estar explícita durante toda a transição.
- Não fazer big bang nem dual-write sem outbox, idempotência e reconciliação.
- Nenhuma tarefa autoriza operação em produção, envio real ou uso de credenciais reais.
- Dados pessoais devem ser anonimizados antes de entrar em fixtures ou testes.
- Cada marco deve terminar com testes, evidências, riscos remanescentes e procedimento de rollback.
- Mudanças no legado devem ser evitadas e, quando inevitáveis, isoladas em adaptadores temporários.

## Estado atual

- Marco 0: **concluído para ambiente pré-produção simulado**.
- Contratos e modelo canônico: **concluído (v1 simulada)**.
- Fundação da aplicação: **em andamento**.
- Catálogo, pedidos, estoque, pagamentos e entregas: **concluídos em simulação local**.
- Produção serverless e domínios: **em andamento**.
- Supabase, homologação e cutover: **aguardando dependências**.

