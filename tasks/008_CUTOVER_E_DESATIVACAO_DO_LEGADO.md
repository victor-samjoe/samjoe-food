# Tarefa 008 — Cutover e desativação do legado

Status: **aguardando Tarefas 001–007**  
Prioridade: **alta**

## Objetivo

Transferir o tráfego por capacidade, observar estabilidade, encerrar escritas antigas e preservar histórico recuperável.

## Escopo

- [ ] Definir critérios objetivos de go/no-go por domínio.
- [ ] Ensaiar corte e rollback em staging com cópia sanitizada.
- [ ] Migrar catálogo, pedidos, pagamentos, entregas e automações separadamente.
- [ ] Executar reconciliação antes e depois de cada corte.
- [ ] Colocar o legado em somente leitura.
- [ ] Fazer backup final e teste de restauração.
- [ ] Revogar webhooks, triggers, tokens e acessos obsoletos.
- [ ] Definir retenção e descarte seguro segundo política aprovada.
- [ ] Atualizar runbooks, diagramas e responsáveis operacionais.

## Critérios de aceite

- Nenhuma divergência financeira ou pedido sem destino permanece aberta.
- Rollback foi ensaiado antes do corte, não apenas documentado.
- Legado não recebe novas escritas após a estabilização.
- Credenciais antigas foram rotacionadas ou revogadas.
- Existe evidência de backup restaurável e aceite formal da operação.

