# Tarefa 015 — Manutenção do CI e GitHub Actions

Status: **planejada**
Prioridade: **média**

## Objetivo

Remover avisos de runtime descontinuado das pipelines e manter builds reproduzíveis nos repositórios FoodApp e Sales Engine.

## Escopo

- [ ] Inventariar workflows, Actions, runtimes e imagens de runner usados nos dois repositórios.
- [ ] Verificar versões oficiais compatíveis com o runtime atual do GitHub Actions.
- [ ] Atualizar `actions/checkout`, configuração de Node/Python e demais Actions afetadas.
- [ ] Fixar versões por major ou SHA conforme a política de atualização escolhida.
- [ ] Confirmar as versões de Node, npm, Python e uv declaradas pelo projeto.
- [ ] Validar instalação limpa usando somente lockfiles versionados.
- [ ] Executar typecheck, testes e build em Linux.
- [ ] Configurar atualização automatizada e revisada das Actions.
- [ ] Documentar como reproduzir localmente cada job crítico.

## Critérios de aceite

- Pipelines do FoodApp e do Sales Engine concluem com sucesso.
- Não existe aviso de Action executando sobre runtime Node descontinuado.
- Builds usam lockfiles e não dependem do estado da máquina do desenvolvedor.
- Mudanças de runner ou runtime não alteram o artefato funcional publicado.
- Existe procedimento documentado para investigar e reexecutar falhas.
