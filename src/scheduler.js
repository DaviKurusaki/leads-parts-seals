import { config } from './config.js';
import { addEvent, getLead, getState, refreshState, saveState, updateLead } from './store.js';
import { dateKey, isBusinessWindow, nextStageDueAt } from './businessTime.js';
import { sendLeadEmail } from './mailer.js';
import { activeClientMatch } from './activeClients.js';
import {
  cancelEmailJob,
  completeEmailJob,
  enqueueAndClaimEmailJob,
  failEmailJob,
} from './supabaseStore.js';

let timer = null;
let running = false;
const workerId = `${process.env.COMPUTERNAME || 'parts-seals'}-${process.pid}`;

function sentEvents() {
  return getState().events.filter((event) => event.type === 'email.sent' && !event.dryRun);
}

export function limitStatus(now = new Date()) {
  const events = sentEvents();
  const today = dateKey(now);
  const hourAgo = now.getTime() - 60 * 60 * 1000;
  const todayCount = events.filter((e) => dateKey(new Date(e.at)) === today).length;
  const hourCount = events.filter((e) => new Date(e.at).getTime() >= hourAgo).length;
  const lastSendAt = getState().campaign.lastSendAt ? new Date(getState().campaign.lastSendAt) : null;
  const intervalReady = !lastSendAt || now.getTime() - lastSendAt.getTime() >= config.limits.minIntervalMinutes * 60_000;
  return {
    todayCount,
    hourCount,
    dayReady: todayCount < config.limits.maxPerDay,
    hourReady: hourCount < config.limits.maxPerHour,
    intervalReady,
  };
}

export function determineNextStage(lead, now = new Date()) {
  if (!lead.sentAt) return 0;
  if (!lead.followup1At) {
    const due = nextStageDueAt(lead, 1);
    return due && now >= due ? 1 : null;
  }
  if (!lead.followup2At) {
    const due = nextStageDueAt(lead, 2);
    return due && now >= due ? 2 : null;
  }
  return null;
}

export function isEligible(lead, now = new Date()) {
  if (!lead.canSend || !lead.email || !lead.approved) return false;
  if (lead.optedOut || lead.bounce || lead.replied || lead.paused) return false;
  if (activeClientMatch(lead, getState().activeClients || [])) return false;
  if (config.sendMode !== 'live' && lead.dryRunGenerated) return false;
  return determineNextStage(lead, now) !== null;
}

export function nextCandidate(now = new Date()) {
  return getState().leads
    .filter((lead) => isEligible(lead, now))
    .sort((a, b) => {
      const priority = { 'A - Alta': 0, 'B - Média': 1, 'C - Baixa': 2 };
      const pa = priority[a.priority] ?? 3;
      const pb = priority[b.priority] ?? 3;
      if (pa !== pb) return pa - pb;
      const confidence = { Alta: 0, Moderada: 1, Baixa: 2 };
      const ca = confidence[a.confidence] ?? 3;
      const cb = confidence[b.confidence] ?? 3;
      if (ca !== cb) return ca - cb;
      return Number(a.id) - Number(b.id);
    })[0] || null;
}

export async function processNext({ ignoreBusinessWindow = false } = {}) {
  if (running) return { ok: false, reason: 'Já existe um envio em processamento.' };
  running = true;
  let claimedJob = null;
  try {
    if (config.dataBackend === 'supabase') await refreshState({ force: true });
    const now = new Date();
    if (!ignoreBusinessWindow && !isBusinessWindow(now)) {
      return { ok: false, reason: 'Fora do horário comercial configurado.' };
    }
    const limits = limitStatus(now);
    if (!limits.dayReady) return { ok: false, reason: 'Limite diário atingido.', limits };
    if (!limits.hourReady) return { ok: false, reason: 'Limite por hora atingido.', limits };
    if (!limits.intervalReady) return { ok: false, reason: 'Intervalo mínimo ainda não concluído.', limits };

    let lead;
    let stage;
    if (config.dataBackend === 'supabase') {
      const eligible = getState().leads
        .filter((candidate) => isEligible(candidate, now))
        .map((candidate) => ({ lead: candidate, stage: determineNextStage(candidate, now) }));

      for (let attempt = 0; attempt < 20; attempt += 1) {
        claimedJob = await enqueueAndClaimEmailJob(eligible, workerId);
        if (!claimedJob) break;
        lead = getLead(claimedJob.lead_id);
        stage = lead ? determineNextStage(lead, now) : null;
        if (lead && isEligible(lead, now) && stage === claimedJob.stage) break;
        await cancelEmailJob(claimedJob.id, 'Lead não está mais elegível.');
        claimedJob = null;
        lead = null;
      }
    } else {
      lead = nextCandidate(now);
      stage = lead ? determineNextStage(lead, now) : null;
    }

    if (!lead) return { ok: false, reason: 'Nenhum lead elegível no momento.' };
    const result = await sendLeadEmail(lead, stage);
    const at = new Date().toISOString();

    if (result.dryRun) {
      updateLead(lead.id, {
        dryRunGenerated: true,
        campaignStatus: 'Prévia gerada',
        notes: [lead.notes, `Prévia salva em ${result.previewFile}`].filter(Boolean).join(' | '),
      });
    } else if (stage === 0) {
      updateLead(lead.id, { sentAt: at, stage: 1, campaignStatus: 'Enviado 1' });
    } else if (stage === 1) {
      updateLead(lead.id, { followup1At: at, stage: 2, campaignStatus: 'Follow-up 1 enviado' });
    } else if (stage === 2) {
      updateLead(lead.id, { followup2At: at, stage: 3, campaignStatus: 'Follow-up 2 enviado', paused: true });
    }

    lead.messageIds = [...(lead.messageIds || []), { stage, at, messageId: result.messageId }];
    getState().campaign.lastSendAt = at;
    addEvent('email.sent', { leadId: lead.id, company: lead.company, email: lead.email, stage, dryRun: result.dryRun, messageId: result.messageId });
    await saveState();
    if (claimedJob) await completeEmailJob(claimedJob.id, result.messageId);
    return { ok: true, leadId: lead.id, company: lead.company, stage, ...result };
  } catch (error) {
    if (claimedJob) await failEmailJob(claimedJob.id, error.message).catch(console.error);
    addEvent('email.error', { message: error.message });
    await saveState();
    return { ok: false, reason: error.message };
  } finally {
    running = false;
  }
}

async function tick() {
  if (config.dataBackend === 'supabase') await refreshState({ force: true });
  const state = getState();
  if (!state.campaign.active) return;
  await processNext();
}

export function startScheduler() {
  if (timer) return;
  timer = setInterval(() => tick().catch(console.error), 60_000);
  timer.unref?.();
}

export async function activateCampaign() {
  getState().campaign.active = true;
  getState().campaign.startedAt ||= new Date().toISOString();
  getState().campaign.pausedAt = null;
  addEvent('campaign.started');
  await saveState();
}

export async function pauseCampaign() {
  getState().campaign.active = false;
  getState().campaign.pausedAt = new Date().toISOString();
  addEvent('campaign.paused');
  await saveState();
}
