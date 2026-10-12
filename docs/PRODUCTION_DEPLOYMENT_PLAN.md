# SamJoE Food — plano de produção

**Status:** proposta para validação  
**Data:** 2026-10-11  
**Escopo inicial:** SamJoE Confeitaria como primeiro cliente da plataforma SamJoE Food  
**Responsável pela plataforma:** SamJoE Tech & Consulting

## 1. Identidade e separação de responsabilidades

Os nomes representam coisas diferentes e não devem ser misturados:

| Papel | Nome |
|---|---|
| Empresa que desenvolve e opera a tecnologia | SamJoE Tech & Consulting |
| Produto SaaS multi-tenant | SamJoE Food |
| Primeiro cliente/tenant | SamJoE Confeitaria |
| Primeira loja | SamJoE Confeitaria |

O nome público do produto passa a ser **SamJoE Food**. Identificadores técnicos existentes como pacotes `@foodapp/*`, tabelas e eventos `foodapp.*` podem permanecer durante a primeira migração para evitar quebra desnecessária de compatibilidade.

## 2. Endereços mutáveis por cliente

O endereço público não pode ficar fixo no código. Cada loja deverá possuir um `slug` configurável e, futuramente, zero ou mais domínios próprios.

Endereço canônico do primeiro cliente, já utilizado pelo sistema legado:

```text
https://app.confeitaria.samjoe.com.br
```

Formato de fallback da plataforma para qualquer cliente:

```text
https://food.samjoe.com.br/loja/{store_slug}
```

Um domínio próprio poderá apontar para a mesma loja posteriormente:

```text
https://pedido.dominio-do-cliente.com.br
```

O domínio é apenas uma forma de localizar a loja. A autorização e o isolamento sempre são decididos no servidor pelo `store_id` e `tenant_id`; um identificador enviado pelo navegador nunca concede acesso.

### 2.1 Alteração necessária no banco

O `slug` global já existe em `stores`, mas falta registrar domínios. Deve ser criada uma migration com uma tabela equivalente a:

```sql
CREATE TABLE store_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  hostname text NOT NULL UNIQUE,
  is_primary boolean NOT NULL DEFAULT false,
  status text NOT NULL CHECK (status IN ('PENDING', 'VERIFIED', 'DISABLED')),
  verification_token text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, store_id) REFERENCES stores(tenant_id, id)
);
```

Resolução de loja:

1. Procurar correspondência exata do `Host` em `store_domains`.
2. Se não houver domínio próprio, resolver `/loja/{store_slug}` pelo `stores.slug`.
3. Confirmar que tenant e loja estão ativos.
4. Carregar o catálogo exclusivamente dentro desse limite de tenant.
5. Redirecionar aliases para o endereço primário, quando configurado.

## 3. Topologia proposta para o primeiro cliente

### 3.0 Propriedade das contas e do código

- criar a organização Supabase **SamJoE** usando `victor.conceicao@samjoe.com.br` como proprietário principal;
- manter ao menos uma segunda identidade de recuperação com MFA, observando que proprietários e administradores podem afetar a cota de projetos gratuitos;
- criar uma organização GitHub da SamJoE e manter repositórios privados nela; não usar uma credencial compartilhada como conta da empresa;
- transferir o repositório pessoal para a organização quando ele contiver somente o produto SamJoE Food; se estiver misturado com outros trabalhos, criar um repositório privado novo e migrar apenas este histórico;
- revisar secrets, integrações e deploys após qualquer transferência de repositório.

```text
Internet
   |
Cloudflare DNS, TLS, WAF e rate limiting
   |
Cloudflare Workers + adaptador Next.js validado
   |
Next.js + endpoints HTTP adaptados para serverless
   |
   `-- Supabase
       |-- PostgreSQL
       |-- Storage
       |-- Cron/pg_cron
       `-- Edge Functions quando necessário
```

### 3.1 O que cada serviço faz

- **Supabase:** hospeda PostgreSQL, arquivos/imagens e tarefas agendadas.
- **Cloudflare Workers:** executa o Next.js e os endpoints HTTP sem depender do notebook. O adaptador será escolhido após o teste de compatibilidade; a documentação atual recomenda `vinext` para Next.js 16, mas ele ainda está em beta.
- **Cloudflare DNS:** continua administrando os hostnames do domínio registrado no Registro.br.
- **Supabase Cron/pg_cron:** assume expiração de reservas, reconciliação e consumo controlado da outbox que hoje dependem do worker BullMQ.
- **Supabase Edge Functions:** opção para webhooks ou integrações curtas que não devam ficar dentro do Next.js.

### 3.2 Limite importante

Cloudflare Tunnel não será usado na aplicação principal porque não haverá uma origem local. O Tunnel somente publica algo que já esteja executando em uma máquina; usá-lo manteria dependência do notebook ou de uma VPS.

Para cumprir o requisito de permanecer online sem o notebook, o primeiro deploy exige uma adaptação serverless antes do cutover:

- publicar o Next.js com o adaptador validado para Cloudflare Workers;
- adaptar as rotas Fastify para route handlers do Next.js ou para um Worker HTTP compatível;
- substituir BullMQ/Redis por funções SQL idempotentes agendadas no Supabase Cron;
- mover integrações assíncronas mais complexas para Edge Functions ou filas gerenciadas quando forem ativadas;
- usar conexão apropriada para serverless e limitar conexões ao PostgreSQL.

### 3.3 Alternativa Vercel

A Vercel suporta Next.js e transforma uma aplicação Fastify em Vercel Function. Tecnicamente é uma alternativa válida para web e API. Entretanto, o plano gratuito Hobby é limitado pela própria Vercel a uso pessoal e não comercial. Como SamJoE Confeitaria é cliente comercial, a opção correta na Vercel é o plano Pro.

Mesmo no Pro, o worker BullMQ não pode permanecer executando continuamente como hoje. As tarefas agendadas ainda deverão migrar para Supabase Cron/Edge Functions ou outro serviço de jobs.

Decisão inicial:

- **caminho gratuito e totalmente online:** Cloudflare Workers + Supabase;
- **caminho com menor adaptação do Fastify, mas pago:** Vercel Pro + Supabase;
- **não usar:** Vercel Hobby para produção comercial ou Cloudflare Tunnel sem uma origem 24/7.

## 4. Decisões antes de executar

Confirmar e registrar em ADR:

- [ ] A aplicação será executada sem dependência do notebook.
- [ ] O primeiro endereço continuará sendo `app.confeitaria.samjoe.com.br` durante a migração.
- [ ] A plataforma também suportará `food.samjoe.com.br/loja/{slug}` e domínios próprios.
- [ ] O banco será Supabase PostgreSQL.
- [ ] As imagens ficarão no Supabase Storage.
- [ ] BullMQ/Redis serão removidos do caminho de produção e substituídos por Supabase Cron.
- [ ] Cloudflare Workers será o alvo gratuito; Vercel exigirá Pro.
- [ ] Pagamentos online e WhatsApp permanecerão desativados até homologação específica.
- [ ] O plano gratuito será tratado como piloto sem SLA.
- [ ] Haverá orçamento ou plano de migração caso o piloto passe a ser operação crítica.

## 5. Passo a passo de preparação

### Etapa 1 — Repositório e controle de versão

1. Confirmar o repositório Git oficial.
2. Criar branches protegidas para produção.
3. Garantir que `.env`, tokens, dumps e credenciais não sejam versionados.
4. Criar CI com `npm ci`, `npm run typecheck`, `npm test` e `npm run build`.
5. Versionar cada release com commit e tag recuperável.

**Critério de saída:** build e testes obrigatórios antes de qualquer deploy.

### Etapa 2 — Rebranding

1. Alterar textos públicos de “SamJoE FoodApp” para “SamJoE Food”.
2. Atualizar título, descrição, tela inicial, painel e rodapé.
3. Remover textos “simulação local” do build de produção.
4. Adicionar marca da plataforma separada da identidade visual do tenant.
5. Configurar SamJoE Confeitaria como tenant, sem transformar seu nome em nome global da plataforma.

**Critério de saída:** nenhuma tela pública confunde SamJoE Food, SamJoE Confeitaria e SamJoE Tech & Consulting.

### Etapa 3 — Tornar a loja dinâmica

1. Remover `STORE_SLUG = 'doce-horizonte-centro'` do storefront e do painel.
2. Resolver o slug a partir da rota `/loja/[storeSlug]`.
3. Criar `store_domains` e resolução pelo hostname.
4. Remover `tenant_slug`, e-mail e credenciais demo fixos do login.
5. Fazer o usuário escolher ou receber a loja autorizada após autenticação.
6. Testar dois tenants com slugs e domínios diferentes.

**Critério de saída:** trocar o slug ou domínio no banco não exige rebuild da aplicação.

### Etapa 4 — Criar o projeto Supabase

1. Criar uma organização controlada pela SamJoE Tech & Consulting.
2. Criar um projeto exclusivo do ambiente de produção.
3. Selecionar a região adequada aos usuários e às exigências de dados.
4. Guardar a senha do banco e chaves em cofre seguro.
5. Copiar a URI pelo painel **Connect**.
6. Para Cloudflare Workers ou Vercel Functions, usar a conexão indicada pelo Supabase para ambiente serverless, normalmente o transaction pooler, com SSL e pool mínimo.
7. Exigir SSL na conexão.
8. Criar um papel de aplicação com somente as permissões necessárias; não executar a aplicação diariamente como superusuário.
9. Aplicar as migrations em ordem e registrar migrations já executadas.
10. Não aplicar `database/seeds/0001_demo.sql` em produção.

Variáveis mínimas:

```text
NODE_ENV=production
DATABASE_URL=<segredo do transaction pooler com SSL>
TRACKING_TOKEN_SECRET=<segredo aleatório forte>
EXTERNAL_INTEGRATIONS_ENABLED=false
CORS_ORIGIN=https://app.confeitaria.samjoe.com.br,https://food.samjoe.com.br
```

Nunca colocar `SUPABASE_SERVICE_ROLE_KEY`, senha do banco ou outros segredos em variáveis `NEXT_PUBLIC_*`.

### Etapa 5 — Configurar Storage

1. Criar bucket privado para originais e, se necessário, bucket público para imagens publicadas.
2. Definir caminhos por tenant e loja, por exemplo:

```text
tenants/{tenant_id}/stores/{store_id}/products/{product_id}/{arquivo}
```

3. Validar tipo MIME, extensão e tamanho no backend.
4. Gerar nomes de objeto no servidor.
5. Não aceitar `tenant_id` do navegador como autorização.
6. Persistir somente metadados e `object_key` no PostgreSQL.
7. Testar exclusão, substituição, cache e ausência de imagem.

### Etapa 6 — Adaptar a execução para serverless

1. Executar o verificador `vinext check` recomendado pela Cloudflare para Next.js 16 e comparar os bloqueios com OpenNext. **Resultado em 2026-10-11:** 100% compatível; builds Next.js e vinext aprovadas.
2. Criar `wrangler.jsonc` com ambientes separados para preview e produção.
3. Adaptar a inicialização do Fastify: nenhuma função serverless deve chamar `listen()` ou depender de processo permanente.
4. Escolher uma das implementações HTTP:
   - mover as rotas para route handlers do Next.js; ou
   - criar um Worker de API separado com as mesmas regras de domínio.
5. Preservar as transações PostgreSQL do checkout em uma única invocação.
6. Usar o transaction pooler do Supabase e limitar o pool por instância.
7. Remover Redis/BullMQ do runtime de produção.
8. Transformar expiração de reservas e reconciliação em funções SQL idempotentes.
9. Agendar essas funções com Supabase Cron e versionar os jobs em migration.

> Gate de produção: embora a compatibilidade funcional tenha sido aprovada, o vinext permanece beta e a auditoria atual reportou 6 alertas altos e 4 moderados em dependências transitivas. Usar em homologação; antes do corte, atualizar/mitigar os alertas ou optar por Vercel Pro.
10. Manter outbox/inbox no PostgreSQL; cada consumidor deve possuir lock, tentativas e idempotência.
11. Confirmar que nenhum handler depende de filesystem persistente ou estado em memória.
12. Executar novamente testes de concorrência, idempotência, pagamentos e isolamento de tenant no ambiente remoto.

### Etapa 7 — Publicar na Cloudflare

1. Confirmar que os nameservers de `samjoe.com.br` apontam para a conta Cloudflare correta. O domínio pode continuar registrado no Registro.br; não é necessário transferi-lo.
2. Criar o projeto Worker da SamJoE Food com o adaptador aprovado nos testes.
3. Configurar segredos com `wrangler secret` ou pelo painel, nunca no repositório.
4. Publicar primeiro em hostname de preview.
5. Validar web, API, migrations e Supabase no preview.
6. Adicionar as rotas de produção sem alterar ainda o hostname legado.
7. No cutover, trocar `app.confeitaria.samjoe.com.br` do projeto Pages legado para o novo Worker.
8. Publicar `food.samjoe.com.br` como entrada institucional/multi-tenant.
9. Aplicar rate limiting em login, checkout, consulta de cliente e webhooks.
10. Validar TLS, cache, headers e IP real do cliente.
11. Manter o deployment antigo do Cloudflare Pages disponível para rollback rápido durante a estabilização.

Para domínios próprios de clientes, criar processo separado de:

1. cadastro `PENDING`;
2. entrega do registro DNS de verificação;
3. confirmação de propriedade;
4. emissão/ativação de TLS;
5. mudança para `VERIFIED`;
6. definição do endereço primário e redirecionamentos.

### Etapa 8 — Criar SamJoE Confeitaria

1. Inserir tenant `samjoe-confeitaria`.
2. Inserir loja `samjoe-confeitaria`.
3. Criar usuário OWNER real com senha temporária forte.
4. Exigir troca da senha no primeiro acesso.
5. Configurar endereço, horários, retirada, entrega e moeda.
6. Configurar identidade visual da confeitaria.
7. Importar catálogo com `dry-run`.
8. Migrar imagens para Storage.
9. Executar importação real.
10. Rodar reconciliação de produtos, preços, disponibilidade e estoque.

### Etapa 9 — Fechar segurança de produção

Antes do deploy, a aplicação deve falhar ao iniciar se:

- `TRACKING_TOKEN_SECRET` estiver ausente ou com valor local;
- `DATABASE_URL` apontar para localhost;
- segredos do Mercado Pago estiverem com valores demo quando a integração estiver ativa;
- CORS estiver aberto sem intenção;
- credenciais demo estiverem habilitadas.

Também é obrigatório:

- rate limit de autenticação e checkout;
- expiração e revogação de sessão;
- recuperação segura de acesso;
- auditoria das ações administrativas;
- sanitização dos logs;
- validação de raw body e assinatura de webhooks;
- consulta do pagamento no provedor antes de confirmar estado;
- revisão LGPD e política de retenção.

### Etapa 10 — Backups

O plano gratuito do Supabase não deve ser a única cópia dos dados.

1. Executar diariamente `supabase db dump` ou `pg_dump` usando usuário restrito de backup.
2. Criptografar o dump.
3. Armazenar uma cópia fora do projeto Supabase, por exemplo Cloudflare R2.
4. Manter retenção diária, semanal e mensal.
5. Exportar também os objetos do Storage; o backup do banco contém metadados, não os arquivos.
6. Testar restauração em ambiente separado antes do go-live.
7. Alertar quando backup ou verificação falhar.

**Critério de saída:** existe evidência de restauração, não apenas de criação do arquivo.

### Etapa 11 — Monitoramento

Monitorar no mínimo:

- `https://app.confeitaria.samjoe.com.br`;
- endpoint de health da nova aplicação;
- readiness do banco;
- erros e limites do Cloudflare Worker;
- consumo e eventual pausa do projeto Supabase;
- histórico e falhas do Supabase Cron;
- jobs falhos;
- backups;
- webhooks e pagamentos.

Configurar um destino de alerta que não dependa da própria aplicação monitorada.

## 6. Escopo seguro do primeiro go-live

Ativar inicialmente:

- catálogo;
- produtos e disponibilidade;
- carrinho;
- pedidos;
- estoque;
- retirada e entrega;
- painel operacional;
- dinheiro e Pix manual, se aprovados operacionalmente.

Manter desativados até homologação separada:

- Mercado Pago real;
- Evolution/WhatsApp;
- campanhas e envios n8n;
- Sales Engine;
- automações Jarvis com escrita;
- qualquer credencial externa copiada do legado sem rotação.

## 7. Homologação

Executar em staging ou em uma loja piloto não divulgada:

- [ ] Typecheck, testes e build aprovados.
- [ ] Migrations aplicadas do zero e incrementalmente.
- [ ] Isolamento negativo entre pelo menos dois tenants.
- [ ] URL por slug funcionando sem hardcode.
- [ ] Domínio desconhecido retorna 404 e não a loja padrão.
- [ ] Layout validado em celulares reais.
- [ ] Pedido idempotente.
- [ ] Concorrência de estoque.
- [ ] Cancelamento libera reserva.
- [ ] Falha de função ou limite do provedor apresenta resposta controlada.
- [ ] Supabase indisponível não cria pedido incompleto.
- [ ] Backup restaurado com sucesso.
- [ ] Rollback de aplicação ensaiado.
- [ ] Dados e preços reconciliados com a origem.

## 8. Cutover da SamJoE Confeitaria

1. Definir janela e responsáveis.
2. Fazer backup do legado e do novo banco.
3. Congelar alterações de catálogo no legado.
4. Executar importação incremental final.
5. Reconciliar produtos, preços, estoque e pedidos abertos.
6. Fazer smoke test pelo endereço público.
7. Alterar o link divulgado para o endereço da SamJoE Confeitaria.
8. Manter o legado disponível somente para consulta durante a estabilização.
9. Observar erros, jobs, pedidos e limites do Worker/Supabase.
10. Após aceite, revogar triggers, webhooks e credenciais antigas.

## 9. Rollback

O rollback não apaga dados produzidos.

1. Interromper novos pedidos na aplicação nova.
2. Restaurar o link/roteamento anterior.
3. Exportar pedidos recebidos durante a janela.
4. Reconciliar manualmente qualquer pedido em trânsito.
5. Reverter a imagem da aplicação para a versão anterior quando o problema for código.
6. Restaurar banco somente quando houver corrupção comprovada e após preservar uma cópia do estado atual.
7. Registrar causa, impacto e decisão de nova tentativa.

## 10. Limites do plano gratuito

Na data deste documento, o Supabase Free informa dois projetos ativos, 500 MB de banco, 1 GB de Storage e 5 GB de egress. Projetos com baixa atividade podem ser pausados. A própria documentação recomenda que projetos gratuitos façam dumps regulares e mantenham backups externos.

O plano gratuito é adequado para validação e primeiro piloto de baixo volume, mas não representa SLA. Os gatilhos para sair do gratuito são:

- risco operacional por pausa ou indisponibilidade;
- banco, Storage ou egress próximos do limite;
- necessidade de backups gerenciados/PITR;
- aumento de pedidos ou clientes;
- necessidade de suporte e prazo formal de recuperação;
- limites ou disponibilidade dos planos gratuitos deixarem de ser aceitáveis.

## 11. Fontes técnicas

- Cloudflare Tunnel — publicação de aplicações: <https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/>
- Cloudflare Tunnel — arquivo de configuração e wildcard: <https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/configuration-file/>
- Cloudflare Workers — Next.js e adaptadores atuais: <https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/>
- Vercel — plano Hobby e restrição a uso não comercial: <https://vercel.com/docs/plans/hobby>
- Vercel — suporte oficial a Fastify: <https://vercel.com/docs/frameworks/backend/fastify>
- Vercel — configuração de domínio com DNS externo: <https://vercel.com/docs/domains/set-up-custom-domain>
- Supabase — planos e cotas: <https://supabase.com/docs/guides/platform/billing-on-supabase>
- Supabase — pausa de projetos gratuitos: <https://supabase.com/docs/guides/platform/free-project-pausing>
- Supabase — backups: <https://supabase.com/docs/guides/platform/backups>
- Supabase — conexões serverless e pooler: <https://supabase.com/docs/guides/database/connecting-to-postgres/serverless-drivers>
- Supabase — Cron: <https://supabase.com/docs/guides/cron/quickstart>

## 12. Decisão de hospedagem

Antes de implementar o deploy, confirmar uma das opções:

### Opção A — recomendada para custo zero

Supabase + Cloudflare Workers + Supabase Cron.

- permanece online sem notebook;
- pode iniciar nas camadas gratuitas;
- é compatível com o domínio já administrado na Cloudflare;
- exige adaptar Fastify e substituir BullMQ/Redis;
- demanda novo ciclo de testes de concorrência, transações e webhooks;
- não possui SLA nos planos gratuitos.

### Opção B — menor adaptação de backend, com custo

Supabase + Vercel Pro para Next.js e Fastify + Supabase Cron.

- permanece online sem notebook;
- Fastify possui suporte oficial na Vercel;
- mantém mais da API Node existente;
- ainda exige substituir o worker contínuo;
- possui custo mensal do Vercel Pro.

### Opção C — rejeitada para este requisito

Supabase + Cloudflare Tunnel + notebook/origem local.

- mantém mais componentes atuais;
- fica offline quando a origem, energia ou internet local falhar;
- não atende ao requisito declarado.

Para a SamJoE Confeitaria, seguir a **Opção A** se custo zero for obrigatório. Se a prioridade for reduzir a adaptação do Fastify e houver orçamento mensal, seguir a **Opção B**. Não usar Vercel Hobby, pois a documentação da Vercel restringe esse plano a uso pessoal e não comercial.
