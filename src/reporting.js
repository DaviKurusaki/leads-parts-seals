import { getState } from './store.js';

export function stats() {
  const leads = getState().leads;
  const count = (fn) => leads.filter(fn).length;
  return {
    total: leads.length,
    withEmail: count((l) => l.canSend && l.email),
    withoutEmail: count((l) => !l.canSend || !l.email),
    highConfidence: count((l) => l.confidence === 'Alta'),
    moderateConfidence: count((l) => l.confidence === 'Moderada'),
    approved: count((l) => l.approved),
    sent: count((l) => Boolean(l.sentAt)),
    replied: count((l) => l.replied),
    optedOut: count((l) => l.optedOut),
    bounced: count((l) => Boolean(l.bounce)),
    eligibleNow: count((l) => l.approved && l.canSend && !l.optedOut && !l.bounce && !l.replied && !l.paused),
    campaignActive: getState().campaign.active,
  };
}

function csvCell(value) {
  const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function exportCsv() {
  const fields = [
    ['ID', 'id'], ['Empresa', 'company'], ['E-mail', 'email'], ['Confiança', 'confidence'],
    ['Aprovado', 'approved'], ['Status', 'campaignStatus'], ['Enviado em', 'sentAt'],
    ['Follow-up 1', 'followup1At'], ['Follow-up 2', 'followup2At'], ['Respondeu', 'replied'],
    ['Classificação', 'responseClass'], ['Opt-out', 'optedOut'], ['Bounce', 'bounce'], ['Observações', 'notes'],
  ];
  const rows = [fields.map(([label]) => csvCell(label)).join(';')];
  for (const lead of getState().leads) {
    rows.push(fields.map(([, key]) => csvCell(lead[key])).join(';'));
  }
  return `\uFEFF${rows.join('\n')}`;
}
