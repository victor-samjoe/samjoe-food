import assert from 'node:assert/strict';
import test from 'node:test';
import { PIX_EXPIRATION_MINUTES, pixExpirationDate } from '../src/payment-config.js';

test('Pix oficial expira 30 minutos após a emissão', () => {
  const issuedAt = new Date('2026-10-15T12:00:00.000Z');
  assert.equal(PIX_EXPIRATION_MINUTES, 30);
  assert.equal(pixExpirationDate(issuedAt), '2026-10-15T12:30:00.000Z');
});
