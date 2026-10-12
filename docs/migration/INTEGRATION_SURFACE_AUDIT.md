# Auditoria estática de gatilhos e integrações

Data da coleta: 2026-10-10  
Escopo: cópia local em `E:\samjoe\.tmp\samjoe-production-appsscript`, workflow local do n8n e `docker-compose.yml` legado.  
Limite: este documento prova o que existe nos artefatos locais; não prova quais deployments, triggers, webhooks ou containers estão ativos em produção.

## Entradas do Apps Script

O manifesto local declara runtime V8, timezone `America/Sao_Paulo` e web app executado como o usuário implantador com acesso `ANYONE_ANONYMOUS`.

### HTTP GET

| Rota lógica | Comportamento observado | Proteção no Apps Script |
|---|---|---|
| `?mode=ping` | Health check em JSON | Nenhuma |
| `?mode=validate_address` | Valida endereço | Segredo em parâmetro de query |
| `?mode=pedido_form` | Renderiza formulário legado | Nenhuma |
| `?mode=payment_return` | Renderiza retorno de pagamento | Nenhuma |
| Sem `mode` conhecido | Renderiza painel operacional | Nenhuma verificação observada em `doGet` |

### HTTP POST

| Entrada/ação | Comportamento observado | Proteção no Apps Script |
|---|---|---|
| `source=mercadopago` | Consulta a order no Mercado Pago e aplica o estado | Chave própria em parâmetro de query; o recurso é consultado novamente na API |
| `ping` | Health check autenticado | Segredo no corpo |
| `upsert_customer_order` | Upsert de cliente e pedido | Segredo no corpo |
| `validate_address` | Valida endereço | Segredo no corpo |
| `get_menu` | Obtém catálogo | Segredo no corpo |
| `courier_response` | Registra aceite/recusa do motoboy | Segredo no corpo |
| `delivery_update` | Atualiza entrega | Segredo no corpo |
| `public_menu` | Obtém catálogo público | Passa pela validação geral de segredo no `doPost` |
| `public_validate_address` | Valida endereço público | Passa pela validação geral de segredo no `doPost` |
| `public_submit_order` | Cria pedido público | Passa pela validação geral de segredo no `doPost` |
| `public_product_image` | Retorna imagem do Drive em base64 | Passa pela validação geral de segredo no `doPost` |

Conclusão de fronteira: a cópia analisada espera que o Cloudflare/consumidor mantenha o segredo de integração e exponha somente uma allowlist. É necessário confirmar a configuração ativa do Worker, rate limiting e cache antes de considerar essa fronteira comprovada.

## Gatilhos do Apps Script

| Handler | Tipo observado no código | Frequência/evento | Situação real |
|---|---|---|---|
| `mvpAoAbrir` | Instalável | Abertura da planilha | Não confirmada fora do código |
| `mvpSincronizarPagamentosPendentes` | Time-based | A cada 5 minutos | Não confirmada fora do código |
| `onOpen` | Simples | Abertura da planilha | Presente em `Sistema_Entregas.js`; execução ativa não confirmada |

Observação: `mvpCriarTriggerMenu_` remove triggers existentes do mesmo handler antes de criar `mvpAoAbrir`; `mvpInstalarSincronizacaoPagamentos` faz o mesmo para a reconciliação de pagamentos.

## Saídas do Apps Script

| Destino lógico | Finalidade | Evidência local |
|---|---|---|
| Google Routes API | Distância, duração e otimização de rota | Chamadas via `UrlFetchApp` |
| Google Geocoding API | Geocodificação de endereço | Chamada via `UrlFetchApp` |
| Mercado Pago Orders API | Criar e consultar orders | Endpoints `/v1/orders` |
| n8n — formulário | Enviar confirmação do pedido | URL obtida de Script Properties |
| n8n — rota | Enviar rota/mensagem ao motoboy | URL obtida de Script Properties |
| Google Drive | Resolver foto por `produto_id.extensão` | Pasta obtida de Script Properties, com fallback local |

## Superfície observada do n8n

O workflow local `MVP - Pedido estruturado WhatsApp Evolution` possui 27 nós e duas entradas POST:

- `evolution-pedidos-bolo-mvp`: recebe eventos de pedido/conversa da Evolution;
- `evolution-pedido-form-bolo-mvp`: recebe pedidos originados pelo formulário.

Consumidores observados no workflow:

- Apps Script por nós HTTP para catálogo, validação e cadastro;
- Evolution API por nós HTTP de resposta;
- OpenAI por nó de chat;
- PostgreSQL para memória de conversa e registro de atividade.

O arquivo é evidência local e não confirma que esta seja a revisão ativa do workflow.

## Stack Docker observada

| Serviço | Imagem observada | Papel |
|---|---|---|
| `n8n-postgres` | `postgres:16-alpine` | Banco do n8n |
| `n8n` | `docker.n8n.io/n8nio/n8n:latest` | Automação |
| `evolution-postgres` | `postgres:15-alpine` | Banco da Evolution |
| `evolution-redis` | `redis:7-alpine` | Estado/cache da Evolution |
| `evolution-api` | `evoapicloud/evolution-api:latest` | Transporte WhatsApp |

As imagens `latest` impedem reconstrução determinística sem registrar versão/digest do ambiente em execução.

## Evidências ainda necessárias

- exportar a lista real de triggers pelo painel/API do Apps Script;
- identificar deployment e versão atualmente publicados;
- exportar somente os nomes das Script Properties ativas;
- exportar configuração sanitizada do Worker/Pages, WAF, cache e rate limit;
- exportar a revisão ativa do n8n e listar webhooks habilitados;
- registrar versões ou digests dos containers em execução;
- confirmar produtores, consumidores, retry, timeout e proprietário operacional de cada integração.

