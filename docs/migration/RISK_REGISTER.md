# Registro inicial de riscos

| ID | Severidade | Risco | Mitigação inicial | Gate |
|---|---|---|---|---|
| R-001 | Crítica | Chaves privadas e segredos fora de cofre | Inventariar uso, rotacionar e mover para secret manager | A |
| R-002 | Crítica | Venda acima do estoque em concorrência | Reserva transacional e teste de carga | D |
| R-003 | Crítica | Pagamento duplicado, perdido ou associado incorretamente | Idempotência, validação do recurso e reconciliação | E |
| R-004 | Alta | Regras implícitas em fórmulas e Apps Script | Testes de caracterização e catálogo de regras | A |
| R-005 | Alta | Clientes duplicados por telefone inconsistente | Normalização, IDs externos e fila de ambiguidade | D |
| R-006 | Alta | Dual-write criar divergência silenciosa | Uma fonte oficial e projeção via outbox | D |
| R-007 | Alta | Consentimento operacional virar marketing | Finalidades separadas e evidência imutável | F |
| R-008 | Alta | Webhook repetido ou fora de ordem | Inbox, chave idempotente e máquina de estados | E |
| R-009 | Alta | Sales Engine indisponível bloquear compra | Integração assíncrona via outbox | F |
| R-010 | Média | Diferença no cálculo de frete/rota | Golden tests e shadow comparison | D |
| R-011 | Média | Falha da projeção temporária para Sheets | Retry, alerta e reconstrução por cursor | D |
| R-012 | Média | Uma VPS ampliar impacto de incidente | Isolamento lógico, backup externo e restore testado | B |
| R-013 | Alta | Web app Apps Script anônimo depender integralmente do proxy para restringir ações públicas e painel | Confirmar Worker ativo, allowlist, rate limit e impedir acesso operacional direto | A |
| R-014 | Alta | Segredos em query string vazarem por logs, histórico, métricas ou encaminhamento | Migrar para assinatura/header, mascarar logs e rotacionar os valores atuais | A |
| R-015 | Média | Imagens Docker `latest` causarem atualização ou rollback não determinístico | Fixar versões/digests e registrar compatibilidade antes de qualquer atualização | B |

## Revisão

Este registro deve ser atualizado em cada checkpoint. Risco crítico sem mitigação testada bloqueia o gate correspondente.

