import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { readCampaignWorkbook } from './workbook.js';
import { filterActiveClients } from './activeClients.js';

let state = null;
let writeChain = Promise.resolve();

async function readLeadSeed() {
  try {
    return JSON.parse(await fs.readFile(config.leadSeedFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function applyLeadSeed(currentState) {
  const seed = await readLeadSeed();
  if (!seed?.leads?.length || currentState.leadSeedVersion === seed.version) return false;
  const preserved = currentState.leads.filter((lead) => (
    lead.sourceType !== 'rfb-open-data'
    && lead.canSend
    && lead.email
  ));
  const existingEmails = new Set(preserved.map((lead) => lead.email.toLowerCase()));
  const seedAdditions = seed.leads.filter((lead) => !existingEmails.has(lead.email.toLowerCase()));
  const { kept: additions, suppressed } = await filterActiveClients(seedAdditions);
  currentState.leads = [...preserved, ...additions];
  currentState.leadSeedVersion = seed.version;
  addEvent('leads.seedApplied', {
    source: seed.source,
    preserved: preserved.length,
    additions: additions.length,
    activeClientsSuppressed: suppressed.length,
    total: currentState.leads.length,
  });
  return true;
}

function initialState(leads) {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    campaign: {
      active: false,
      startedAt: null,
      pausedAt: null,
      lastSendAt: null,
    },
    leads,
    events: [],
    processedUids: [],
  };
}

export async function saveState() {
  if (!state) throw new Error('Estado ainda não carregado.');
  state.updatedAt = new Date().toISOString();
  await fs.mkdir(path.dirname(config.stateFile), { recursive: true });
  const temp = `${config.stateFile}.tmp`;
  writeChain = writeChain.then(async () => {
    await fs.writeFile(temp, JSON.stringify(state, null, 2), 'utf8');
    await fs.rename(temp, config.stateFile);
  });
  return writeChain;
}

export async function loadState() {
  if (state) return state;
  let changed = false;
  try {
    state = JSON.parse(await fs.readFile(config.stateFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const leads = await readCampaignWorkbook();
    const { kept, suppressed } = await filterActiveClients(leads);
    state = initialState(kept);
    if (suppressed.length) {
      addEvent('leads.activeClientsSuppressed', {
        count: suppressed.length,
        leads: suppressed,
      });
    }
    await saveState();
  }
  const current = await filterActiveClients(state.leads);
  if (current.suppressed.length) {
    state.leads = current.kept;
    addEvent('leads.activeClientsSuppressed', {
      count: current.suppressed.length,
      leads: current.suppressed,
    });
    changed = true;
  }
  if (await applyLeadSeed(state)) changed = true;
  if (changed) await saveState();
  return state;
}

export function getState() {
  if (!state) throw new Error('Estado ainda não carregado.');
  return state;
}

export function getLead(id) {
  return getState().leads.find((lead) => Number(lead.id) === Number(id));
}

export function updateLead(id, patch) {
  const lead = getLead(id);
  if (!lead) throw new Error('Lead não encontrado.');
  Object.assign(lead, patch, { updatedAt: new Date().toISOString() });
  return lead;
}

export function addEvent(type, details = {}) {
  const event = { id: crypto.randomUUID(), type, at: new Date().toISOString(), ...details };
  getState().events.unshift(event);
  getState().events = getState().events.slice(0, 2000);
  return event;
}

export async function resetFromWorkbook() {
  const leads = await readCampaignWorkbook();
  const { kept, suppressed } = await filterActiveClients(leads);
  state = initialState(kept);
  if (suppressed.length) {
    addEvent('leads.activeClientsSuppressed', {
      count: suppressed.length,
      leads: suppressed,
    });
  }
  await applyLeadSeed(state);
  await saveState();
  return state;
}
