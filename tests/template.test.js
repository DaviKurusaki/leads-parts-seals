import test from 'node:test';
import assert from 'node:assert/strict';
import { replacePlaceholders, stageMessage } from '../src/template.js';

test('substitui placeholders conhecidos', () => {
  const result = replacePlaceholders('{{NOME_REMETENTE}} | {{SITE_REMETENTE}}');
  assert.ok(!result.includes('{{NOME_REMETENTE}}'));
  assert.ok(!result.includes('{{SITE_REMETENTE}}'));
});

test('follow-up mantém o assunto em thread', () => {
  const lead = { id: 7, subject: 'Teste', initialBody: 'Inicial', followup1Body: 'F1', followup2Body: 'F2', privacyFooter: 'Remover' };
  assert.equal(stageMessage(lead, 1).subject, 'Re: Teste');
  assert.match(stageMessage(lead, 2).text, /F2/);
});
