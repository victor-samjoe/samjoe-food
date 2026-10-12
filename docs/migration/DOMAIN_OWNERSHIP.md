# Fontes de verdade e fronteiras de domínio

| Domínio | Fonte atual | Fonte futura | Transição |
|---|---|---|---|
| Catálogo, preço e disponibilidade | Sheets/Apps Script | FoodApp | Importação e leitura sombra |
| Imagens de produto | Google Drive via Apps Script | R2/S3 via FoodApp | Cópia verificada e mapa por ID legado |
| Carrinho e checkout | HTML/Cloudflare + Apps Script | FoodApp | Troca de rota após paridade |
| Clientes e endereços operacionais | Sheets | FoodApp | Importação, deduplicação e IDs externos |
| Pedidos e itens | Sheets/Apps Script | FoodApp | Corte único; Sheets vira projeção temporária |
| Estoque disponível | Sheets/regras do formulário | FoodApp | Reserva transacional antes do corte de pedidos |
| Pagamentos | Apps Script + Mercado Pago | FoodApp | Webhook/reconciliação antes do corte |
| Entregas e rotas | Sheets + Google Routes | FoodApp/adaptador de localização | Migração após pedidos |
| CRM e contatos comerciais | Parcialmente Sheets | Sales Engine | Eventos do FoodApp e importação controlada |
| Consentimento de marketing | Não há trilha suficiente | Sales Engine | Importar apenas evidência comprovável |
| Campanhas e atribuição | n8n/manual | Sales Engine | n8n permanece transporte |
| Transporte WhatsApp | n8n + Evolution | n8n + provedor | Sem regra comercial no workflow |
| Custos e fichas técnicas | Sistema de custos | Sistema de custos | Snapshot versionado por SKU |
| Automação operacional | n8n | n8n/Jarvis | Sem ser fonte de verdade |

## Regra de autoridade

Durante a migração, cada domínio terá um campo explícito `authoritative_system` no plano operacional. Alterá-lo exige gate aprovado, horário registrado, responsável e rollback pronto.

