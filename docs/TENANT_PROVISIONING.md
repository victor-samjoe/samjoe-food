# Provisionamento de clientes da SamJoE Food

Este roteiro cria, em uma única transação, o tenant, a primeira loja, o usuário OWNER, o perfil contratual e o domínio opcional.

## Dados mínimos

- E-mail do responsável.
- Nome do responsável.
- Nome comercial da empresa.
- CPF ou CNPJ válido.

Dados opcionais:

- Razão social.
- Nome inicial da loja.
- Data de nascimento no formato `AAAA-MM-DD`, somente quando existir finalidade contratual documentada.
- Domínio próprio, informado apenas como hostname.

## 1. Simular sem alterar o banco

Use sempre dados fictícios em documentação, terminal compartilhado ou demonstrações:

```powershell
npm run tenant:create -- `
  --email dona@example.com `
  --owner-name "Dona Exemplo" `
  --business-name "Café Exemplo" `
  --document "12.345.678/0001-95"
```

Sem `--apply`, o comando valida os dados e mostra o plano, mas não grava nada.

## 2. Aplicar no ambiente escolhido

Confirme previamente que `DATABASE_URL` aponta para o ambiente correto. Depois, repita o comando com `--apply`:

```powershell
npm run tenant:create -- `
  --email dona@example.com `
  --owner-name "Dona Exemplo" `
  --business-name "Café Exemplo" `
  --legal-name "Café Exemplo Comércio de Alimentos Ltda." `
  --document "12.345.678/0001-95" `
  --domain "loja.exemplo.com.br" `
  --apply
```

O comando retorna:

- IDs do tenant, loja e OWNER.
- Link técnico imediato da loja: `/loja/<slug>`.
- Link do painel administrativo.
- Senha temporária apenas quando o e-mail ainda não existia.
- Estado `PENDING` do domínio próprio, quando informado.

## 3. Entregar o acesso

- Envie a senha temporária por canal seguro e separado do e-mail de identificação.
- Nunca registre a senha em Git, tarefas, CRM ou ticket.
- O usuário fica marcado com `must_change_password = true`.
- Até a conclusão do fluxo de convite da Tarefa 016, a troca obrigatória deve ser tratada como pendência operacional.

## 4. Publicar o endereço da loja

Sem domínio próprio, o cliente já pode usar:

```text
https://samjoe-food-web.victor-conceicao.workers.dev/loja/<slug>
```

Com domínio próprio:

1. O comando registra o hostname como `PENDING`.
2. A SamJoE configura o Custom Domain ou rota na conta Cloudflare oficial.
3. O cliente altera o DNS no provedor dele, inclusive Registro.br quando aplicável.
4. Depois da validação TLS e do tenant correto, o domínio passa para `VERIFIED` e pode virar primário.

`cloudflared` não é necessário para hospedar essa aplicação: o Worker já está online. Tunnel só seria usado para integrar algum serviço privado mantido fora da nuvem.

## Opções do comando

| Opção | Obrigatória | Descrição |
| --- | --- | --- |
| `--email` | sim | E-mail global do usuário OWNER |
| `--owner-name` | sim | Nome do responsável |
| `--business-name` | sim | Nome comercial do tenant |
| `--document` | sim | CPF ou CNPJ com validação de dígitos |
| `--legal-name` | não | Razão social; usa o nome comercial quando ausente |
| `--store-name` | não | Nome da loja inicial |
| `--tenant-slug` | não | Gerado pelo nome comercial |
| `--store-slug` | não | Usa o slug do tenant |
| `--birth-date` | não | Data do responsável, quando legalmente necessária |
| `--domain` | não | Hostname próprio, sem protocolo ou caminho |
| `--apply` | não | Efetiva a operação; sem ele ocorre apenas dry-run |

## Propriedades de segurança

- A operação usa transação e faz rollback integral em caso de erro.
- Reexecução reaproveita tenant, usuário e associação existentes.
- Um slug ou domínio pertencente a outro tenant bloqueia o provisionamento.
- CPF/CNPJ completos não aparecem no resumo; somente os quatro últimos dígitos.
- Usuários existentes não têm a senha redefinida.
- A aplicação pública não recebe acesso à tabela de dados contratuais.
