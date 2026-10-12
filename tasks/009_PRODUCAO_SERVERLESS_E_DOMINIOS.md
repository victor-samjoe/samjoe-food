# Tarefa 009 — Produção serverless e domínios

Status: **em andamento**  
Prioridade: **crítica**

## Objetivo

Executar a SamJoE Food integralmente online, sem notebook ou VPS local, e permitir que cada loja possua slug e domínio configuráveis.

## Escopo

- [x] Registrar ADR da arquitetura Cloudflare Workers + Supabase.
- [x] Remover slug de loja e tenant de demonstração fixos no frontend.
- [x] Criar rota pública `/loja/[storeSlug]`.
- [x] Criar cadastro versionado de domínios por loja; a resolução por hostname permanece pendente.
- [ ] Preservar `app.confeitaria.samjoe.com.br` para a SamJoE Confeitaria.
- [x] Validar compatibilidade do Next.js com o runtime Cloudflare recomendado.
- [ ] Configurar preview e produção no Cloudflare Workers.
- [ ] Criar health check compatível com serverless.
- [ ] Configurar rate limiting e secrets de produção.
- [ ] Manter deployment Pages legado disponível para rollback durante o corte.

## Critérios de aceite

- Alterar slug ou domínio no banco não exige rebuild.
- Hostname desconhecido nunca recebe a loja padrão.
- Dois tenants passam em testes negativos de isolamento.
- Preview permanece online sem qualquer processo no notebook.
- Build local, build Cloudflare e smoke test remoto são aprovados.

## Dependências

- Conta Cloudflare autenticada.
- DNS de `samjoe.com.br` sob a conta correta.
- Tarefa 010 com banco remoto disponível antes do smoke test completo.

## Evidências de 2026-10-11

- `vinext check`: 100% compatível, sem itens parciais ou incompatíveis.
- Builds Next.js e vinext aprovadas; typecheck e 33 testes aprovados.
- Smoke local do Worker: `/` e `/loja/samjoe-confeitaria` retornaram 200; proxy do catálogo fictício retornou 200.
- A conta Cloudflare já está autenticada.
- Risco aberto: o adaptador vinext continua beta e `npm audit` reporta 6 vulnerabilidades altas e 4 moderadas em dependências transitivas. Homologação permitida; produção bloqueada até atualização, mitigação aceita ou adoção do plano Vercel Pro.
- Bloqueio funcional: a API Fastify ainda precisa de destino 24/7 ou adaptação serverless; publicar somente o frontend não conclui o sistema.

