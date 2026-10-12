# Inventário inicial do legado

Status: inicial; requer confirmação com ambiente e dados sanitizados.

## Componentes identificados

- Apps Script `MVP_Operacao_Web_V3.gs`: pedidos, clientes, produtos, pagamento, frete, rotas e operação.
- Apps Script `Frontend_Externo.gs`: allowlist das ações públicas.
- Apps Script `Sistema_Entregas.gs`: cálculo e otimização de rotas.
- HTML `PedidoForm.html` e `PainelMVP.html`: loja e painel atuais.
- Cloudflare Pages/Worker: frontend público e proxy restrito para Apps Script.
- Worker Mercado Pago: validação/relay do webhook para Apps Script.
- Google Sheets: pedidos, produtos, clientes, endereços, rotas, itens e logs.
- Google Drive: imagens nomeadas pelo `produto_id`.
- n8n: workflows de pedido e notificações.
- Evolution API: sessão e transporte WhatsApp.
- PostgreSQL separados: dados internos de n8n e Evolution.
- Redis: dependência da Evolution.
- Caddy/VPS: entrada HTTPS da stack legada.

## Evidências locais adicionais encontradas

- `Planilhas/Base_Clientes_Bolo_de_Pote (2).xlsx`: template com 6 abas, schema de clientes/endereços, listas e dashboard; sem registros operacionais nas duas tabelas principais.
- `Planilhas/Sistema_Operacional_Bolo_de_Pote_Web_V2 (2).xlsx`: template com 12 abas; `Pedidos` possui 199 linhas de fórmulas e nenhuma linha constante de pedido.
- `.tmp/samjoe-production-appsscript`: cópia obtida da implantação de produção, incluindo manifesto e cinco arquivos do projeto.
- A cópia local do MVP possui 85 funções e a cópia de produção possui 83; `mvpFormatarMoeda_` e `mvpNotificarResponsavelNovoPedido_` aparecem somente na versão local analisada.
- O manifesto de produção usa V8, timezone `America/Sao_Paulo`, execução como usuário implantador e acesso anônimo ao web app.
- Backups n8n contêm três versões do workflow ativo `MVP - Pedido estruturado WhatsApp Evolution`, todas com 27 nós.
- Caminhos de webhook identificados nos backups: `evolution-pedidos-bolo-mvp` e `evolution-pedido-form-bolo-mvp`.

Detalhes estruturais das planilhas estão em `WORKBOOK_AUDIT.md`.

O mapa estático de entradas HTTP, gatilhos candidatos, chamadas externas, webhooks do n8n e serviços Docker está em `INTEGRATION_SURFACE_AUDIT.md`. Esse mapa não confirma quais componentes estão ativos em produção.

## Contratos públicos observados

- `public_menu`
- `public_validate_address`
- `public_submit_order`
- `public_product_image`

## Comportamentos críticos observados

- deduplicação por `message_id`;
- normalização de telefone brasileiro;
- criação/upsert de cliente e endereço;
- cálculo de frete por distância;
- validação de produto, preço e quantidade;
- pedido aguardando pagamento para Mercado Pago;
- consulta do recurso no Mercado Pago antes de confirmar;
- reconciliação periódica de pagamentos pendentes;
- criação, aceite e recusa de rota;
- atualização de entrega pelo motoboy;
- notificações por mudança de estado.

## Evidências ainda necessárias

- manifesto e lista de triggers instalados;
- exportação atual das planilhas Google de produção; os arquivos locais são templates vazios;
- confirmação das fórmulas da versão ativa contra o template local;
- volumes e distribuição histórica;
- lista de domínios e deployments ativos;
- exportação sanitizada da versão n8n atualmente ativa; os arquivos encontrados são backups históricos;
- catálogo completo de estados encontrados nos dados;
- política operacional usada quando integrações falham.
- confirmação em ambiente dos triggers, deployments, webhooks e consumidores catalogados estaticamente.

## Exclusões de segurança

Arquivos `.env`, chaves SSH/Oracle, tokens, IDs sensíveis e dados pessoais não devem ser copiados para este inventário. O fato de chaves privadas existirem na árvore local deve gerar inventário seguro e rotação, não reprodução do conteúdo.

