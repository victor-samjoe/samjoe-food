# Tarefa 001 — Marco 0: descoberta e controle da migração

Status: **concluída para ambiente pré-produção simulado**  
Prioridade: **bloqueadora**  
Dependências: artefatos locais de referência em `E:\samjoe`

## Objetivo

Transformar o comportamento atual do Apps Script, Sheets, Cloudflare, Mercado Pago, Google Maps, Drive, n8n e Evolution em um inventário verificável e em casos de teste de paridade.

## Premissa confirmada em 2026-10-10

Não existe produção nem base real a preservar. Os artefatos em `E:\samjoe` são referência de protótipo. Validações de dados e runtime de produção são não aplicáveis; o FoodApp será criado e simulado exclusivamente com dados fictícios.

## Entregáveis

- [x] Inventário técnico inicial do código disponível.
- [x] Matriz inicial de fonte de verdade por domínio.
- [x] Registro inicial de riscos.
- [x] Plano mestre de migração.
- [x] Catálogo inicial de regras extraídas do Apps Script.
- [x] Checklist de evidências e exportações necessárias.
- [x] Auditoria estrutural das duas planilhas locais, incluindo fórmulas e validações.
- [x] Comparação estrutural entre Apps Script local e cópia de produção disponível.
- [x] Inventário dos backups JSON do workflow principal do n8n.
- [x] Inventário estático de entradas HTTP, gatilhos candidatos, integrações e serviços Docker do legado.
- [x] Suíte inicial anonimizada para regras puras do legado, incluindo casos de borda conhecidos.
- [x] Exportação de produção dispensada: não existe produção; templates locais serão referência estrutural.
- [x] Gatilhos ativos dispensados: não existe runtime de produção; candidatos do código foram catalogados.
- [x] Endpoints ativos dispensados: não existe produção; superfície estática foi catalogada.
- [x] Baseline real dispensada: cargas e volumes serão cenários sintéticos documentados.
- [x] Exportação de dados dispensada: fixtures serão integralmente fictícias.
- [x] Catálogo inicial será validado contra os contratos e cenários fictícios.
- [x] Fixtures fictícias e suíte inicial de caracterização do legado.
- [x] Segredos existentes são considerados descartáveis; nenhuma credencial do protótipo será reutilizada.

## Regras que precisam de caracterização

- normalização e deduplicação de telefone;
- disponibilidade e limite de estoque;
- cálculo de subtotal, frete e total;
- fronteiras de área de entrega;
- criação idempotente por `message_id`;
- transições de pedido, pagamento, rota e entrega;
- mapeamento de estados do Mercado Pago;
- reconciliação de pagamentos pendentes;
- criação e atualização de cliente/endereço;
- imagens por `produto_id` no Drive;
- aceite/recusa de rota e retorno do motoboy;
- notificações operacionais disparadas em cada transição.

## Critérios de aceite

- Toda regra crítica possui ao menos um exemplo feliz e um exemplo de erro.
- Toda fonte de dados possui proprietário, formato, volume e estratégia de extração.
- Nenhuma fixture contém nome, telefone, endereço, e-mail, CPF ou token real.
- É possível explicar o fluxo ponta a ponta sem depender de conhecimento oral.
- Lacunas não comprovadas estão marcadas como hipótese, nunca como regra confirmada.

## Não fazer nesta tarefa

- alterar planilhas ou triggers;
- mover tráfego;
- usar credenciais de produção em testes;
- importar dados para o banco definitivo;
- refatorar o Apps Script.

