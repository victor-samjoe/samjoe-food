# Tarefa 011 — Homologação e cutover da SamJoE Confeitaria

Status: **aguardando Tarefas 009 e 010**  
Prioridade: **crítica**

## Objetivo

Publicar, validar e transferir com rollback seguro a primeira loja cliente da SamJoE Food.

## Escopo

- [x] Criar tenant e loja `samjoe-confeitaria`.
- [ ] Criar OWNER real com troca obrigatória de senha.
- [ ] Importar catálogo com dry-run.
- [ ] Migrar imagens e reconciliar produtos, preços e disponibilidade.
- [ ] Validar a loja em hostname de preview.
- [ ] Executar testes mobile, acessibilidade, performance e fluxo completo.
- [ ] Ensaiar troca e rollback do hostname.
- [ ] Trocar `app.confeitaria.samjoe.com.br` do Pages legado para o novo Worker.
- [ ] Manter pagamentos e integrações reais desativados até aceite específico.
- [ ] Monitorar pedidos, erros e jobs durante estabilização.
- [ ] Colocar o legado em somente leitura após aceite.

## Critérios de aceite

- Nenhum produto, preço, estoque ou pedido fica divergente.
- Rollback de DNS/rota e aplicação foi ensaiado.
- A loja continua disponível com o notebook desligado.
- Existe backup restaurável anterior ao corte.
- A operação da SamJoE Confeitaria aprova formalmente o fluxo.

