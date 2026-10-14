import assert from 'node:assert/strict';
import test from 'node:test';
import { deliveryFee } from '../src/checkout.js';

const rule = {
  tenant_id: 'tenant-a',
  store_id: 'store-a',
  currency: 'BRL',
  rule_id: 'rule-a',
  version: 'test-v1',
  base_fee_cents: 500,
  included_meters: 3_000,
  price_per_extra_km_cents: 200,
  standard_radius_meters: 5_000,
  maximum_radius_meters: 10_000,
  exception_fee_cents: 400,
  free_delivery_radius_meters: 2_000,
  store_postal_code: '01310100',
  store_address: null,
};

test('frete é grátis abaixo do limite configurado', () => {
  assert.equal(deliveryFee(rule, 1_999), 0);
});

test('frete é grátis exatamente no limite configurado', () => {
  assert.equal(deliveryFee(rule, 2_000), 0);
});

test('frete volta à regra comercial acima do limite grátis', () => {
  assert.equal(deliveryFee(rule, 2_001), 500);
  assert.equal(deliveryFee(rule, 4_000), 700);
});

test('zero desativa a faixa de frete grátis', () => {
  assert.equal(deliveryFee({ ...rule, free_delivery_radius_meters: 0 }, 1_000), 500);
});
