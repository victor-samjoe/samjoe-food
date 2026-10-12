# Política de compatibilidade dos contratos

## HTTP

A versão principal aparece no caminho (`/v1`). Dentro de uma versão são permitidas apenas mudanças compatíveis:

- adicionar endpoint;
- adicionar campo opcional;
- adicionar novo código de erro documentado;
- ampliar enum somente quando o consumidor já tratar valor desconhecido.

Remover ou renomear campo, tornar campo obrigatório, mudar semântica ou restringir valor exige `/v2`. A versão anterior permanece durante uma janela de migração documentada.

## Eventos

O tipo inclui a versão: `foodapp.<agregado>.<evento>.v1`. Consumidores ignoram campos desconhecidos e rejeitam uma versão principal não suportada para uma dead-letter queue, sem perder o evento.

Mudança compatível adiciona campo opcional. Mudança incompatível publica novo sufixo (`.v2`) e mantém publicação dupla somente por período controlado via outbox.

## Erros

Clientes dependem de `error.code`, não da mensagem humana. `request_id` deve estar presente em toda resposta de erro e nos logs correspondentes.

## Segurança

- Idempotência usa header, nunca query string.
- Webhooks usam assinatura e ID externo do evento.
- Tokens de rastreamento não aparecem em URLs nem logs.
- Nenhum contrato devolve credencial de provedor.

