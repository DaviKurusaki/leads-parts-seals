import fs from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { config, validateLiveSending } from './config.js';
import { stageMessage, textToHtml } from './template.js';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  return transporter;
}

export async function verifySmtp() {
  const issues = [];
  if (!config.senderEmail) issues.push('SENDER_EMAIL não foi preenchido.');
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
    issues.push('SMTP_HOST, SMTP_USER e SMTP_PASS precisam ser preenchidos.');
  }
  if (issues.length) return { ok: false, issues };
  try {
    await getTransporter().verify();
    return { ok: true, issues: [] };
  } catch (error) {
    return { ok: false, issues: [error.message] };
  }
}

async function saveDryRun({ lead, stage, target, message }) {
  const folder = path.resolve('./data/dry-run');
  await fs.mkdir(folder, { recursive: true });
  const safeCompany = lead.company.replace(/[^a-z0-9_-]+/gi, '-').replace(/-+/g, '-').slice(0, 60);
  const filename = `${new Date().toISOString().replaceAll(':', '-')}_${lead.id}_${stage + 1}_${safeCompany}.html`;
  const attachment = stage === 0 ? path.basename(config.brochureFile) : '';
  const html = `<!doctype html><meta charset="utf-8"><title>${message.subject}</title>
  <h3>PARA: ${target}</h3><h3>ASSUNTO: ${message.subject}</h3>
  ${attachment ? `<h3>ANEXO: ${attachment}</h3>` : ''}<hr>${textToHtml(message.text)}`;
  await fs.writeFile(path.join(folder, filename), html, 'utf8');
  return {
    messageId: `dry-run:${filename}`,
    previewFile: filename,
    attachment: attachment || null,
    dryRun: true,
  };
}

function leadMailOptions(lead, stage, target) {
  const message = stageMessage(lead, stage);
  const unsubscribeEmail = config.replyTo || config.senderEmail;
  const headers = {
    'X-Parts-Seals-Lead-ID': String(lead.id),
    'X-Parts-Seals-Stage': String(stage + 1),
  };
  if (unsubscribeEmail) headers['List-Unsubscribe'] = `<mailto:${unsubscribeEmail}?subject=REMOVER%20${message.tracking}>`;
  return {
    from: { name: config.senderName, address: config.senderEmail },
    to: target,
    replyTo: config.replyTo || undefined,
    subject: message.subject,
    text: message.text,
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:680px">${textToHtml(message.text)}</div>`,
    headers,
    attachments: stage === 0 ? [{
      filename: 'Apresentacao-Comercial-Parts-Seals.pdf',
      path: config.brochureFile,
      contentType: 'application/pdf',
    }] : [],
  };
}

async function resolveSentMailbox(client) {
  if (config.imap.sentMailbox) return config.imap.sentMailbox;
  const mailboxes = await client.list();
  return mailboxes.find((mailbox) => mailbox.specialUse === '\\Sent')?.path || '';
}

export async function saveLeadCopyToSent(lead, stage, target, {
  messageId = '',
  sentAt = new Date(),
} = {}) {
  if (!config.imap.enabled) return { saved: false, reason: 'IMAP desativado.' };
  if (!config.imap.host || !config.imap.user || !config.imap.pass) {
    return { saved: false, reason: 'Configuração IMAP incompleta.' };
  }

  const mailOptions = leadMailOptions(lead, stage, target);
  const rawTransport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: 'windows',
  });
  const rendered = await rawTransport.sendMail({
    ...mailOptions,
    messageId: messageId || undefined,
    date: sentAt,
  });

  const client = new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: config.imap.secure,
    auth: { user: config.imap.user, pass: config.imap.pass },
    logger: false,
  });

  try {
    await client.connect();
    const mailbox = await resolveSentMailbox(client);
    if (!mailbox) throw new Error('Pasta de enviados não localizada.');
    const appended = await client.append(mailbox, rendered.message, ['\\Seen'], sentAt);
    return { saved: true, mailbox, uid: appended?.uid || null };
  } finally {
    if (client.usable) await client.logout().catch(() => client.close());
  }
}

export async function sendLeadEmail(lead, stage = 0, targetOverride = '') {
  const target = String(targetOverride || lead.email || '').trim();
  if (!target) throw new Error('Lead sem e-mail.');
  if (lead.optedOut) throw new Error('Lead está na lista de supressão.');
  if (lead.bounce) throw new Error('Lead está bloqueado por bounce.');

  const message = stageMessage(lead, stage);
  if (config.sendMode !== 'live') return saveDryRun({ lead, stage, target, message });

  const issues = validateLiveSending();
  if (issues.length) throw new Error(`Envio ao vivo bloqueado: ${issues.join(' ')}`);

  const sentAt = new Date();
  const info = await getTransporter().sendMail(leadMailOptions(lead, stage, target));
  let sentCopy;
  try {
    sentCopy = await saveLeadCopyToSent(lead, stage, target, {
      messageId: info.messageId,
      sentAt,
    });
  } catch (error) {
    console.error(`E-mail enviado, mas a cópia não foi salva na pasta de enviados: ${error.message}`);
    sentCopy = { saved: false, reason: error.message };
  }
  return {
    messageId: info.messageId,
    response: info.response,
    dryRun: false,
    sentCopy,
  };
}
