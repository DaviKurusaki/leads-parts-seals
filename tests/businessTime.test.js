import test from 'node:test';
import assert from 'node:assert/strict';
import { addBusinessDays, autoBatchSlot } from '../src/businessTime.js';
import { config } from '../src/config.js';

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

test('abre duas janelas automáticas no fuso de São Paulo', () => {
  assert.equal(
    autoBatchSlot(new Date('2026-07-27T12:30:05Z'))?.key,
    '2026-07-27T09:30',
  );
  assert.equal(
    autoBatchSlot(new Date('2026-07-27T17:45:59Z'))?.key,
    '2026-07-27T14:45',
  );
  assert.equal(autoBatchSlot(new Date('2026-07-27T16:00:00Z')), null);
});

test('tolera atraso do executor e mantém a chave do lote agendado', () => {
  assert.equal(
    autoBatchSlot(new Date('2026-07-27T12:36:00Z'))?.key,
    '2026-07-27T09:30',
  );
});

test('não agenda lotes automáticos aos fins de semana', () => {
  assert.equal(autoBatchSlot(new Date('2026-08-01T12:30:00Z')), null);
});

test('agenda possui capacidade efetiva de 60 envios automáticos por dia', () => {
  const slots = [
    '12:30', '12:45', '13:00', '13:15', '13:30',
    '17:00', '17:15', '17:30', '17:45', '18:00',
  ].filter((time) => autoBatchSlot(new Date(`2026-07-31T${time}:00Z`)));

  assert.equal(config.autoBatch.size, 6);
  assert.equal(config.autoBatch.maxPerDay, 60);
  assert.equal(config.autoBatch.maxPerHour, 30);
  assert.equal(slots.length * config.autoBatch.size, 60);
});
