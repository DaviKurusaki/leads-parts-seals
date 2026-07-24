import test from 'node:test';
import assert from 'node:assert/strict';
import { addBusinessDays } from '../src/businessTime.js';

test('pula sábado e domingo ao calcular follow-up', () => {
  const friday = new Date('2026-07-24T12:00:00Z');
  const result = addBusinessDays(friday, 1);
  assert.equal(result.toISOString().slice(0, 10), '2026-07-27');
});

test('soma quatro dias úteis', () => {
  const monday = new Date('2026-07-20T12:00:00Z');
  const result = addBusinessDays(monday, 4);
  assert.equal(result.toISOString().slice(0, 10), '2026-07-24');
});
