import test from 'node:test';
import assert from 'node:assert/strict';
import { addBusinessDays, autoBatchSlot } from '../src/businessTime.js';

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

test('abre os lotes automáticos de 15 em 15 minutos no fuso de São Paulo', () => {
  assert.equal(
    autoBatchSlot(new Date('2026-07-27T17:00:05Z'))?.key,
    '2026-07-27T14:00',
  );
  assert.equal(
    autoBatchSlot(new Date('2026-07-27T18:30:59Z'))?.key,
    '2026-07-27T15:30',
  );
  assert.equal(autoBatchSlot(new Date('2026-07-27T18:45:00Z')), null);
});

test('agenda automática também funciona aos fins de semana', () => {
  assert.equal(
    autoBatchSlot(new Date('2026-08-01T17:00:00Z'))?.key,
    '2026-08-01T14:00',
  );
});
