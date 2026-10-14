# Tarefa 018 — Loja Aberta, Horário de Funcionamento e Status Público

Status: **pendente**
Prioridade: **alta**
Originado por: Sales Engine — fluxos de automação WhatsApp precisam saber se a loja está aberta antes de enviar link da loja ou responder mensagens.

---

## Objetivo

Permitir que o operador da loja indique manualmente se está aberta ou fechada, e configure os horários de funcionamento por dia da semana. Esses dados devem ser expostos via API para consumo pelo Sales Engine e pelo n8n.

---

## Contexto

O n8n precisa decidir, ao receber uma mensagem de WhatsApp, se deve:
- Enviar o link da loja (loja aberta + cliente sem pedido ativo)
- Enviar mensagem de "estamos fechados" (loja fechada ou fora do horário)
- Ignorar o horário e sempre responder sobre pedido em andamento

O Sales Engine vai consumir o endpoint `GET /api/v1/store/status` (ou equivalente público) para obter esse contexto.

---

## Entregas

### 1. Toggle "Loja Aberta" no painel admin

- [ ] Adicionar campo `is_open` (boolean) na tabela de configurações da loja (`stores` ou `tenant_settings`).
- [ ] Adicionar toggle visível e proeminente no painel admin (dashboard ou settings), com estado claro: **Aberta** (verde) / **Fechada** (vermelho).
- [ ] Ao fechar a loja manualmente, exibir campo opcional "motivo" (ex: "Feriado", "Férias", "Manutenção").
- [ ] Registrar log de abertura/fechamento com timestamp e usuário.

### 2. Horário de funcionamento por dia da semana

- [ ] Adicionar tabela ou campo JSON `business_hours` com estrutura:
  ```json
  {
    "monday":    { "open": true,  "from": "08:00", "to": "22:00" },
    "tuesday":   { "open": true,  "from": "08:00", "to": "22:00" },
    "wednesday": { "open": true,  "from": "08:00", "to": "22:00" },
    "thursday":  { "open": true,  "from": "08:00", "to": "22:00" },
    "friday":    { "open": true,  "from": "08:00", "to": "22:00" },
    "saturday":  { "open": true,  "from": "09:00", "to": "20:00" },
    "sunday":    { "open": false, "from": null,    "to": null    }
  }
  ```
- [ ] Tela de configuração de horários no painel admin (Settings → Horário de Funcionamento).
- [ ] Timezone configurável por loja (padrão: `America/Sao_Paulo`).

### 3. Estado derivado (open_now)

- [ ] Calcular `open_now` no backend combinando:
  1. `is_open` (toggle manual) — se falso, sempre fechado independente do horário.
  2. Dia da semana e horário atual no timezone da loja vs `business_hours`.
- [ ] `open_now = is_open AND (dia/hora dentro do horário configurado)`

### 4. Endpoint público de status da loja

- [ ] Expor `GET /api/v1/public/store-status` (sem autenticação) retornando:
  ```json
  {
    "open_now": true,
    "is_open": true,
    "reason_closed": null,
    "next_opens_at": null,
    "business_hours": { ... },
    "timezone": "America/Sao_Paulo"
  }
  ```
- [ ] Endpoint acessível pelo Sales Engine via HTTPS (não requer auth de tenant, mas pode ter CORS restrito ao domínio do Sales Engine).
- [ ] `next_opens_at`: calculado quando `open_now = false`, indica quando a loja abre na próxima vez.

### 5. Exibição na loja (customer-facing)

- [ ] Mostrar badge "Aberta" / "Fechada" na página da loja (header ou banner).
- [ ] Quando fechada: exibir horário de reabertura se disponível.
- [ ] Quando fechada: permitir ou não pedidos (configurável — "aceitar pedidos fora do horário" toggle).

---

## Dados necessários do operador

Antes de implementar, confirmar com Victor:
- Timezone da loja (provavelmente `America/Sao_Paulo`)
- Horários de funcionamento atuais (dias e horas)
- Comportamento desejado quando fechada: bloquear pedidos ou só avisar?

---

## Integração com Sales Engine

Após a entrega desta tarefa, o Sales Engine vai:
1. Chamar `GET /api/v1/public/store-status` no início de cada flow do n8n
2. Se `open_now = false` → enviar mensagem de "estamos fechados, respondemos em {next_opens_at}"
3. Se `open_now = true` → seguir fluxo normal (enviar link da loja, etc.)

O endpoint precisa estar disponível publicamente via HTTPS antes da integração com o n8n ser ativada.

---

## Arquivos relevantes

- Configurações da loja: `apps/api/` ou `apps/web/` — verificar onde ficam as settings de tenant
- Migration: criar em `database/migrations/`
- Tela de settings: `apps/web/src/` — verificar componente de Settings existente
