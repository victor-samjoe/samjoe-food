# Auditoria estrutural das planilhas locais

Data da auditoria: 2026-10-10. Leitura somente estrutural; nenhum arquivo de origem foi modificado.

## Base de clientes

Arquivo localizado em `E:\samjoe\Bolo_Pote_Docker_n8n_Evolution\Planilhas`.

| Aba | Dimensão | Cabeçalho | Linhas constantes após cabeçalho | Fórmulas |
|---|---:|---:|---:|---:|
| LEIA-ME | A1:F32 | 10 | 20 | 0 |
| Clientes | A1:N504 | 4 | 0 | 0 |
| Enderecos | A1:Y1004 | 4 | 0 | 0 |
| Integracao_n8n | A1:H24 | 4 | 19 | 0 |
| Dashboard | A1:H18 | 3 | 9 | 8 |
| Listas | A1:H5 | 1 | 4 | 0 |

### Estrutura confirmada

- `Clientes`: 14 colunas, incluindo ID, telefone, nome, status, origem, aceite, datas e agregados de compra.
- `Enderecos`: 25 colunas, incluindo partes do endereço, coordenadas, `place_id`, validação, distância e área.
- Validações de lista existem para status, origem, aceite, tipo de endereço, validação, área e ativo.
- Não existem links externos nem nomes definidos no arquivo.

### Conclusão

O arquivo é um modelo estrutural sem registros de clientes/endereço após os cabeçalhos. Ele serve para schema e validações, mas não para estimar qualidade ou volume dos dados de produção.

## Sistema operacional

Arquivo localizado em `E:\samjoe\Bolo_Pote_Docker_n8n_Evolution\Planilhas`.

| Aba | Dimensão | Linhas constantes após cabeçalho | Linhas com fórmula após cabeçalho | Fórmulas |
|---|---:|---:|---:|---:|
| Configuracao | A1:D28 | 19 | 0 | 0 |
| Pedidos | A1:AE203 | 0 | 199 | 1.194 |
| Roteiro | A1:J25 | 14 | 10 | 35 |
| Dashboard | A1:H36 | 17 | 12 | 21 |
| Instrucoes | A1:F27 | 22 | 0 | 0 |
| Motoboys | A1:H500 | 0 | 0 | 0 |
| Rotas | A1:O500 | 0 | 0 | 0 |
| ItensRota | A1:L500 | 0 | 0 | 0 |
| ItensPedido | A1:I500 | 0 | 0 | 0 |
| Produtos | A1:I500 | 0 | 0 | 0 |
| LogsMVP | A1:H500 | 0 | 0 | 0 |
| Painel_Web | A1:F31 | 20 | 0 | 0 |

### Estrutura confirmada

- `Pedidos` possui 31 colunas no arquivo exportado e 199 linhas preparadas com fórmulas.
- O Apps Script posterior acrescenta colunas financeiras além das 31 existentes; portanto, o arquivo não representa integralmente o schema mais recente.
- Existem validações para pagamento, situação do pedido, entrega, motoboy, rota, produto ativo e status de entrega.
- Abas operacionais estão sem registros constantes; `Pedidos` contém fórmulas-modelo, não pedidos preenchidos.
- Não existem links externos nem nomes definidos no arquivo.

### Conclusão

O arquivo é um template operacional. Ele é valioso para preservar fórmulas, validações e layout, mas não contém a base histórica necessária para migração ou baseline de volume.

## Implicação para a migração

Os dois arquivos resolvem a descoberta de schema local, porém ainda será necessária uma exportação atual, somente leitura e sanitizada das planilhas Google efetivamente usadas em produção. A extração deve preservar fórmulas separadas de valores e registrar a data/hora do snapshot.

O mapeamento campo a campo e as decisões de normalização estão em `LEGACY_SCHEMA_MAP.md`.

