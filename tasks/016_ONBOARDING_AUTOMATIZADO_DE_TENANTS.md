# Tarefa 016 — Onboarding automatizado de tenants

Status: **MVP em implementação**
Prioridade: **crítica**

## Objetivo

Permitir que o proprietário da SamJoE provisione um novo cliente com segurança, consistência e poucas entradas manuais.

## MVP por linha de comando

- [x] Validar e-mail, CPF/CNPJ, slugs, domínio e data opcional.
- [x] Criar tenant, loja, OWNER e perfil contratual em uma transação.
- [x] Gerar link técnico imediato da loja.
- [x] Registrar domínio opcional como `PENDING`.
- [x] Gerar senha temporária forte somente para usuário novo.
- [x] Impedir redefinição de senha de usuário já existente.
- [x] Oferecer dry-run como comportamento padrão.
- [x] Criar testes das validações críticas.
- [x] Aplicar e validar a migration `0021` no Supabase.
- [ ] Executar primeiro provisionamento fictício completo e removê-lo após o teste.

## Evolução para convite seguro

- [ ] Substituir senha temporária por token de ativação de uso único.
- [ ] Criar tela para o OWNER definir a própria senha.
- [ ] Expirar e revogar convites.
- [ ] Implementar reenvio sem revelar credenciais.
- [ ] Exigir troca de senha enquanto `must_change_password` estiver ativo.
- [ ] Registrar aceite de termos e política de privacidade.
- [ ] Adicionar MFA para proprietários e administradores.

## Critérios de aceite

- Reexecução não duplica tenant, loja, usuário ou domínio.
- Falha em qualquer etapa não deixa cadastro parcial.
- Nenhuma senha, CPF/CNPJ completo ou token entra em log persistente.
- Slug e hostname nunca são compartilhados entre tenants.
- O novo cliente acessa apenas o tenant provisionado.
- O fluxo definitivo não envia senha em texto puro por e-mail.
