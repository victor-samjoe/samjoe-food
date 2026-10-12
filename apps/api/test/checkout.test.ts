import assert from 'node:assert/strict';
import test from 'node:test';
import { simulatedDistanceMeters } from '../src/checkout.js';

test('simulador de distância é determinístico para CEP fictício', () => {
  assert.equal(simulatedDistanceMeters('01000000'), 2_500);
  assert.equal(simulatedDistanceMeters('05000000'), 8_500);
  assert.equal(simulatedDistanceMeters('09000000'), 14_500);
});

