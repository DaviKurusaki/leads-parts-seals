import { config } from './config.js';

export function replacePlaceholders(text = '') {
  return String(text)
    .replaceAll('{{NOME_REMETENTE}}', config.senderName)
    .replaceAll('{{TELEFONE_REMETENTE}}', config.senderPhone)
    .replaceAll('{{SITE_REMETENTE}}', config.senderSite)
    .replaceAll('{{EMAIL_REMETENTE}}', config.senderEmail);
}

export function stageMessage(lead, stage = 0) {
  if (!lead) throw new Error('Lead inválido.');
  const bodies = [lead.initialBody, lead.followup1Body, lead.followup2Body];
  const body = replacePlaceholders(bodies[stage] || bodies[0] || '');
  const subject = stage === 0 ? lead.subject : `Re: ${lead.subject}`;
  const footer = replacePlaceholders(lead.privacyFooter || 'Para não receber novas mensagens, responda com REMOVER.');
  const tracking = `PS-${lead.id}-${stage + 1}`;
  return {
    subject: replacePlaceholders(subject),
    text: `${body.trim()}\n\n---\n${footer}\nReferência: ${tracking}`,
    tracking,
  };
}

export function textToHtml(text = '') {
  const escaped = String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
  return escaped
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 14px;line-height:1.55">${block.replaceAll('\n', '<br>')}</p>`)
    .join('');
}
