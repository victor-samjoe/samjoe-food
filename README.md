# SamJoE FoodApp

Fundação local do FoodApp, construída para simulação com dados fictícios. Nenhuma integração externa é habilitada por padrão.

## Requisitos

- Node.js 22+
- npm
- Docker Desktop com Compose

## Verificação rápida

```powershell
npm install
npm run typecheck
npm test
npm run build
```

## Infraestrutura local

Copie `.env.example` para `.env` apenas no ambiente local. Os serviços são publicados exclusivamente em `127.0.0.1`:

```powershell
docker compose up -d
docker compose ps
```

Na primeira criação do volume, PostgreSQL executa `database/migrations/0001_canonical_model.sql`. Para carregar o seed fictício:

```powershell
Get-Content -Raw database/seeds/0001_demo.sql | docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U foodapp -d foodapp
```

## Aplicações

```powershell
npm run dev:api
npm run dev:web
npm run dev:worker
```

- Web: `http://127.0.0.1:3000`
- API: `http://127.0.0.1:3001`
- Health: `http://127.0.0.1:3001/health`
- Readiness: `http://127.0.0.1:3001/ready`

Catálogos fictícios disponíveis após aplicar o seed:

- `http://127.0.0.1:3001/v1/public/stores/doce-horizonte-centro/catalog`
- `http://127.0.0.1:3001/v1/public/stores/sabor-nuvem-jardins/catalog`

Credenciais exclusivamente locais do seed:

- OWNER de `doce-horizonte-demo`: `admin@doce-horizonte.example.test` / `demo-local-only`;
- VIEWER de `sabor-nuvem-demo`: `viewer@sabor-nuvem.example.test` / `demo-local-only`.

Essas credenciais são deliberadamente fictícias e não devem ser reutilizadas fora do ambiente local.

Para testar um job BullMQ fictício com o worker ativo:

```powershell
npm run enqueue:demo -w @foodapp/worker
```

O teste de concorrência do checkout exige API e banco local ativos, com o estoque do SKU demo ajustado para uma unidade:

```powershell
node scripts/test-checkout-concurrency.mjs
```

O resultado esperado é uma criação `201`, uma rejeição `409` por estoque e replay idempotente `200` do pedido vencedor.

## Segurança do ambiente simulado

- `EXTERNAL_INTEGRATIONS_ENABLED=false` é o padrão.
- O seed usa apenas nomes inventados, domínio `example.test` e identificadores determinísticos.
- Não copie `.env`, tokens ou chaves de `E:\samjoe`.
- O reset de volumes deve ser usado somente no projeto local e nunca será um comando padrão da aplicação.

