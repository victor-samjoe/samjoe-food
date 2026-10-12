import assert from 'node:assert/strict';
import test from 'node:test';
import { canTransitionOrder } from '../src/order-status.js';

test('permite o fluxo feliz de entrega', () => {
  assert.equal(canTransitionOrder('NEW', 'CONFIRMED'), true);
  assert.equal(canTransitionOrder('READY', 'OUT_FOR_DELIVERY'), true);
  assert.equal(canTransitionOrder('OUT_FOR_DELIVERY', 'COMPLETED'), true);
});

test('rejeita regressão e alteração de terminal', () => {
  assert.equal(canTransitionOrder('IN_PREPARATION', 'NEW'), false);
  assert.equal(canTransitionOrder('COMPLETED', 'CANCELLED'), false);
  assert.equal(canTransitionOrder('CANCELLED', 'NEW'), false);
});

