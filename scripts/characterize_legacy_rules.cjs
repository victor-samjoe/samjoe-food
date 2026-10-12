#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const defaultSource = 'E:\\samjoe\\.tmp\\samjoe-production-appsscript\\MVP_Operacao_Web_V3.js';
const sourcePath = path.resolve(process.argv[2] || defaultSource);

if (!fs.existsSync(sourcePath)) {
  console.error(`Fonte do legado não encontrada: ${sourcePath}`);
  process.exit(2);
}

const context = vm.createContext({ console: { log() {} } });
vm.runInContext(fs.readFileSync(sourcePath, 'utf8'), context, {
  filename: sourcePath,
  timeout: 5_000,
});

function legacy(expression) {
  return vm.runInContext(expression, context, { timeout: 1_000 });
}

function check(label, expression, expected) {
  const actual = legacy(expression);
  assert.deepEqual(actual, expected, `${label}: resultado divergente`);
  process.stdout.write(`ok - ${label}\n`);
}

const cases = [
  ['telefone vazio', 'mvpNormalizarTelefone_(null)', ''],
  ['telefone brasileiro formatado', "mvpNormalizarTelefone_('(11) 99999-0000')", '5511999990000'],
  ['telefone com prefixo zero', "mvpNormalizarTelefone_('011 99999-0000')", '5511999990000'],
  ['telefone E.164 sem sinal', "mvpNormalizarTelefone_('55 11 99999-0000')", '5511999990000'],
  ['telefone curto permanece aceito pelo legado', "mvpNormalizarTelefone_('123')", '123'],
  ['texto remove acento, caixa e espaços', "mvpNormalizarTexto_('  Em   PRODUÇÃO  ')", 'em producao'],
  ['endereço recebe país', "mvpNormalizarEndereco_('Rua Exemplo, 100')", 'Rua Exemplo, 100, Brasil'],
  ['endereço com país não é alterado', "mvpNormalizarEndereco_('Rua Exemplo, Brasil')", 'Rua Exemplo, Brasil'],
  ['endereço vazio expõe comportamento legado', "mvpNormalizarEndereco_('')", ', Brasil'],
  ['status com variação de acento', "mvpNormalizarStatusPedido_(' EM PRODUÇÃO ')", 'Em produção'],
  ['status desconhecido vira Novo', "mvpNormalizarStatusPedido_('estado futuro')", 'Novo'],
  ['duração fracionária arredonda para cima', "mvpDurationMinutes_('61s')", 2],
  ['duração inválida vira zero', "mvpDurationMinutes_('abc')", 0],
  ['escape HTML cobre atributos e tags', "mvpEscapeHtml_(`<a x='\"'>&`)", '&lt;a x=&#39;&quot;&#39;&gt;&amp;'],
  ['pagamento aprovado', "mvpMapearStatusMercadoPago_('processed', 'accredited')", 'PAGO'],
  ['pagamento parcialmente reembolsado', "mvpMapearStatusMercadoPago_('processed', 'partially_refunded')", 'REEMBOLSO_PARCIAL'],
  ['pagamento em ação necessária', "mvpMapearStatusMercadoPago_('action_required', '')", 'PENDENTE'],
  ['pagamento desconhecido fica explícito', "mvpMapearStatusMercadoPago_('future_status', '')", 'DESCONHECIDO'],
];

for (const [label, expression, expected] of cases) {
  check(label, expression, expected);
}

context.__configValues = {
  B6: 5,
  B7: 10,
  B12: 5,
  B13: 3,
  B14: 2,
  B15: 4,
  B19: 1,
  B20: 0.5,
  B21: 12,
  B22: 5,
};
vm.runInContext(`
  mvpPlanilhaOperacional_ = function () {
    return {
      getSheetByName: function () {
        return {
          getRange: function (cell) {
            return { getValue: function () { return __configValues[cell]; } };
          }
        };
      }
    };
  };
`, context);

const calculatedCases = [
  ['área no limite padrão', 'mvpClassificarArea_(5)', 'DENTRO_5KM'],
  ['área acima do limite padrão', 'mvpClassificarArea_(5.01)', 'EXCECAO_5_10KM'],
  ['área no limite máximo', 'mvpClassificarArea_(10)', 'EXCECAO_5_10KM'],
  ['área acima do limite máximo', 'mvpClassificarArea_(10.01)', 'FORA_10KM'],
  ['frete dentro dos km incluídos', 'mvpCalcularFrete_(2)', 5],
  ['frete no limite padrão sem adicional', 'mvpCalcularFrete_(5)', 9],
  ['frete fora do padrão com adicional', 'mvpCalcularFrete_(6)', 15],
  ['frete no limite máximo', 'mvpCalcularFrete_(10)', 23],
  ['frete acima do máximo vira zero no legado', 'mvpCalcularFrete_(10.01)', 0],
  ['custo de rota combina distância, tempo e paradas', 'mvpCalcularCustoRota_(10, 30, 2)', 23],
];

for (const [label, expression, expected] of calculatedCases) {
  check(label, expression, expected);
}

process.stdout.write(`\n${cases.length + calculatedCases.length} caracterizações aprovadas.\n`);

