# ADR-001 — Saída do Apps Script e publicação por Cloudflare Tunnel

- Status: proposto
- Data: 2026-10-10

## Contexto

O produto precisa deixar de depender de Apps Script e evoluir para uma aplicação multi-tenant com catálogo, pedidos, pagamentos, mensagens, arquivos, jobs e auditoria. Apps Script possui cotas e limite de tempo por execução, além de acoplar lógica de negócio à identidade e aos serviços do Google.

`cloudflared` resolve outra parte do problema: cria uma conexão de saída entre a infraestrutura privada e a rede Cloudflare. Ele publica serviços existentes, mas não executa a API, não persiste pedidos e não substitui autenticação, filas ou banco de dados.

## Decisão

Adotar inicialmente uma aplicação modular em uma VPS, empacotada com Docker Compose:

```text
Cliente
  -> Cloudflare DNS/WAF/CDN
  -> Cloudflare Tunnel (cloudflared)
  -> reverse proxy interno
      -> web (Next.js)
      -> api (Node.js + Fastify)
          -> PostgreSQL
          -> Redis/queue
          -> R2/S3
          -> provedores externos
```

Componentes:

- **Web:** Next.js + TypeScript, incluindo loja pública e painel, separados por rotas e autorização.
- **API:** Node.js + TypeScript + Fastify, organizada por módulos de domínio.
- **Banco:** PostgreSQL como fonte de verdade; toda entidade de tenant possui fronteira verificável no backend.
- **Fila/cache:** Redis + BullMQ para notificações, webhooks, reconciliação e tarefas demoradas.
- **Arquivos:** Cloudflare R2 ou outro S3 compatível.
- **Entrada pública:** Cloudflare Tunnel; nenhum banco, Redis ou painel interno exposto diretamente.
- **Automação:** n8n continua como orquestrador, nunca como fonte de verdade.

O primeiro deploy não será dividido em microserviços. Web, API e worker podem compartilhar o monorepo e imagens versionadas, mantendo módulos que possam ser separados depois.

## Por que não usar apenas Cloudflare Workers agora

Workers é uma alternativa válida para workloads HTTP compatíveis com edge, mas a especificação existente inclui processos, integrações e componentes já pensados para VPS. A VPS com Tunnel reduz a mudança inicial e mantém PostgreSQL/Redis/Evolution/n8n próximos. Funções específicas podem migrar para Workers depois, por decisão baseada em métricas.

## Fronteiras de segurança

- o tenant é resolvido por domínio/sessão e confirmado no servidor;
- `tenant_id` enviado pelo navegador nunca concede acesso por si só;
- credenciais de integração são cifradas e não retornam ao frontend;
- endpoints de webhook validam assinatura e usam chave de idempotência;
- rede Docker interna isola banco e Redis;
- Cloudflare Access protege painéis estritamente operacionais, não a loja pública;
- backup diário sai da VPS e restauração é testada.

## Estratégia de migração

Usar migração incremental, não uma troca total em um único dia:

1. Inventariar scripts, gatilhos, planilhas, formulários, integrações e identidades de execução.
2. Registrar contratos atuais: entradas, saídas, regras, erros e efeitos colaterais.
3. Modelar PostgreSQL e importar uma cópia sanitizada para homologação.
4. Criar a nova API e testes de paridade para as regras críticas.
5. Colocar um adaptador temporário diante do legado, se necessário.
6. Migrar primeiro leituras de catálogo; depois escrita administrativa; por último pedidos, pagamentos e automações.
7. Executar reconciliação entre legado e novo banco durante a janela de transição.
8. Virar o tráfego por rota/tenant, com rollback documentado.
9. Manter legado somente leitura durante retenção definida e então desativá-lo.

Evitar dual-write sem reconciliação: falhas parciais geram divergência silenciosa.

## Dados necessários para iniciar a execução

- arquivos `.gs`, HTML e manifesto do Apps Script;
- IDs e estrutura das planilhas, preferencialmente com uma cópia sem dados pessoais;
- lista de gatilhos instaláveis e agendados;
- URLs de web apps/webhooks e consumidores conhecidos;
- método atual de autenticação e perfis;
- integrações e segredos existentes, enviados somente por canal seguro;
- volume aproximado de produtos, pedidos e requisições diárias;
- domínio e infraestrutura/VPS disponíveis.

## Consequências

### Positivas

- remove cotas e tempos de execução específicos do Apps Script;
- habilita testes, versionamento, observabilidade e rollback convencionais;
- estabelece uma fonte de verdade adequada a multi-tenancy;
- `cloudflared` elimina a necessidade de abrir portas HTTP de entrada na VPS.

### Custos e riscos

- SamJoE passa a operar banco, filas, deploys, backups e incidentes;
- Tunnel não oferece alta disponibilidade se houver apenas uma VPS/origem;
- migração exige mapeamento cuidadoso de regras implícitas nas planilhas;
- coexistência temporária aumenta a complexidade e deve ter prazo de encerramento.

