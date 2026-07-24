import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { config } from './config.js';
import { addEvent, getState, saveState, updateLead } from './store.js';

const REMOVE_PATTERNS = [
  /\bremover\b/i,
  /\bdescadastr/i,
  /\bunsubscribe\b/i,
  /não\s+(quero|desejo)\s+receber/i,
  /nao\s+(quero|desejo)\s+receber/i,
  /pare\s+de\s+enviar/i,
];

function knownLeadByEmail(address) {
  const normalized = String(address || '').trim().toLowerCase();
  return getState().leads.find((lead) => lead.email === normalized);
}

function findLeadInBounce(text) {
  const lower = String(text || '').toLowerCase();
  return getState().leads.find((lead) => lead.email && lower.includes(lead.email));
}

function isBounceSender(address) {
  return /mailer-daemon|postmaster|mail-daemon|delivery-status/i.test(String(address || ''));
}

export async function syncInbox() {
  if (!config.imap.enabled) return { ok: false, reason: 'IMAP está desativado no .env.' };
  const required = [config.imap.host, config.imap.user, config.imap.pass];
  if (required.some((value) => !value)) return { ok: false, reason: 'Configuração IMAP incompleta.' };

  const client = new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: config.imap.secure,
    auth: { user: config.imap.user, pass: config.imap.pass },
    logger: false,
  });

  let processed = 0;
  let replies = 0;
  let removals = 0;
  let bounces = 0;

  await client.connect();
  const lock = await client.getMailboxLock(config.imap.mailbox);
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    for await (const message of client.fetch({ since }, { uid: true, envelope: true, source: true })) {
      const uidKey = `${config.imap.mailbox}:${message.uid}`;
      if (getState().processedUids.includes(uidKey)) continue;
      getState().processedUids.push(uidKey);
      processed += 1;

      const parsed = await simpleParser(message.source);
      const from = parsed.from?.value?.[0]?.address?.toLowerCase() || '';
      const text = `${parsed.subject || ''}\n${parsed.text || ''}`;

      if (isBounceSender(from)) {
        const lead = findLeadInBounce(text);
        if (lead) {
          updateLead(lead.id, {
            bounce: (parsed.subject || 'Mensagem devolvida').slice(0, 300),
            campaignStatus: 'Bounce',
            paused: true,
          });
          addEvent('inbox.bounce', { leadId: lead.id, email: lead.email, subject: parsed.subject || '' });
          bounces += 1;
        }
        continue;
      }

      const lead = knownLeadByEmail(from);
      if (!lead) continue;
      const wantsRemoval = REMOVE_PATTERNS.some((pattern) => pattern.test(text));
      if (wantsRemoval) {
        updateLead(lead.id, {
          optedOut: true,
          replied: true,
          paused: true,
          campaignStatus: 'Opt-out',
          response: (parsed.text || parsed.subject || '').slice(0, 2000),
          responseClass: 'Opt-out',
        });
        addEvent('inbox.optout', { leadId: lead.id, email: lead.email, subject: parsed.subject || '' });
        removals += 1;
      } else {
        updateLead(lead.id, {
          replied: true,
          paused: true,
          campaignStatus: 'Respondeu',
          response: (parsed.text || parsed.subject || '').slice(0, 4000),
          responseClass: lead.responseClass || 'A classificar',
        });
        addEvent('inbox.reply', { leadId: lead.id, email: lead.email, subject: parsed.subject || '' });
        replies += 1;
      }
    }
  } finally {
    lock.release();
    await client.logout();
  }

  getState().processedUids = getState().processedUids.slice(-5000);
  await saveState();
  return { ok: true, processed, replies, removals, bounces };
}
