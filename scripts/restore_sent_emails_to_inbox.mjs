import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { config } from '../src/config.js';
import { buildLeadMailOptions, selectSentMailbox } from '../src/mailer.js';
import { loadState } from '../src/store.js';

const apply = process.argv.includes('--apply');
const dateArgument = process.argv.find((argument) => argument.startsWith('--date='));

function localDate(value) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

const requestedDate = dateArgument?.slice('--date='.length) || localDate(new Date());
if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
  throw new Error('Use --date=AAAA-MM-DD.');
}

function messageId(value) {
  return String(value || '').trim().toLowerCase();
}

function imapClient() {
  return new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: config.imap.secure,
    auth: { user: config.imap.user, pass: config.imap.pass },
    connectionTimeout: 7_000,
    greetingTimeout: 5_000,
    socketTimeout: 30_000,
    logger: false,
  });
}

async function messagesSince(client, mailbox, since) {
  const sources = new Map();
  const lock = await client.getMailboxLock(mailbox);
  try {
    for await (const message of client.fetch({ since }, { source: true })) {
      const parsed = await simpleParser(message.source, { skipHtmlToText: true });
      const id = messageId(parsed.messageId);
      if (id) sources.set(id, message.source);
    }
  } finally {
    lock.release();
  }
  return sources;
}

async function renderEventMessage(event, lead) {
  const transport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: 'windows',
  });
  const rendered = await transport.sendMail({
    ...buildLeadMailOptions(lead, Number(event.stage) || 0, lead.email),
    bcc: undefined,
    messageId: event.messageId,
    date: new Date(event.at),
  });
  return rendered.message;
}

if (!config.imap.enabled || !config.imap.host || !config.imap.user || !config.imap.pass) {
  throw new Error('A configuração IMAP está incompleta.');
}

const state = await loadState();
const events = state.events
  .filter((event) => (
    event.type === 'email.sent'
    && !event.dryRun
    && localDate(event.at) === requestedDate
  ))
  .sort((left, right) => new Date(left.at) - new Date(right.at));
const leadsById = new Map(state.leads.map((lead) => [Number(lead.id), lead]));
const missingLeads = events.filter((event) => !leadsById.has(Number(event.leadId)));
if (missingLeads.length) {
  throw new Error(`${missingLeads.length} eventos não possuem lead correspondente.`);
}

const client = imapClient();
await client.connect();
try {
  const mailboxes = await client.list();
  const sentMailbox = selectSentMailbox(mailboxes, config.imap.sentMailbox);
  if (!sentMailbox) throw new Error('Pasta oficial de enviados não localizada.');

  const since = new Date(`${requestedDate}T00:00:00-03:00`);
  since.setUTCDate(since.getUTCDate() - 1);
  const inboxMessages = await messagesSince(client, config.imap.mailbox, since);
  const sentMessages = await messagesSince(client, sentMailbox, since);
  const pending = events.filter((event) => !inboxMessages.has(messageId(event.messageId)));
  const exactCopies = pending.filter((event) => sentMessages.has(messageId(event.messageId))).length;
  const exactCopyBytes = pending.reduce(
    (total, event) => total + (sentMessages.get(messageId(event.messageId))?.length || 0),
    0,
  );

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'preview',
    date: requestedDate,
    sentEvents: events.length,
    alreadyInInbox: events.length - pending.length,
    pending,
    exactCopies,
    exactCopyBytes,
    exactCopyMegabytes: Number((exactCopyBytes / 1024 / 1024).toFixed(1)),
    reconstructedCopies: pending.length - exactCopies,
    inboxMailbox: config.imap.mailbox,
    sentMailbox,
  }, (key, value) => key === 'pending' ? value.length : value, 2));

  if (!apply) {
    console.log('Nenhuma alteração realizada. Use --apply para copiar as mensagens pendentes.');
    process.exitCode = pending.length ? 2 : 0;
  } else {
    let restored = 0;
    for (const event of pending) {
      const id = messageId(event.messageId);
      const lead = leadsById.get(Number(event.leadId));
      const source = sentMessages.get(id) || await renderEventMessage(event, lead);
      await client.append(config.imap.mailbox, source, [], new Date(event.at));
      restored += 1;
    }
    console.log(JSON.stringify({ restored, skipped: events.length - pending.length }, null, 2));
  }
} finally {
  if (client.usable) await client.logout().catch(() => client.close());
}
