# SamJoE FoodApp — Roadmap de execução

## Frente 1 — UX e produto

### Marco A: protótipo navegável

- loja pública responsiva;
- categorias, busca, cards e detalhe do produto;
- adicionais, observação, quantidade e carrinho;
- checkout de entrega/retirada;
- confirmação e acompanhamento simulado.

Saída: protótipo validável em celular com conteúdo fictício SamJoE.

### Marco B: experiência ligada à API

- catálogo e disponibilidade reais;
- cálculo de entrega e pedido mínimo;
- sessão/carrinho resiliente;
- criação idempotente do pedido;
- página de acompanhamento em tempo real ou polling controlado.

### Marco C: conversão e operação

- Pix/Mercado Pago;
- repetir pedido, cupom, combos e sugestões;
- notificações WhatsApp;
- acessibilidade, performance e instrumentação do funil.

## Frente 2 — migração técnica

### Marco 0: descoberta do legado

- inventário Apps Script/Sheets/triggers;
- mapa de dados e dependências;
- riscos LGPD e regras críticas;
- baseline de volume e comportamento.

### Marco 1: fundação

- monorepo, ambientes e CI;
- PostgreSQL, migrations e seed;
- autenticação, tenants e autorização;
- API, worker, logs estruturados e health checks;
- Docker Compose e publicação de homologação por Tunnel.

### Marco 2: catálogo

- importador do legado;
- produtos, categorias, adicionais, fotos e disponibilidade;
- painel mínimo de manutenção;
- leitura pública pela nova API.

### Marco 3: pedidos

- clientes, endereços, carrinho, preço e frete;
- ciclo de vida e auditoria;
- notificações e filas;
- reconciliação com o legado.

### Marco 4: pagamento e corte

- Mercado Pago e webhooks idempotentes;
- observabilidade, backup e teste de restauração;
- migração por tenant/rota;
- plano de rollback e desativação do Apps Script.

## Dependência imediata

O Marco A pode começar com dados fictícios. O Marco 0 precisa do código e das planilhas do sistema atual; sem isso, não é possível estimar ou executar uma migração fiel.

