# Tarefa 008 — Produção online e Sales Engine

Status: **em andamento**
Atualização: 12/10/2026

## FoodApp

- [x] Auditar alterações do painel e da loja feitas após o último deploy.
- [x] Corrigir schema e migration de arquivamento de produtos.
- [x] Ocultar produtos arquivados no catálogo e sugestões públicas.
- [x] Corrigir validação do fundo configurável do destaque.
- [x] Corrigir filtro de pedidos para `America/Sao_Paulo`.
- [x] Aplicar migration `0020` no Supabase staging.
- [x] Criar e vincular Hyperdrive ao Worker.
- [x] Atualizar a credencial e substituir o Hyperdrive antigo por `samjoe-food-production`.
- [x] Usar o Session Pooler do Supabase (`5432`) e obter catálogo HTTP 200.
- [ ] Validar login, catálogo, checkout e painel em smoke test online.
- [ ] Configurar domínio da loja somente após o smoke test completo.

Detalhamento: Tarefas `012_HOMOLOGACAO_FUNCIONAL_ONLINE.md` e `013_CUTOVER_DOMINIO_SAMJOE_CONFEITARIA.md`.

## Sales Engine

- [x] Confirmar que o repositório oficial estava vazio.
- [x] Criar inventário, análise de lacunas e arquitetura.
- [x] Criar fundação FastAPI para Cloudflare Python Workers.
- [x] Criar migration inicial isolada no schema `sales_engine`.
- [x] Criar teste de health e pipeline GitHub Actions.
- [x] Publicar o primeiro commit no repositório oficial.
- [x] Validar CI e corrigir qualquer incompatibilidade do runtime.
- [x] Aplicar migration após validar a credencial do banco.
- [ ] Implementar autenticação, tenant, contatos e consentimentos.
- [x] Publicar Worker `samjoe-sales-engine` e executar smoke test de health.

Detalhamento: Tarefa `014_SALES_ENGINE_IDENTIDADE_CONTATOS_E_CONSENTIMENTOS.md`.

## Regra operacional

Nenhuma mensagem real, contato real, cobrança ou mudança de DNS será executada antes dos testes de staging e da autorização operacional específica.

## Estado publicado em 12/10/2026

- Worker: `samjoe-food-web`.
- Versão: `ce4b3548-5c2c-4b05-b7dd-ee76f743aacf`.
- URL técnica: `https://samjoe-food-web.victor-conceicao.workers.dev`.
- Smoke técnico: catálogo, vitrine e painel responderam HTTP 200.
- O domínio `app.confeitaria.samjoe.com.br` ainda aponta para o sistema legado; a troca de DNS permanece pendente até validar login e checkout.
- O deploy agora reconstrói o pacote da API antes de empacotar o Worker.
- Sales Engine publicado em `https://samjoe-sales-engine.victor-conceicao.workers.dev`.
- Versão do Sales Engine: `73de7686-b6ba-40e8-99fb-1ccd84b98899`.
- Schema `sales_engine`, role `sales_engine_app` com privilégios mínimos e Hyperdrive próprio configurados.
- O empacotamento Python no Windows precisa ser executado temporariamente no drive `C:` por limitação conhecida do Pyodide quando o projeto está em outro drive.
