# SamJoE FoodApp — Blueprint de UX do pedido

## Objetivo

Criar uma experiência de cardápio e pedido mobile-first inspirada nos padrões de compra do Anota AI, sem copiar marca, textos, imagens ou identidade visual. O fluxo deve parecer uma conversa simples de WhatsApp, não um ERP.

## Jornada principal

```text
Abrir loja
  -> escolher entrega ou retirada
  -> localizar categoria/produto
  -> configurar item e adicionais
  -> revisar carrinho
  -> identificar cliente/endereço
  -> escolher pagamento
  -> confirmar
  -> acompanhar status
```

Meta para o caminho feliz: o cliente que já conhece a loja deve conseguir repetir ou concluir um pedido em menos de 90 segundos.

## Estrutura da loja pública

### 1. Cabeçalho compacto

- capa e avatar/logotipo do estabelecimento;
- nome, estado `Aberto`/`Fechado` e previsão de entrega;
- taxa de entrega ou mensagem de retirada;
- acesso a informações da loja, horários e pedido anterior;
- seletor persistente `Entrega` / `Retirada`.

O cabeçalho reduz de altura durante a rolagem para preservar espaço útil no celular.

### 2. Busca e categorias

- campo `O que você quer pedir?`;
- chips de categorias em rolagem horizontal;
- categoria ativa acompanha a seção visível;
- busca tolerante a acentos e pequenas variações;
- URL preserva categoria, busca e campanha quando fizer sentido.

### 3. Vitrine

- seção opcional `Mais pedidos` ou `Destaques`;
- lista por categoria com nome, descrição curta, preço e foto;
- estados visuais para promoção, esgotado e restrições alimentares;
- toque em qualquer área do card abre a configuração;
- imagens com proporção consistente e carregamento progressivo.

### 4. Configuração do produto

Em celular, usar uma tela ou bottom sheet quase integral:

- imagem, nome, descrição e preço base;
- grupos obrigatórios claramente identificados;
- limites como `Escolha 1` e `Até 3 opções`;
- adicionais com impacto de preço visível;
- observações e quantidade;
- botão fixo `Adicionar • R$ 00,00`;
- validação perto do grupo com erro, sem alertas genéricos.

### 5. Carrinho

- barra fixa aparece após o primeiro item;
- resumo com quantidade e total;
- edição do item preserva escolhas anteriores;
- sugestão de complemento contextual, nunca bloqueante;
- subtotal, desconto, entrega e total discriminados;
- aviso antecipado de pedido mínimo, se houver.

### 6. Checkout progressivo

Uma decisão por bloco, com dados preservados ao voltar:

1. entrega ou retirada;
2. telefone e nome;
3. endereço e referência, quando entrega;
4. horário imediato ou agendado;
5. pagamento e troco;
6. revisão e confirmação.

Evitar cadastro obrigatório antes de o cliente montar o carrinho. A identificação por telefone pode recuperar dados após consentimento.

### 7. Confirmação e acompanhamento

- número e resumo do pedido;
- linha do tempo dos estados;
- previsão atualizada;
- ações `Falar com a loja`, `Ver detalhes` e `Pedir novamente`;
- cada mudança relevante pode gerar WhatsApp, mas a página continua sendo a fonte de verdade.

## Estados obrigatórios

- loja fechada com próximo horário e agendamento, quando habilitado;
- produto sem foto ou indisponível;
- categoria ou carrinho vazio;
- endereço fora da área;
- pagamento pendente, recusado e expirado;
- perda de conexão com retomada segura;
- preço/estoque alterado entre carrinho e confirmação;
- pedido duplicado prevenido por idempotência.

## Direção visual e responsividade

- identidade própria SamJoE e tema configurável por tenant;
- tipografia legível, contraste AA e alvos de toque de pelo menos 44 px;
- uma cor principal da loja e cores funcionais consistentes;
- superfícies claras, cantos moderados e sombras discretas;
- fotos dos produtos como principal elemento visual;
- `360–767 px`: uma coluna e ações fixas inferiores;
- `768–1199 px`: conteúdo centralizado e carrinho lateral opcional;
- `1200 px+`: catálogo à esquerda e carrinho persistente à direita.

## Acessibilidade e desempenho

- navegação por teclado, foco visível e rótulos reais;
- mensagens não dependem somente de cor;
- `prefers-reduced-motion` respeitado;
- imagens responsivas em WebP/AVIF quando possível;
- objetivo de LCP abaixo de 2,5 s em 4G e CLS abaixo de 0,1;
- carrinho local resiliente, sincronizado com o servidor antes do fechamento.

## Métricas do funil

Registrar `store_viewed`, `search_used`, `product_viewed`, `item_added`, `checkout_started`, `delivery_quote_failed`, `payment_started`, `payment_failed`, `order_created` e `order_repeated`.

Métricas principais: conversão, abandono por etapa, tempo até pedido, ticket médio, falhas de pagamento e recompra.

## Critérios de aceite do primeiro corte

- fluxo completo funciona em 360 px sem rolagem horizontal;
- catálogo é navegável por busca e categoria;
- grupos obrigatórios e limites são validados;
- carrinho sobrevive a recarregamento e não cria pedido duplicado;
- entrega, retirada, Pix e pagamento na entrega são representáveis;
- confirmação mostra o status real do backend;
- tema e conteúdo vêm do tenant, não do build;
- todos os estados críticos acima têm interface definida.

