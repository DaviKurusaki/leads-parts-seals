import { getState } from './store.js';

const normalize = (value) => String(value || '')
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .trim()
  .toLowerCase();

export function responseBucket(lead) {
  if (lead.optedOut || normalize(lead.responseClass).includes('opt-out')) return 'optedOut';
  const value = normalize(lead.responseClass);
  if (['nao interessado', 'sem interesse', 'negativo', 'recusou', 'nao quer'].some((term) => value.includes(term))) {
    return 'notInterested';
  }
  if (['interessado', 'interesse', 'positivo', 'oportunidade'].some((term) => value.includes(term))) {
    return 'interested';
  }
  if (lead.replied) return 'unclassified';
  return 'noReply';
}

function percent(part, total) {
  return total ? Number(((part / total) * 100).toFixed(1)) : 0;
}

function summarize(leads) {
  const count = (fn) => leads.filter(fn).length;
  const sent = count((lead) => Boolean(lead.sentAt));
  const replied = count((lead) => Boolean(lead.replied));
  const interested = count((lead) => responseBucket(lead) === 'interested');
  const notInterested = count((lead) => responseBucket(lead) === 'notInterested');
  const optedOut = count((lead) => responseBucket(lead) === 'optedOut');
  const unclassified = count((lead) => responseBucket(lead) === 'unclassified');
  const bounced = count((lead) => Boolean(lead.bounce));

  return {
    total: leads.length,
    withEmail: count((lead) => lead.canSend && lead.email),
    sent,
    replied,
    interested,
    notInterested,
    optedOut,
    unclassified,
    bounced,
    responseRate: percent(replied, sent),
    interestRate: percent(interested, replied),
    rejectionRate: percent(notInterested, replied),
    optOutRate: percent(optedOut, sent),
    deliveryRate: percent(Math.max(sent - bounced, 0), sent),
  };
}

export function stats() {
  const leads = getState().leads;
  const events = getState().events;
  const summary = summarize(leads);
  const count = (fn) => leads.filter(fn).length;
  const lastBatchStarted = events.find((event) => event.type === 'email.batch.started') || null;
  const lastBatchCompleted = events.find((event) => event.type === 'email.batch.completed') || null;
  const batchWithoutCompletion = lastBatchStarted && (
    !lastBatchCompleted
    || new Date(lastBatchStarted.at) > new Date(lastBatchCompleted.at)
  );
  const batchAgeMs = batchWithoutCompletion
    ? Date.now() - new Date(lastBatchStarted.at).getTime()
    : 0;
  return {
    ...summary,
    withoutEmail: count((lead) => !lead.canSend || !lead.email),
    highConfidence: count((lead) => lead.confidence === 'Alta'),
    moderateConfidence: count((lead) => lead.confidence === 'Moderada'),
    approved: count((lead) => lead.approved),
    eligibleNow: count((lead) => lead.approved && lead.canSend && !lead.optedOut && !lead.bounce && !lead.replied && !lead.paused),
    campaignActive: getState().campaign.active,
    automation: {
      inProgress: Boolean(batchWithoutCompletion && batchAgeMs < 20 * 60_000),
      delayed: Boolean(batchWithoutCompletion && batchAgeMs >= 20 * 60_000),
      lastStartedAt: lastBatchStarted?.at || null,
      lastCompletedAt: lastBatchCompleted?.at || null,
      lastProcessed: lastBatchCompleted?.processed ?? null,
      lastStoppedReason: lastBatchCompleted?.stoppedReason || '',
    },
  };
}

export function stateKpis() {
  const groups = new Map();
  for (const lead of getState().leads) {
    const uf = String(lead.uf || 'N/I').trim().toUpperCase() || 'N/I';
    if (!groups.has(uf)) groups.set(uf, []);
    groups.get(uf).push(lead);
  }
  return [...groups.entries()]
    .map(([uf, leads]) => ({ uf, ...summarize(leads) }))
    .sort((a, b) => b.interested - a.interested || b.replied - a.replied || b.total - a.total || a.uf.localeCompare(b.uf));
}

function csvCell(value) {
  const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function exportCsv() {
  const fields = [
    ['ID', 'id'], ['Empresa', 'company'], ['UF', 'uf'], ['Cidade', 'city'], ['E-mail', 'email'],
    ['Confiança', 'confidence'], ['Aprovado', 'approved'], ['Status', 'campaignStatus'],
    ['Enviado em', 'sentAt'], ['Follow-up 1', 'followup1At'], ['Follow-up 2', 'followup2At'],
    ['Respondeu', 'replied'], ['Classificação', 'responseClass'], ['Opt-out', 'optedOut'],
    ['Bounce', 'bounce'], ['Observações', 'notes'],
  ];
  const rows = [fields.map(([label]) => csvCell(label)).join(';')];
  for (const lead of getState().leads) {
    rows.push(fields.map(([, key]) => csvCell(lead[key])).join(';'));
  }
  return `\uFEFF${rows.join('\n')}`;
}
