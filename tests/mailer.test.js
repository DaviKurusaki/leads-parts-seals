import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLeadMailOptions,
  isTransientSmtpError,
  selectSentMailbox,
} from '../src/mailer.js';

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

test('prefere a pasta oficial marcada pelo servidor como Enviados', () => {
  const mailboxes = [
    { path: 'INBOX.enviadas', specialUse: '\\Sent' },
    { path: 'INBOX.Itens Enviados' },
    { path: 'INBOX.Sent' },
  ];
  assert.equal(selectSentMailbox(mailboxes, 'INBOX.Itens Enviados'), 'INBOX.enviadas');
});

test('usa a pasta oficial mesmo quando há outra pasta configurada', () => {
  const mailboxes = [
    { path: 'INBOX.enviadas', specialUse: '\\Sent' },
    { path: 'INBOX.Sent' },
  ];
  assert.equal(selectSentMailbox(mailboxes, 'INBOX.Sent'), 'INBOX.enviadas');
});

test('mantém a pasta configurada quando o servidor não marca uma pasta oficial', () => {
  const mailboxes = [
    { path: 'INBOX.Itens Enviados' },
    { path: 'INBOX.Sent' },
  ];
  assert.equal(selectSentMailbox(mailboxes, 'inbox.sent'), 'INBOX.Sent');
});

test('envia cópia oculta de toda prospecção para a caixa comercial', () => {
  const options = buildLeadMailOptions({
    id: 123,
    subject: 'Assunto',
    initialBody: 'Mensagem inicial',
    privacyFooter: 'Responda REMOVER para sair.',
  }, 0, 'prospect@example.com');

  assert.equal(options.to, 'prospect@example.com');
  assert.equal(options.bcc, 'vendas@parts-seals.com.br');
});
