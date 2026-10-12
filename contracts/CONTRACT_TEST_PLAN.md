# Plano de testes de contrato

## API pública

- validar OpenAPI em CI;
- executar exemplos positivos de catálogo, cotação, criação idempotente e rastreamento;
- rejeitar propriedades extras nos comandos;
- verificar que `tenant_id` enviado pelo cliente é ignorado/rejeitado;
- repetir `Idempotency-Key` com o mesmo corpo e obter a mesma resposta;
- repetir a chave com corpo diferente e obter `409`;
- validar isolamento usando dois tenants fictícios com IDs sobrepostos no payload.

## Estoque e pedido

- duas compras simultâneas do último item resultam em apenas uma reserva;
- duas linhas do mesmo SKU são somadas antes da reserva;
- reserva expirada devolve saldo;
- preço e nome alterados no catálogo não alteram o snapshot do pedido;
- endereço e cotação expirados são rejeitados.

## Provedores simulados

- Mercado Pago fake envia evento duplicado, atrasado e fora de ordem;
- Evolution fake fica indisponível, retorna timeout e recupera;
- localização fake cobre dentro do raio, limites, fora da área e erro transitório;
- storage fake rejeita MIME e tamanho inválidos.

## FoodApp para Sales Engine

- validar cada evento contra o envelope e schema de payload versionados;
- reenviar o mesmo `id` e comprovar deduplicação;
- preservar `tenant_id`, `correlation_id` e `causation_id`;
- enviar versão desconhecida para dead-letter sem confirmar processamento;
- garantir que o payload não contenha segredo, token ou dado pessoal desnecessário.

## Evidências de CI

Cada execução deve publicar: versão do contrato, resultado, seed utilizado, banco PostgreSQL real, hashes das migrations e logs sem dados sensíveis.

