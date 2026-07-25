import './env.js';
import path from 'node:path';

function intEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
}

function boolEnv(name, fallback = false) {
  const value = String(process.env[name] ?? '').trim().toLowerCase();
  if (!value) return fallback;
  return ['1', 'true', 'sim', 'yes', 'on'].includes(value);
}

export const config = Object.freeze({
  port: intEnv('PORT', 3210),
  timezone: process.env.TIMEZONE || 'America/Sao_Paulo',
  workbookPath: path.resolve(process.env.DATA_WORKBOOK || './data/campanha.xlsx'),
  stateFile: path.resolve(process.env.STATE_FILE || './data/state.json'),
  sendMode: (process.env.SEND_MODE || 'dry-run').toLowerCase(),
  domainAuthConfirmed: boolEnv('DOMAIN_AUTH_CONFIRMED', false),

  senderName: process.env.SENDER_NAME || 'Parts Seals',
  senderEmail: process.env.SENDER_EMAIL || '',
  senderPhone: process.env.SENDER_PHONE || '',
  senderSite: process.env.SENDER_SITE || 'https://parts-seals.com.br',
  replyTo: process.env.REPLY_TO || process.env.SENDER_EMAIL || '',
  brochureFile: path.resolve(
    process.env.BROCHURE_FILE || './output/pdf/apresentacao-comercial-parts-seals.pdf',
  ),

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: intEnv('SMTP_PORT', 587),
    secure: boolEnv('SMTP_SECURE', false),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },

  imap: {
    enabled: boolEnv('IMAP_ENABLED', false),
    host: process.env.IMAP_HOST || '',
    port: intEnv('IMAP_PORT', 993),
    secure: boolEnv('IMAP_SECURE', true),
    user: process.env.IMAP_USER || '',
    pass: process.env.IMAP_PASS || '',
    mailbox: process.env.IMAP_MAILBOX || 'INBOX',
    sentMailbox: process.env.IMAP_SENT_MAILBOX || '',
  },

  limits: {
    maxPerDay: intEnv('MAX_PER_DAY', 20),
    maxPerHour: intEnv('MAX_PER_HOUR', 5),
    minIntervalMinutes: intEnv('MIN_INTERVAL_MINUTES', 8),
    businessStart: process.env.BUSINESS_START || '08:00',
    businessEnd: process.env.BUSINESS_END || '17:00',
    followup1BusinessDays: intEnv('FOLLOWUP1_BUSINESS_DAYS', 4),
    followup2BusinessDays: intEnv('FOLLOWUP2_BUSINESS_DAYS', 9),
  },

  dkimSelector: process.env.DKIM_SELECTOR || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-5.4',
});

export function publicConfig() {
  return {
    port: config.port,
    timezone: config.timezone,
    sendMode: config.sendMode,
    domainAuthConfirmed: config.domainAuthConfirmed,
    senderName: config.senderName,
    senderEmail: config.senderEmail,
    senderPhone: config.senderPhone,
    senderSite: config.senderSite,
    imapEnabled: config.imap.enabled,
    researchEnabled: Boolean(config.openaiApiKey),
    discoveryEnabled: Boolean(config.openaiApiKey),
    limits: config.limits,
  };
}

export function validateLiveSending() {
  const issues = [];
  if (config.sendMode !== 'live') issues.push('SEND_MODE não está como live.');
  if (!config.domainAuthConfirmed) issues.push('DOMAIN_AUTH_CONFIRMED não está como true.');
  if (!config.senderEmail) issues.push('SENDER_EMAIL não foi preenchido.');
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
    issues.push('SMTP_HOST, SMTP_USER e SMTP_PASS precisam ser preenchidos.');
  }
  return issues;
}
