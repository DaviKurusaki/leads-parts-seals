import { config } from './config.js';
import { addEvent, getLead, getState, refreshState, saveState, updateLead } from './store.js';
import { autoBatchSlot, dateKey, isBusinessWindow, nextStageDueAt } from './businessTime.js';
import { sendLeadEmail } from './mailer.js';
import { activeClientMatch } from './activeClients.js';
import {
  cancelEmailJob,
  claimBatchSlot,
  completeEmailJob,
  enqueueAndClaimEmailJob,
  failEmailJob,
} from './supabaseStore.js';

let timer = null;
let running = false;
let batchRunning = false;
let lastLocalBatchSlot = '';
const workerId = `${process.env.COMPUTERNAME || 'parts-seals'}-${process.pid}`;

function sentEvents() {
  return getState().events.filter((event) => event.type === 'email.sent' && !event.dryRun);
}

export function limitStatus(now = new Date(), overrides = {}) {
  const events = sentEvents();
  const maxPerDay = overrides.maxPerDay ?? config.limits.maxPerDay;
  const maxPerHour = overrides.maxPerHour ?? config.limits.maxPerHour;
  const today = dateKey(now);
  const hourAgo = now.getTime() - 60 * 60 * 1000;
  const todayCount = events.filter((e) => dateKey(new Date(e.at)) === today).length;
  const hourCount = events.filter((e) => new Date(e.at).getTime() >= hourAgo).length;
  const lastSendAt = getState().campaign.lastSendAt ? new Date(getState().campaign.lastSendAt) : null;
  const intervalReady = !lastSendAt || now.getTime() - lastSendAt.getTime() >= config.limits.minIntervalMinutes * 60_000;
  return {
    todayCount,
    hourCount,
    maxPerDay,
    maxPerHour,
    dayReady: todayCount < maxPerDay,
    hourReady: hourCount < maxPerHour,
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

export async function processNext({
  ignoreBusinessWindow = false,
  ignoreInterval = false,
  limitOverrides = {},
} = {}) {
  if (running) return { ok: false, reason: 'Já existe um envio em processamento.' };
  running = true;
  let claimedJob = null;
  let emailWasSent = false;
  try {
    if (config.dataBackend === 'supabase') await refreshState({ force: true });
    const now = new Date();
    if (!ignoreBusinessWindow && !isBusinessWindow(now)) {
      return { ok: false, reason: 'Fora do horário comercial configurado.' };
    }
    const limits = limitStatus(now, limitOverrides);
    if (!limits.dayReady) return { ok: false, reason: 'Limite diário atingido.', limits };
    if (!limits.hourReady) return { ok: false, reason: 'Limite por hora atingido.', limits };
    if (!ignoreInterval && !limits.intervalReady) {
      return { ok: false, reason: 'Intervalo mínimo ainda não concluído.', limits };
    }

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
    emailWasSent = !result.dryRun;
    const at = new Date().toISOString();
    let campaignPaused = false;

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

    if (!result.dryRun && config.requireSentCopy && !result.sentCopy?.saved) {
      const reason = result.sentCopy?.reason || 'A cópia não foi salva na pasta Enviados.';
      updateLead(lead.id, {
        notes: [lead.notes, `Cópia em Enviados falhou: ${reason}`].filter(Boolean).join(' | '),
      });
      getState().campaign.active = false;
      getState().campaign.pausedAt = at;
      addEvent('email.sentCopy.failed', {
        leadId: lead.id,
        company: lead.company,
        email: lead.email,
        messageId: result.messageId,
        reason,
      });
      addEvent('campaign.paused', { reason: 'Falha ao salvar cópia em Enviados.' });
      campaignPaused = true;
    }

    if (claimedJob) await completeEmailJob(claimedJob.id, result.messageId);
    await saveState();
    return {
      ok: true,
      leadId: lead.id,
      company: lead.company,
      stage,
      campaignPaused,
      ...result,
    };
  } catch (error) {
    if (claimedJob && !emailWasSent) {
      await failEmailJob(claimedJob.id, error.message).catch(console.error);
    }
    if (emailWasSent) {
      getState().campaign.active = false;
      getState().campaign.pausedAt = new Date().toISOString();
      addEvent('campaign.paused', { reason: 'Falha após confirmação do envio; revisão manual necessária.' });
    }
    addEvent('email.error', { message: error.message });
    await saveState();
    return { ok: false, reason: error.message };
  } finally {
    running = false;
  }
}

export async function processScheduledBatch({ now = new Date() } = {}) {
  if (batchRunning) return { ok: true, skipped: 'Já existe um lote em processamento.' };
  batchRunning = true;
  try {
    if (config.dataBackend === 'supabase') await refreshState({ force: true });
    if (!getState().campaign.active) return { ok: true, skipped: 'Campanha pausada.' };

    const slot = autoBatchSlot(now);
    if (!slot) return { ok: true, skipped: 'Fora da agenda automática.' };

    let claimed = false;
    if (config.dataBackend === 'supabase') {
      claimed = await claimBatchSlot(slot.key, now);
    } else if (lastLocalBatchSlot !== slot.key) {
      lastLocalBatchSlot = slot.key;
      claimed = true;
    }
    if (!claimed) return { ok: true, skipped: 'Este lote já foi processado.', slot: slot.key };

    addEvent('email.batch.started', {
      slot: slot.key,
      window: slot.window,
      batchSize: config.autoBatch.size,
    });
    const results = [];
    let stoppedReason = '';
    for (let index = 0; index < config.autoBatch.size; index += 1) {
      const result = await processNext({
        ignoreBusinessWindow: true,
        ignoreInterval: true,
        limitOverrides: {
          maxPerDay: config.autoBatch.maxPerDay,
          maxPerHour: config.autoBatch.maxPerHour,
        },
      });
      if (!result.ok) {
        stoppedReason = result.reason;
        break;
      }
      results.push({
        leadId: result.leadId,
        company: result.company,
        stage: result.stage,
        dryRun: result.dryRun,
        sentCopySaved: result.sentCopy?.saved ?? null,
      });
      if (result.campaignPaused) {
        stoppedReason = 'Campanha pausada porque a cópia em Enviados falhou.';
        break;
      }
    }
    addEvent('email.batch.completed', {
      slot: slot.key,
      window: slot.window,
      requested: config.autoBatch.size,
      processed: results.length,
      stoppedReason,
    });
    await saveState();
    return {
      ok: true,
      slot: slot.key,
      window: slot.window,
      requested: config.autoBatch.size,
      processed: results.length,
      stoppedReason: stoppedReason || null,
      results,
    };
  } finally {
    batchRunning = false;
  }
}

async function tick() {
  await processScheduledBatch();
}

export function startScheduler() {
  if (timer) return;
  tick().catch(console.error);
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
