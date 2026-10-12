# Solicitação de evidências para concluir o Marco 0

Não incluir tokens, chaves, senhas ou dados pessoais reais. Preferir cópias anonimizadas e exportações somente leitura.

## Planilha operacional

- [x] Template XLSX local auditado: 12 abas e 1.194 fórmulas.
- [x] Nomes das abas e cabeçalhos completos do template local.
- [x] Fórmulas das linhas-modelo do template local, sem dados de clientes.
- [x] Validações de dados e ausência de intervalos nomeados no template local.
- [ ] Aba `Configuracao` com valores sensíveis substituídos por marcadores.
- [ ] Amostra anonimizada de cada estado de pedido, pagamento e entrega.
- [ ] Contagem de linhas por aba e crescimento mensal.

## Base de clientes

- [x] Template XLSX local auditado: 6 abas e tabelas principais vazias.
- [x] Cabeçalhos completos de `Clientes` e `Enderecos` no template local.
- [ ] Regras de deduplicação usadas manualmente pela operação.
- [ ] Contagem de telefones ausentes, inválidos e duplicados.
- [ ] Contagem de clientes sem evidência de aceite e com valores não padronizados.
- [ ] Amostra anonimizada incluindo múltiplos endereços.

## Apps Script

- [x] Cópia de produção local e manifesto encontrados em `.tmp`.
- [x] Gatilhos criados pelo código identificados: abertura da planilha e reconciliação de pagamentos a cada 5 minutos.
- [ ] Manifesto `appsscript.json` da implantação ativa.
- [ ] Lista de triggers simples, instaláveis e agendados.
- [ ] Identificação da versão/deployment atualmente publicado.
- [ ] Lista de Script Properties apenas pelos nomes, nunca pelos valores.
- [ ] Confirmação de quais arquivos locais correspondem à versão ativa.

## Cloudflare e domínios

- [ ] Rotas, hostnames e projetos ativos.
- [ ] Variáveis apenas pelos nomes e escopo.
- [ ] Regras de cache, WAF e rate limit relevantes.
- [ ] Origem e fallback ativos do domínio público.

## n8n e Evolution

- [x] Três backups históricos do workflow principal inventariados.
- [x] Duas entradas POST e consumidores do workflow local catalogados estaticamente.
- [ ] Exportação sanitizada dos workflows ativos.
- [ ] Webhooks produtores/consumidores e eventos habilitados.
- [ ] Política atual de retry e timeout.
- [ ] Versões implantadas e volume diário de execuções.
- [ ] Procedimento atual para reconectar WhatsApp.

## Mercado Pago

- [ ] Ambiente usado por deployment: teste ou produção.
- [ ] Eventos de webhook habilitados.
- [ ] Volume de orders e distribuição de estados dos últimos 90 dias.
- [ ] Casos conhecidos de pagamento não conciliado, duplicado ou estornado.

## Baseline operacional

- [ ] Produtos ativos/inativos e SKUs sem correspondência.
- [ ] Pedidos por dia e pico por hora.
- [ ] Ticket médio e percentual por método de pagamento.
- [ ] Percentual de entrega, retirada, cancelamento e falha.
- [ ] Tempo entre criação, confirmação, produção, saída e conclusão.
- [ ] Incidentes recorrentes e correções manuais feitas pela equipe.

