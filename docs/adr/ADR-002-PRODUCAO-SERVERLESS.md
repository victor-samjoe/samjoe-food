# ADR-002 — Produção serverless da SamJoE Food

- Status: aceito para implementação e homologação
- Data: 2026-10-11

## Contexto

A SamJoE Confeitaria, primeiro tenant da SamJoE Food, precisa permanecer online sem depender de notebook ou servidor local. O hostname legado `app.confeitaria.samjoe.com.br` já está publicado em Cloudflare Pages. Cloudflare Tunnel não resolve o requisito porque somente publica uma origem que precisa continuar ligada.

O plano gratuito Vercel Hobby é restrito a uso pessoal e não comercial. Vercel permanece uma alternativa apenas no plano Pro.

## Decisão

Adotar para o piloto:

```text
Cloudflare DNS/WAF
  -> Cloudflare Workers (Next.js)
      -> Supabase PostgreSQL
      -> Supabase Storage
      -> Supabase Cron / Edge Functions
```

O verificador do `vinext` classificou o frontend como 100% compatível, e as builds Next.js e Cloudflare passaram. O adaptador continua em beta e a auditoria de dependências encontrou alertas transitivos altos; portanto ele está aprovado para homologação, mas ainda não para o corte de produção. Vercel Pro permanece como contingência caso esses riscos não sejam resolvidos ou formalmente aceitos.

O Fastify não será tratado como processo persistente. Em 2026-10-12, o teste dentro do runtime real do Workers mostrou que o Fastify compila schemas com `eval/new Function` durante a inicialização da rota, operação bloqueada pelo isolamento do Cloudflare. O build isolado passava, mas a primeira chamada da API retornava erro 500.

A decisão implementada foi manter o Fastify no servidor Node e nos testes existentes, mas usar no Worker um adaptador HTTP nativo, sem geração dinâmica de código. O adaptador registra os mesmos handlers, schemas, regras SQL e transações. No smoke test do runtime Cloudflare, página e loja responderam 200, catálogo real do Supabase respondeu 200, acesso administrativo sem token respondeu 401 e entradas inválidas responderam 400.

BullMQ/Redis serão removidos do caminho de produção; tarefas periódicas migrarão para funções SQL idempotentes executadas pelo Supabase Cron.

## Domínios

- primeiro tenant: `app.confeitaria.samjoe.com.br`;
- fallback da plataforma: `food.samjoe.com.br/loja/{storeSlug}`;
- domínios próprios serão resolvidos por tabela verificada, nunca por identificador de tenant fornecido pelo navegador.

## Consequências

- nenhuma dependência de energia ou internet local;
- permanência nas camadas gratuitas durante o piloto, sem SLA;
- API adaptada ao runtime Workers sem duplicar regras de domínio; novos schemas HTTP precisam permanecer dentro do subconjunto validado pelo adaptador nativo;
- necessidade de limitar conexões e usar o pooler do Supabase;
- novo ciclo obrigatório de testes de concorrência, idempotência e isolamento;
- Vercel Pro permanece como plano de contingência se a adaptação Cloudflare não atingir os critérios de aceite.
- publicar apenas o frontend não basta: a API Fastify precisa ser adaptada para execução serverless ou hospedada em destino 24/7.
