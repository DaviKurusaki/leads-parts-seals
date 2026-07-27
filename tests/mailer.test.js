import test from 'node:test';
import assert from 'node:assert/strict';
import { isTransientSmtpError } from '../src/mailer.js';

test('classifica respostas SMTP 4xx como temporárias', () => {
  assert.equal(isTransientSmtpError({ responseCode: 451 }), true);
  assert.equal(isTransientSmtpError({ responseCode: 421 }), true);
});

test('não repete respostas SMTP 5xx permanentes', () => {
  assert.equal(isTransientSmtpError({ responseCode: 550 }), false);
});

test('repete erros temporários de conexão', () => {
  assert.equal(isTransientSmtpError({ code: 'ETIMEDOUT' }), true);
  assert.equal(isTransientSmtpError({ code: 'ECONNRESET' }), true);
  assert.equal(isTransientSmtpError({ code: 'EAUTH' }), false);
});
