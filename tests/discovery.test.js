import test from 'node:test';
import assert from 'node:assert/strict';
import { discoveredLead, isCorporateEmail, normalizeUf } from '../src/discovery.js';

test('aceita apenas UF válida e e-mail corporativo', () => {
  assert.equal(normalizeUf('sp'), 'SP');
  assert.equal(normalizeUf('XX'), '');
  assert.equal(isCorporateEmail('vendas@empresa.com.br'), true);
  assert.equal(isCorporateEmail('pessoa@gmail.com'), false);
});

test('lead descoberto entra pendente de revisão', () => {
  const lead = discoveredLead({
    company: 'Empresa Teste',
    city: 'Campinas',
    uf: 'SP',
    segment: 'Industrial',
    email: 'vendas@empresa.com.br',
    emailSource: 'https://empresa.com.br/contato',
    companySource: 'https://empresa.com.br/',
    confidence: 'Alta',
  }, 999);
  assert.equal(lead.approved, false);
  assert.equal(lead.campaignStatus, 'Aguardando revisão');
  assert.equal(lead.sourceType, 'web-discovery');
});
