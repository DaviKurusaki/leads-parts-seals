import fs from 'node:fs/promises';
import { config } from '../src/config.js';
import { getSupabaseAdmin, verifySupabaseSchema } from '../src/supabase.js';

const apply = process.argv.includes('--apply');
const batchSize = 100;

const leadColumnMap = {
  emailSource: 'email_source',
  canSend: 'can_send',
  commercialProfile: 'commercial_profile',
  regionalMarket: 'regional_market',
  suggestedProducts: 'suggested_products',
  personalizationBasis: 'personalization_basis',
  humanReview: 'human_review',
  initialBody: 'initial_body',
  followup1Body: 'followup1_body',
  followup2Body: 'followup2_body',
  privacyFooter: 'privacy_footer',
  campaignStatus: 'campaign_status',
  approvedAt: 'approved_at',
  sentAt: 'sent_at',
  followup1At: 'followup1_at',
  followup2At: 'followup2_at',
  responseClass: 'response_class',
  optedOut: 'opted_out',
  regionalSource: 'regional_source',
  specificSource: 'specific_source',
  researchPrompt: 'research_prompt',
  dryRunGenerated: 'dry_run_generated',
  messageIds: 'message_ids',
  sourceType: 'source_type',
  cnaeDescription: 'cnae_description',
  mxValidatedAt: 'mx_validated_at',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

const allowedLeadColumns = new Set([
  'id', 'company', 'segment', 'city', 'uf', 'region', 'priority', 'email',
  'email_source', 'can_send', 'commercial_profile', 'regional_market', 'applications',
  'suggested_products', 'differentiation', 'personalization_basis', 'confidence',
  'human_review', 'subject', 'greeting', 'initial_body', 'followup1_body',
  'followup2_body', 'cta', 'privacy_footer', 'campaign_status', 'approved',
  'approved_at', 'sent_at', 'followup1_at', 'followup2_at', 'response',
  'response_class', 'opted_out', 'bounce', 'notes', 'regional_source',
  'specific_source', 'research_prompt', 'version', 'stage', 'replied', 'paused',
  'dry_run_generated', 'message_ids', 'research', 'source_type', 'cnpj', 'cnae',
  'cnae_description', 'mx_validated_at', 'created_at', 'updated_at',
]);

const nonNullableTextColumns = [
  'company', 'segment', 'city', 'uf', 'region', 'priority', 'email', 'email_source',
  'commercial_profile', 'regional_market', 'applications', 'suggested_products',
  'differentiation', 'personalization_basis', 'confidence', 'human_review', 'subject',
  'greeting', 'initial_body', 'followup1_body', 'followup2_body', 'cta', 'privacy_footer',
  'campaign_status', 'response', 'response_class', 'bounce', 'notes', 'regional_source',
  'specific_source', 'research_prompt', 'version', 'source_type', 'cnpj', 'cnae',
  'cnae_description',
];

function leadRow(lead) {
  const row = Object.fromEntries(Object.entries(lead)
    .map(([key, value]) => [leadColumnMap[key] || key, value])
    .filter(([key]) => allowedLeadColumns.has(key)));
  for (const column of nonNullableTextColumns) {
    if (row[column] == null) row[column] = '';
  }
  row.message_ids = Array.isArray(row.message_ids) ? row.message_ids : [];
  return row;
}

function normalizedTokens(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);
}

function emailCompanyScore(lead) {
  const domain = String(lead.email || '').toLowerCase().split('@')[1]?.split('.')[0] || '';
  return normalizedTokens(lead.company)
    .filter((token) => domain.includes(token))
    .reduce((score, token) => score + token.length, 0);
}

function prepareLeadRows(leads) {
  const byEmail = new Map();
  for (const lead of leads) {
    const normalizedEmail = String(lead.email || '').trim().toLowerCase();
    if (!normalizedEmail) continue;
    if (!byEmail.has(normalizedEmail)) byEmail.set(normalizedEmail, []);
    byEmail.get(normalizedEmail).push(lead);
  }

  const duplicateLosers = new Set();
  for (const group of byEmail.values()) {
    if (group.length < 2) continue;
    const [winner, ...losers] = [...group].sort((left, right) => (
      emailCompanyScore(right) - emailCompanyScore(left)
      || Number(left.id) - Number(right.id)
    ));
    for (const loser of losers) duplicateLosers.add(Number(loser.id));
    console.log(`E-mail duplicado: lead ${winner.id} mantido; ${losers.map((lead) => lead.id).join(', ')} bloqueado(s).`);
  }

  return leads.map((lead) => {
    if (!duplicateLosers.has(Number(lead.id))) return leadRow(lead);
    return leadRow({
      ...lead,
      email: '',
      canSend: false,
      approved: false,
      paused: true,
      campaignStatus: 'E-mail duplicado — revisar',
      notes: [lead.notes, `E-mail removido na migração por duplicidade: ${lead.email}`]
        .filter(Boolean)
        .join(' | '),
    });
  });
}

function activeClientRow(client) {
  return {
    code: client.code,
    name: client.name,
    legal_name: client.legalName || '',
    city: client.city || '',
    cnpj: client.cnpj || '',
    email: client.email || '',
    site: client.site || '',
  };
}

function eventRow(event, leadIds) {
  const { id, type, at, leadId, ...details } = event;
  const hasLead = leadId != null && leadIds.has(Number(leadId));
  return {
    id,
    type,
    at,
    lead_id: hasLead ? Number(leadId) : null,
    details: hasLead || leadId == null ? details : { ...details, originalLeadId: leadId },
  };
}

async function upsertBatches(client, table, rows, onConflict) {
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    const { error } = await client.from(table).upsert(batch, { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
    process.stdout.write(`\r${table}: ${Math.min(index + batch.length, rows.length)}/${rows.length}`);
  }
  process.stdout.write('\n');
}

const state = JSON.parse(await fs.readFile(config.stateFile, 'utf8'));
const activeRegistry = JSON.parse(await fs.readFile(config.activeClientsFile, 'utf8'));
const clients = Array.isArray(activeRegistry.clients) ? activeRegistry.clients : [];

console.log(JSON.stringify({
  mode: apply ? 'apply' : 'check',
  leads: state.leads.length,
  activeClients: clients.length,
  events: state.events.length,
  processedUids: state.processedUids.length,
}, null, 2));

await verifySupabaseSchema();
if (!apply) {
  console.log('Estrutura validada. Execute novamente com --apply para importar.');
  process.exit(0);
}

const supabase = getSupabaseAdmin();
const campaign = {
  id: 1,
  active: Boolean(state.campaign?.active),
  started_at: state.campaign?.startedAt || null,
  paused_at: state.campaign?.pausedAt || null,
  last_send_at: state.campaign?.lastSendAt || null,
  lead_seed_version: state.leadSeedVersion || null,
};
const { error: campaignError } = await supabase.from('campaigns').upsert(campaign, { onConflict: 'id' });
if (campaignError) throw new Error(`campaigns: ${campaignError.message}`);

const leadIds = new Set(state.leads.map((lead) => Number(lead.id)));
await upsertBatches(supabase, 'leads', prepareLeadRows(state.leads), 'id');
await upsertBatches(supabase, 'active_clients', clients.map(activeClientRow), 'code');
await upsertBatches(supabase, 'events', state.events.map((event) => eventRow(event, leadIds)), 'id');

const processedRows = state.processedUids.map((uid) => ({ mailbox: 'INBOX', uid: String(uid) }));
if (processedRows.length) {
  await upsertBatches(supabase, 'processed_imap_uids', processedRows, 'mailbox,uid');
}

const { error: sequenceError } = await supabase.rpc('sync_leads_identity');
if (sequenceError) throw new Error(`sync_leads_identity: ${sequenceError.message}`);

const counts = {};
for (const table of ['leads', 'active_clients', 'events', 'processed_imap_uids']) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  counts[table] = count;
}
console.log(JSON.stringify({ ok: true, counts }, null, 2));
