# Tarefa 013 — Cutover do domínio da SamJoE Confeitaria

Status: **bloqueada pela Tarefa 012**
Prioridade: **crítica**

## Objetivo

Transferir `app.confeitaria.samjoe.com.br` do sistema legado para o novo FoodApp com validação e rollback documentados.

## Preparação

- [ ] Obter aceite formal da Tarefa 012.
- [ ] Registrar os valores atuais de DNS, proxy, rota, TLS e destino legado.
- [ ] Confirmar acesso administrativo ao Registro.br e à conta Cloudflare correta.
- [ ] Confirmar que o hostname está cadastrado para a loja `samjoe-confeitaria`.
- [ ] Configurar o domínio customizado no Worker sem remover o destino legado.
- [ ] Validar emissão do certificado TLS.
- [ ] Definir janela de mudança, responsável, canal de comunicação e limite para rollback.
- [ ] Confirmar que não haverá mudança de nameservers sem necessidade e aprovação específica.

## Execução

- [ ] Fazer backup/exportação imediatamente anterior ao corte.
- [ ] Aplicar a menor mudança possível de DNS ou rota no Cloudflare.
- [ ] Validar resolução DNS e certificado em rede externa.
- [ ] Testar página inicial, catálogo, login, carrinho, checkout simulado e painel pelo domínio oficial.
- [ ] Monitorar respostas 4xx/5xx, conexão com banco e criação de pedidos.
- [ ] Manter o sistema legado disponível durante a janela de estabilização.
- [ ] Registrar horário, alteração aplicada, propagação e resultado.

## Rollback

- [ ] Restaurar o registro ou rota anterior se um cenário crítico falhar.
- [ ] Confirmar o retorno do legado e a consistência de pedidos criados durante a janela.
- [ ] Documentar causa, impacto e condição para nova tentativa.

## Critérios de aceite

- `https://app.confeitaria.samjoe.com.br` apresenta o novo FoodApp com TLS válido.
- Hostname resolve sempre para o tenant correto e nunca para uma loja padrão.
- Fluxos críticos passam pelo domínio oficial.
- Não há perda ou duplicação de pedidos.
- Rollback foi ensaiado ou validado documentalmente e pode ser executado dentro da janela definida.
- O legado só entra em modo somente leitura após o período de estabilização e aceite operacional.
