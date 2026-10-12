import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildProvisioningInput,
  isValidCnpj,
  isValidCpf,
  normalizeDomain,
  slugify,
} from './tenant-provisioning.js';

test('normaliza nome em slug estável', () => {
  assert.equal(slugify('Café da Ana & Filhos'), 'cafe-da-ana-filhos');
});

test('valida CPF e CNPJ pelos dígitos verificadores', () => {
  assert.equal(isValidCpf('529.982.247-25'), true);
  assert.equal(isValidCpf('111.111.111-11'), false);
  assert.equal(isValidCnpj('12.345.678/0001-95'), true);
  assert.equal(isValidCnpj('11.111.111/1111-11'), false);
});

test('normaliza domínio sem protocolo', () => {
  assert.equal(normalizeDomain('HTTPS://Loja.Exemplo.com.br/'), 'loja.exemplo.com.br');
});

test('monta cadastro mínimo e mantém data de nascimento opcional', () => {
  const input = buildProvisioningInput({
    email: 'dona@example.com',
    'owner-name': 'Dona Exemplo',
    'business-name': 'Café Exemplo',
    document: '12.345.678/0001-95',
  });
  assert.equal(input.tenantSlug, 'cafe-exemplo');
  assert.equal(input.storeSlug, 'cafe-exemplo');
  assert.equal(input.documentType, 'CNPJ');
  assert.equal(input.birthDate, null);
});
