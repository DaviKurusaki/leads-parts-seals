import { getSupabaseAdmin } from './supabase.js';

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

const databaseToLeadMap = Object.fromEntries(
  Object.entries(leadColumnMap).map(([application, database]) => [database, application]),
);

function leadFromRow(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [databaseToLeadMap[key] || key, value]),
  );
}

function leadToRow(lead) {
  return Object.fromEntries(
    Object.entries(lead).map(([key, value]) => [leadColumnMap[key] || key, value]),
  );
}

function activeClientFromRow(row) {
  return {
    code: row.code,
    name: row.name,
    legalName: row.legal_name || '',
    city: row.city || '',
    cnpj: row.cnpj || '',
    email: row.email || '',
    site: row.site || '',
  };
}

function eventFromRow(row) {
  return {
    id: row.id,
    type: row.type,
    at: row.at,
    ...(row.lead_id == null ? {} : { leadId: row.lead_id }),
    ...(row.details || {}),
  };
}

function eventToRow(event) {
  const { id, type, at, leadId, ...details } = event;
  return {
    id,
    type,
    at,
    lead_id: leadId || null,
    details,
  };
}

async function readAll(table, {
  select = '*',
  order = 'id',
  ascending = true,
  pageSize = 1000,
} = {}) {
  const client = getSupabaseAdmin();
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    let query = client.from(table).select(select).range(from, from + pageSize - 1);
    if (order) query = query.order(order, { ascending });
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

function latestValue(rows, key) {
  return rows.reduce((latest, row) => {
    const value = row[key] || '';
    return value > latest ? value : latest;
  }, '');
}

function stateSignature({ campaign, leadRows, activeClientRows, eventRows, processedRows }) {
  return JSON.stringify({
    campaign: campaign.updated_at || '',
    leads: [leadRows.length, latestValue(leadRows, 'updated_at')],
    activeClients: [activeClientRows.length, latestValue(activeClientRows, 'updated_at')],
    events: [eventRows.length, latestValue(eventRows, 'at')],
    processedUids: [processedRows.length, latestValue(processedRows, 'processed_at')],
  });
}

async function latestTableSignature(table, timestampColumn) {
  const { data, count, error } = await getSupabaseAdmin()
    .from(table)
    .select(timestampColumn, { count: 'exact' })
    .order(timestampColumn, { ascending: false })
    .limit(1);
  if (error) throw new Error(`${table}: ${error.message}`);
  return [count || 0, data?.[0]?.[timestampColumn] || ''];
}

export async function getSupabaseSignature() {
  const client = getSupabaseAdmin();
  const campaignResult = await client.from('campaigns').select('updated_at').eq('id', 1).single();
  if (campaignResult.error) throw new Error(`campaigns: ${campaignResult.error.message}`);
  const leads = await latestTableSignature('leads', 'updated_at');
  const activeClients = await latestTableSignature('active_clients', 'updated_at');
  const events = await latestTableSignature('events', 'at');
  const processedUids = await latestTableSignature('processed_imap_uids', 'processed_at');
  return JSON.stringify({
    campaign: campaignResult.data.updated_at || '',
    leads,
    activeClients,
    events,
    processedUids,
  });
}

export async function loadSupabaseState() {
  const client = getSupabaseAdmin();
  const campaignResult = await client.from('campaigns').select('*').eq('id', 1).single();
  if (campaignResult.error) throw new Error(`campaigns: ${campaignResult.error.message}`);
  const leadRows = await readAll('leads');
  const activeClientRows = await readAll('active_clients');
  const eventResult = await client.from('events').select('*').order('at', { ascending: false }).limit(2000);
  if (eventResult.error) throw new Error(`events: ${eventResult.error.message}`);
  const processedRows = await readAll('processed_imap_uids', { order: 'processed_at' });
  const campaign = campaignResult.data;
  const now = new Date().toISOString();
  const signature = stateSignature({
    campaign,
    leadRows,
    activeClientRows,
    eventRows: eventResult.data,
    processedRows,
  });

  return {
    version: 2,
    createdAt: campaign.created_at || now,
    updatedAt: campaign.updated_at || now,
    campaign: {
      active: Boolean(campaign.active),
      startedAt: campaign.started_at,
      pausedAt: campaign.paused_at,
      lastSendAt: campaign.last_send_at,
    },
    leads: leadRows.map(leadFromRow),
    activeClients: activeClientRows.map(activeClientFromRow),
    events: eventResult.data.map(eventFromRow),
    processedUids: processedRows.map((row) => String(row.uid)),
    leadSeedVersion: campaign.lead_seed_version,
    _supabaseSignature: signature,
  };
}

export async function saveSupabaseState(state, {
  dirtyLeadIds = [],
  dirtyEventIds = [],
} = {}) {
  const client = getSupabaseAdmin();
  const leadIds = new Set([...dirtyLeadIds].map(Number));
  const eventIds = new Set(dirtyEventIds);
  const dirtyLeads = state.leads.filter((lead) => leadIds.has(Number(lead.id)));
  const dirtyEvents = state.events.filter((event) => eventIds.has(event.id));

  const operations = [
    client.from('campaigns').upsert({
      id: 1,
      active: Boolean(state.campaign.active),
      started_at: state.campaign.startedAt || null,
      paused_at: state.campaign.pausedAt || null,
      last_send_at: state.campaign.lastSendAt || null,
      lead_seed_version: state.leadSeedVersion || null,
    }, { onConflict: 'id' }),
  ];

  if (dirtyLeads.length) {
    operations.push(client.from('leads').upsert(dirtyLeads.map(leadToRow), { onConflict: 'id' }));
  }
  if (dirtyEvents.length) {
    operations.push(client.from('events').upsert(dirtyEvents.map(eventToRow), { onConflict: 'id' }));
  }
  if (state.processedUids.length) {
    operations.push(client.from('processed_imap_uids').upsert(
      state.processedUids.map((uid) => ({ mailbox: 'INBOX', uid: String(uid) })),
      { onConflict: 'mailbox,uid', ignoreDuplicates: true },
    ));
  }

  for (const operation of operations) {
    const result = await operation;
    if (result.error) throw new Error(`Falha ao salvar no Supabase: ${result.error.message}`);
  }
}

export async function enqueueAndClaimEmailJob(eligibleLeads, workerId) {
  const client = getSupabaseAdmin();
  if (eligibleLeads.length) {
    const rows = eligibleLeads.map(({ lead, stage }) => ({
      lead_id: lead.id,
      stage,
      status: 'pending',
      available_at: new Date().toISOString(),
    }));
    const { error } = await client.from('email_jobs').upsert(rows, {
      onConflict: 'lead_id,stage',
      ignoreDuplicates: true,
    });
    if (error) throw new Error(`Fila de e-mail: ${error.message}`);
  }

  const { data, error } = await client.rpc('claim_next_email_job', { worker_id: workerId });
  if (error) throw new Error(`Reserva da fila: ${error.message}`);
  return data?.[0] || null;
}

export async function completeEmailJob(jobId, messageId = '') {
  const { error } = await getSupabaseAdmin()
    .from('email_jobs')
    .update({
      status: 'sent',
      message_id: messageId || null,
      locked_at: null,
      locked_by: null,
      last_error: null,
    })
    .eq('id', jobId);
  if (error) throw new Error(`Conclusão da fila: ${error.message}`);
}

export async function failEmailJob(jobId, message) {
  const retryAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const { error } = await getSupabaseAdmin()
    .from('email_jobs')
    .update({
      status: 'failed',
      available_at: retryAt,
      locked_at: null,
      locked_by: null,
      last_error: String(message || '').slice(0, 1000),
    })
    .eq('id', jobId);
  if (error) throw new Error(`Falha ao registrar erro da fila: ${error.message}`);
}

export async function cancelEmailJob(jobId, reason = '') {
  const { error } = await getSupabaseAdmin()
    .from('email_jobs')
    .update({
      status: 'cancelled',
      locked_at: null,
      locked_by: null,
      last_error: String(reason || '').slice(0, 1000) || null,
    })
    .eq('id', jobId);
  if (error) throw new Error(`Cancelamento da fila: ${error.message}`);
}

export async function resetEmailJobs(leadId) {
  const { error } = await getSupabaseAdmin()
    .from('email_jobs')
    .delete()
    .eq('lead_id', leadId);
  if (error) throw new Error(`Reinício da fila: ${error.message}`);
}
