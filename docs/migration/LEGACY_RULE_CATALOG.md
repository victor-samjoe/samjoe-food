# Catálogo inicial de regras do legado

Fonte observada: `MVP_Operacao_Web_V3.gs`. Este documento descreve comportamento do código; regras dependentes de planilhas reais ainda precisam ser confirmadas.

Caracterização automatizada inicial: `scripts/characterize_legacy_rules.cjs`. A suíte executa diretamente a cópia local do Apps Script em um contexto isolado e cobre normalização, estados, pagamento, área, frete e custo de rota sem dados pessoais.

## Pedido

### Estados reconhecidos

| Legado | Estado canônico proposto |
|---|---|
| `Aguardando pagamento` | `PAYMENT_PENDING` |
| `Novo` | `NEW` |
| `Confirmado` | `CONFIRMED` |
| `Em produção` | `IN_PREPARATION` |
| `Pronto` | `READY` |
| `Saiu para entrega` | `OUT_FOR_DELIVERY` |
| `Concluído` | `COMPLETED` |
| `Cancelado` | `CANCELLED` |

Estado desconhecido é convertido atualmente para `Novo`. No FoodApp, a recomendação é rejeitar ou colocar em quarentena durante importação, para não esconder dado inválido.

### Idempotência

- O legado usa `message_id` quando fornecido.
- Há uma verificação antes do lock e outra dentro de `ScriptLock`.
- Pedido de formulário sem ID recebe `FORM-<UUID>`.

Exemplo de paridade:

```text
Dado o mesmo message_id enviado duas vezes
Quando ambas as requisições forem processadas
Então deve existir um pedido
E ambas devem retornar o mesmo identificador e checkout, quando aplicável
```

### Criação

- telefone e endereço são obrigatórios;
- origem padrão é `WHATSAPP` e formulário usa `WHATSAPP_FORM`;
- o subtotal é recalculado usando preço do catálogo;
- frete é calculado separadamente e somado ao total final;
- itens são persistidos como linhas independentes;
- notificação ao responsável acontece depois de liberar o lock.

## Catálogo e estoque

- Somente produtos com `ativo = SIM` são publicados.
- Estoque vazio significa sem limite conhecido.
- Quantidade por linha deve ser inteira entre 1 e 100.
- Quantidade maior que `estoque_disponivel` é rejeitada.
- Nome, sabor e preço enviados pelo navegador são ignorados em favor do catálogo.

### Lacunas críticas observadas

- A validação lê estoque, mas o trecho analisado não efetua reserva nem baixa atômica.
- Dois pedidos concorrentes podem validar contra o mesmo saldo.
- Linhas repetidas do mesmo produto podem individualmente passar e, somadas, superar o estoque.
- É preciso confirmar se existe baixa por fórmula, trigger ou rotina fora do arquivo analisado.

Exemplo obrigatório para o FoodApp:

```text
Estoque disponível: 3
Carrinho: duas linhas do mesmo SKU com quantidades 2 e 2
Resultado esperado: rejeitar o carrinho ou ajustar antes de criar o pedido
```

## Cliente

- Identidade primária prática: telefone normalizado.
- Cliente novo recebe ID `CLI-<UUID>`.
- Cliente existente tem nome, WhatsApp, CPF e e-mail atualizados quando informados.
- `aceite_privacidade` aceita valor vindo da requisição e começa como `PENDENTE` por padrão.
- Esse campo não comprova consentimento de marketing e não deve ser importado como opt-in promocional sem evidência.

## Endereço

- Endereço é deduplicado por cliente e texto normalizado entre valor informado/formatado.
- Endereço novo recebe ID `END-<UUID>`.
- Geocoding fornece componentes, coordenadas e `place_id` quando disponível.
- O cadastro registra distância, duração e área de atendimento.
- Endereço reencontrado é reativado e atualizado.

## Área e frete

Parâmetros atuais vêm de células da aba `Configuracao`:

| Parâmetro | Célula |
|---|---|
| raio padrão | `B6`, fallback 5 km |
| raio máximo | `B7`, fallback 10 km |
| valor base | `B12` |
| quilômetros incluídos | `B13` |
| preço por km adicional | `B14` |
| adicional fora do raio padrão | `B15` |

Fórmula observada:

```text
frete = base
      + max(0, distância - km_incluído) × preço_km
      + adicional_quando_distância_maior_que_raio_padrão
```

Acima do raio máximo, a função retorna frete zero. Isso não deve significar entrega grátis no FoodApp; deve resultar em `OUTSIDE_DELIVERY_AREA`, salvo regra explícita de exceção.

## Pagamento

- Método exatamente igual a `Dinheiro` cria pedido `Novo` com `PAGAMENTO_NA_ENTREGA`.
- Qualquer outro texto no fluxo atual é tratado como Mercado Pago.
- Mercado Pago cria o pedido primeiro como `Aguardando pagamento`.
- Checkout considera produtos + frete.
- O retorno do navegador não confirma pagamento.
- Webhook/reconciliação consulta a order no provedor antes de atualizar o pedido.

Estados financeiros observados:

| Provedor | Legado |
|---|---|
| `processed/accredited` | `PAGO` |
| `processed/partially_refunded` | `REEMBOLSO_PARCIAL` |
| `processed/refunded` ou `refunded` | `ESTORNADO` |
| `charged_back` | `CHARGEBACK` |
| `failed` | `RECUSADO` |
| `expired` | `EXPIRADO` |
| `canceled` | `CANCELADO` |
| `created` | `AGUARDANDO_PAGAMENTO` |
| `processing` ou `action_required` | `PENDENTE` |

## Entrega

Estados de motoboy observados: `INDISPONIVEL`, `DISPONIVEL`, `RESERVADO`, `EM_ENTREGA`, `RETORNANDO`.

- somente pedido `Pronto` deve entrar em uma rota;
- rota criada começa em `AGUARDANDO_ACEITE`;
- aceite move motoboy para `EM_ENTREGA`;
- recusa libera o motoboy e remove associação dos pedidos;
- conclusão aceita variantes de `ENTREGUE`/`CONCLUIDO`;
- máximo configurado no código: 10 paradas.

## Casos de paridade prioritários

1. Reenvio do mesmo `message_id`.
2. Duas compras concorrentes do último item.
3. Mesmo SKU repetido no carrinho.
4. Produto desativado entre abertura do catálogo e checkout.
5. Alteração de preço durante o carrinho.
6. Distância exatamente nos dois limites e acima do máximo.
7. Falha de geocoding com rota disponível e vice-versa.
8. Webhook de pagamento duplicado e fora de ordem.
9. Reembolso parcial e chargeback depois de pedido concluído.
10. Rota recusada depois de pedidos associados.

