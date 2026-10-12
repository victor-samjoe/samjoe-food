# Tarefa 007 — Integração com o Sales Engine

Status: **aguardando contrato conjunto e prontidão do Sales Engine**  
Prioridade: **alta**

## Objetivo

Publicar eventos operacionais confiáveis para o Sales Engine sem compartilhar banco, autenticação de usuário ou regras internas.

## Escopo

- [ ] Implementar outbox do FoodApp e entrega assinada.
- [ ] Publicar `customer.created`, `customer.updated`, `order.created`, `order.paid`, `order.cancelled` e `order.refunded`.
- [ ] Assinar timestamp, método, caminho, tenant público e corpo.
- [ ] Implementar rotação de segredo e proteção contra replay.
- [ ] Criar painel de tentativas, falhas e replay autorizado.
- [ ] Criar reconciliação por cursor/período.
- [ ] Preservar referência de campanha validada no pedido.
- [ ] Separar finalidade operacional de consentimento promocional.
- [ ] Executar testes de contrato contra versão compatível do Sales Engine.

## Critérios de aceite

- Indisponibilidade do Sales Engine nunca impede checkout ou pagamento.
- Reenvio produz exatamente um efeito comercial.
- O FoodApp não consulta nem escreve diretamente no banco do Sales Engine.
- Eventos podem ser reconstruídos e reconciliados de forma auditável.
- Nenhuma campanha real é disparada como parte dos testes.

