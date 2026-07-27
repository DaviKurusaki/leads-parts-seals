const $ = (selector) => document.querySelector(selector);
let page = 1;
let total = 0;
let pageSize = 25;
let currentLead = null;
let appConfig = null;
let stateKpiData = [];
let currentUser = null;
let dashboardStarted = false;
let refreshTimer = null;

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('json') ? await response.json() : await response.text();
  if (response.status === 401 && url !== '/api/auth/login') showLogin();
  if (!response.ok) throw new Error(payload.error || payload.reason || JSON.stringify(payload));
  return payload;
}

function showLogin(message = '') {
  if (refreshTimer) window.clearInterval(refreshTimer);
  refreshTimer = null;
  dashboardStarted = false;
  currentUser = null;
  $('#appView').hidden = true;
  $('#loginView').hidden = false;
  $('#loginPassword').value = '';
  const messageEl = $('#loginMessage');
  messageEl.textContent = message;
  messageEl.classList.toggle('hidden', !message);
}

async function showDashboard(user) {
  currentUser = user;
  $('#loginView').hidden = true;
  $('#appView').hidden = false;
  $('#sessionUsername').textContent = user.username;
  $('#sessionRole').textContent = user.role === 'admin' ? 'Administrador' : 'Usuário';
  $('#manageUsers').hidden = user.role !== 'admin';
  if (!dashboardStarted) {
    dashboardStarted = true;
    await refresh();
    if (localStorage.getItem('parts-seals-state-kpis-expanded') === 'true') {
      $('#toggleStateKpis').click();
    }
    refreshTimer = window.setInterval(
      () => Promise.all([loadConfig(), loadStats(), loadEvents()]).catch(console.error),
      60_000,
    );
  } else {
    await refresh();
  }
}

function showMessage(text, error = false) {
  const el = $('#statusMessage');
  el.textContent = text;
  el.classList.remove('hidden', 'error');
  if (error) el.classList.add('error');
  window.clearTimeout(showMessage.timer);
  showMessage.timer = window.setTimeout(() => el.classList.add('hidden'), 8000);
}

function badge(text, type = 'neutral') {
  const span = document.createElement('span');
  span.className = `badge ${type}`;
  span.textContent = text;
  return span;
}

function confidenceType(value) {
  return value === 'Alta' ? 'high' : value === 'Moderada' ? 'medium' : 'low';
}

function statusType(lead) {
  if (lead.optedOut || lead.bounce || !lead.canSend) return 'blocked';
  if (lead.replied) return 'sent';
  if (lead.approved) return 'approved';
  return 'neutral';
}

async function loadConfig() {
  appConfig = await api('/api/config');
  const live = appConfig.sendMode === 'live';
  $('#modeBadge').textContent = live ? 'ENVIO AO VIVO' : 'MODO SEGURO — DRY RUN';
  $('#modeBadge').style.background = live ? 'rgba(55,150,95,.25)' : 'rgba(255,255,255,.12)';
  const schedule = appConfig.autoBatch;
  if (schedule) {
    const days = schedule.everyDay ? 'todos os dias' : 'de segunda a sexta';
    $('#scheduleSummary').textContent = `Automático: até ${schedule.size} envios a cada ${schedule.intervalMinutes} minutos, ${days}, das ${schedule.start} às ${schedule.end}.`;
  }
}

async function loadStats() {
  const data = await api('/api/stats');
  const cards = [
    ['Empresas', data.total], ['Com e-mail', data.withEmail], ['Alta confiança', data.highConfidence],
    ['Aprovados', data.approved], ['Enviados', data.sent], ['Respostas', data.replied],
    ['Opt-outs', data.optedOut], ['Bounces', data.bounced], ['Elegíveis', data.eligibleNow],
    ['Enviados hoje', data.limits.todayCount], ['Na última hora', data.limits.hourCount], ['Sem e-mail', data.withoutEmail],
  ];
  $('#stats').replaceChildren(...cards.map(([label, value]) => {
    const card = document.createElement('div'); card.className = 'stat';
    const number = document.createElement('div'); number.className = 'value'; number.textContent = value;
    const caption = document.createElement('div'); caption.className = 'label'; caption.textContent = label;
    card.append(number, caption); return card;
  }));
  const campaignBadge = $('#campaignBadge');
  campaignBadge.textContent = data.campaignActive ? 'Ativa' : 'Pausada';
  campaignBadge.className = `badge ${data.campaignActive ? 'approved' : 'neutral'}`;

  const funnel = [
    ['Taxa de resposta', `${data.responseRate}%`, `${data.replied} de ${data.sent} envios`, ''],
    ['Interessados', data.interested, `${data.interestRate}% das respostas`, 'positive'],
    ['Não interessados', data.notInterested, `${data.rejectionRate}% das respostas`, 'negative'],
    ['Não quer receber', data.optedOut, `${data.optOutRate}% dos envios`, 'negative'],
    ['A classificar', data.unclassified, 'Respostas que precisam de revisão', ''],
    ['Entregabilidade', `${data.deliveryRate}%`, `${data.bounced} bounces`, 'positive'],
  ];
  $('#funnelStats').replaceChildren(...funnel.map(([label, value, caption, type]) => {
    const card = document.createElement('div'); card.className = `funnel-card ${type}`;
    const metric = document.createElement('div'); metric.className = 'metric'; metric.textContent = value;
    const labelEl = document.createElement('strong'); labelEl.textContent = label;
    const captionEl = document.createElement('div'); captionEl.className = 'caption'; captionEl.textContent = caption;
    card.append(metric, labelEl, captionEl);
    return card;
  }));
}

function renderStateKpis() {
  const selected = $('#stateKpiFilter').value;
  const rows = selected ? stateKpiData.filter((row) => row.uf === selected) : stateKpiData;
  const tbody = $('#stateKpiRows');
  tbody.replaceChildren();
  for (const row of rows) {
    const tr = document.createElement('tr');
    const values = [
      row.uf, row.total, row.sent, row.replied, `${row.responseRate}%`,
      row.interested, row.notInterested, row.optedOut, row.bounced,
    ];
    for (const [index, value] of values.entries()) {
      const td = document.createElement('td');
      td.textContent = value;
      if (index === 4) td.className = 'rate';
      tr.append(td);
    }
    tbody.append(tr);
  }
}

async function loadStateKpis() {
  stateKpiData = await api('/api/kpis/states');
  const filter = $('#stateKpiFilter');
  const current = filter.value;
  filter.replaceChildren(new Option('Todos os estados', ''));
  for (const row of [...stateKpiData].sort((a, b) => a.uf.localeCompare(b.uf))) {
    filter.append(new Option(row.uf, row.uf));
  }
  filter.value = current;
  renderStateKpis();
}

function queryString() {
  const params = new URLSearchParams({ page, pageSize });
  const q = $('#search').value.trim();
  const confidence = $('#confidence').value;
  const approval = $('#approval').value;
  if (q) params.set('q', q);
  if (confidence) params.set('confidence', confidence);
  if (approval) params.set('approval', approval);
  return params.toString();
}

async function loadLeads() {
  const data = await api(`/api/leads?${queryString()}`);
  total = data.total;
  const tbody = $('#leadRows');
  tbody.replaceChildren();
  for (const lead of data.leads) {
    const tr = document.createElement('tr');
    const id = document.createElement('td'); id.textContent = lead.id;
    const company = document.createElement('td');
    const name = document.createElement('div'); name.className = 'company'; name.textContent = lead.company;
    const priority = document.createElement('div'); priority.className = 'subtle'; priority.textContent = lead.priority || '';
    company.append(name, priority);
    const local = document.createElement('td'); local.textContent = `${lead.city}/${lead.uf}`;
    const segment = document.createElement('td'); segment.textContent = lead.segment;
    const email = document.createElement('td'); email.className = 'email'; email.textContent = lead.email || '—';
    const confidence = document.createElement('td'); confidence.append(badge(lead.confidence, confidenceType(lead.confidence)));
    const status = document.createElement('td'); status.append(badge(lead.campaignStatus, statusType(lead)));
    const approval = document.createElement('td'); approval.append(badge(lead.approved ? 'Aprovado' : 'Pendente', lead.approved ? 'approved' : 'neutral'));
    const action = document.createElement('td');
    const open = document.createElement('button'); open.textContent = 'Revisar'; open.addEventListener('click', () => openLead(lead.id)); action.append(open);
    tr.append(id, company, local, segment, email, confidence, status, approval, action);
    tbody.append(tr);
  }
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  $('#pageInfo').textContent = `Página ${page} de ${totalPages} — ${total} registros`;
  $('#prevPage').disabled = page <= 1;
  $('#nextPage').disabled = page >= totalPages;
}

async function loadEvents() {
  const events = await api('/api/events?limit=25');
  const container = $('#events'); container.replaceChildren();
  if (!events.length) { container.textContent = 'Nenhum evento registrado.'; return; }
  for (const event of events) {
    const row = document.createElement('div'); row.className = 'event';
    const time = document.createElement('time'); time.textContent = new Date(event.at).toLocaleString('pt-BR');
    const detail = document.createElement('div');
    detail.textContent = `${event.type}${event.company ? ` — ${event.company}` : ''}${event.message ? ` — ${event.message}` : ''}`;
    row.append(time, detail); container.append(row);
  }
}

async function refresh() {
  await Promise.all([loadConfig(), loadStats(), loadStateKpis(), loadLeads(), loadEvents()]);
}

async function openLead(id) {
  currentLead = await api(`/api/leads/${id}`);
  $('#dialogCompany').textContent = currentLead.company;
  $('#dialogMeta').textContent = `${currentLead.segment} • ${currentLead.city}/${currentLead.uf} • ${currentLead.email || 'sem e-mail'}`;
  $('#editSubject').value = currentLead.subject || '';
  $('#editInitial').value = currentLead.initialBody || '';
  $('#editFollow1').value = currentLead.followup1Body || '';
  $('#editFollow2').value = currentLead.followup2Body || '';
  $('#editResponseClass').value = currentLead.responseClass || '';
  $('#editResponse').value = currentLead.response || '';
  $('#editNotes').value = currentLead.notes || '';
  $('#dialogConfidence').replaceChildren(badge(currentLead.confidence, confidenceType(currentLead.confidence)));
  const source = currentLead.specificSource || currentLead.emailSource || '';
  $('#dialogSource').textContent = source || 'Sem fonte';
  $('#dialogSource').href = source.startsWith('http') ? source : '#';
  $('#dialogBasis').textContent = currentLead.personalizationBasis || '';
  $('#dialogApplications').textContent = currentLead.applications || '';
  $('#dialogProducts').textContent = currentLead.suggestedProducts || '';
  $('#researchOutput').textContent = currentLead.research ? JSON.stringify(currentLead.research, null, 2) : 'Ainda não executada.';
  $('#approveLead').textContent = currentLead.approved ? 'Retirar aprovação' : 'Aprovar';
  $('#approveLead').disabled = !currentLead.canSend || currentLead.optedOut;
  $('#researchLead').disabled = !appConfig?.researchEnabled;
  $('#researchLead').title = appConfig?.researchEnabled ? '' : 'Configure OPENAI_API_KEY no .env';
  $('#applyResearch').disabled = !currentLead.research;
  $('#leadDialog').showModal();
}

async function saveCurrentLead() {
  if (!currentLead) return;
  currentLead = await api(`/api/leads/${currentLead.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      subject: $('#editSubject').value,
      initialBody: $('#editInitial').value,
      followup1Body: $('#editFollow1').value,
      followup2Body: $('#editFollow2').value,
      responseClass: $('#editResponseClass').value,
      notes: $('#editNotes').value,
    }),
  });
  showMessage('Alterações salvas.');
  await refresh();
}

$('#applyFilters').addEventListener('click', async () => { page = 1; await loadLeads(); });
$('#stateKpiFilter').addEventListener('change', renderStateKpis);
$('#toggleStateKpis').addEventListener('click', () => {
  const content = $('#stateKpiContent');
  const button = $('#toggleStateKpis');
  const expanded = content.hidden;
  content.hidden = !expanded;
  button.textContent = expanded ? 'Recolher' : 'Expandir';
  button.setAttribute('aria-expanded', String(expanded));
  localStorage.setItem('parts-seals-state-kpis-expanded', String(expanded));
});
$('#search').addEventListener('keydown', async (event) => { if (event.key === 'Enter') { page = 1; await loadLeads(); } });
$('#prevPage').addEventListener('click', async () => { page -= 1; await loadLeads(); });
$('#nextPage').addEventListener('click', async () => { page += 1; await loadLeads(); });
$('#saveLead').addEventListener('click', () => saveCurrentLead().catch((e) => showMessage(e.message, true)));

$('#approveLead').addEventListener('click', async () => {
  try {
    if (!currentLead) return;
    await saveCurrentLead();
    currentLead = await api(`/api/leads/${currentLead.id}/approve`, {
      method: 'POST', body: JSON.stringify({ approved: !currentLead.approved }),
    });
    $('#approveLead').textContent = currentLead.approved ? 'Retirar aprovação' : 'Aprovar';
    showMessage(currentLead.approved ? 'Lead aprovado.' : 'Aprovação removida.');
    await refresh();
  } catch (error) { showMessage(error.message, true); }
});

$('#optoutLead').addEventListener('click', async () => {
  if (!currentLead || !confirm(`Bloquear novos envios para ${currentLead.company}?`)) return;
  try {
    currentLead = await api(`/api/leads/${currentLead.id}/optout`, { method: 'POST', body: '{}' });
    showMessage('Lead incluído na lista de supressão.');
    $('#leadDialog').close();
    await refresh();
  } catch (error) { showMessage(error.message, true); }
});

$('#testLead').addEventListener('click', async () => {
  if (!currentLead) return;
  const targetEmail = prompt('Qual e-mail interno deve receber o teste?');
  if (!targetEmail) return;
  const stage = Number(prompt('Etapa: 0 = inicial, 1 = follow-up 1, 2 = follow-up 2', '0')) || 0;
  try {
    await saveCurrentLead();
    const result = await api('/api/test-email', { method: 'POST', body: JSON.stringify({ leadId: currentLead.id, targetEmail, stage }) });
    showMessage(result.dryRun ? `Prévia salva em data/dry-run/${result.previewFile}` : 'E-mail de teste enviado.');
    await loadEvents();
  } catch (error) { showMessage(error.message, true); }
});

$('#researchLead').addEventListener('click', async () => {
  if (!currentLead) return;
  $('#researchOutput').textContent = 'Pesquisando fontes públicas...';
  try {
    const result = await api(`/api/leads/${currentLead.id}/research`, { method: 'POST', body: '{}' });
    currentLead.research = result;
    $('#researchOutput').textContent = JSON.stringify(result, null, 2);
    showMessage('Pesquisa concluída. Revise as fontes antes de alterar o texto.');
  } catch (error) { $('#researchOutput').textContent = error.message; showMessage(error.message, true); }
});

$('#applyResearch').addEventListener('click', async () => {
  if (!currentLead?.research) return;
  if (!confirm('Aplicar os textos sugeridos pela pesquisa? O lead voltará para revisão e perderá a aprovação atual.')) return;
  try {
    currentLead = await api(`/api/leads/${currentLead.id}/apply-research`, { method: 'POST', body: '{}' });
    $('#editSubject').value = currentLead.subject || '';
    $('#editInitial').value = currentLead.initialBody || '';
    $('#editFollow1').value = currentLead.followup1Body || '';
    $('#editFollow2').value = currentLead.followup2Body || '';
    $('#approveLead').textContent = 'Aprovar';
    showMessage('Texto pesquisado aplicado. Revise e aprove novamente.');
    await refresh();
  } catch (error) { showMessage(error.message, true); }
});

$('#approveHigh').addEventListener('click', async () => {
  const text = prompt('Esta ação aprova todos os leads de alta confiança. Digite: APROVAR ALTA CONFIANÇA');
  if (text !== 'APROVAR ALTA CONFIANÇA') return;
  try {
    const result = await api('/api/approve-high-confidence', { method: 'POST', body: JSON.stringify({ confirm: text }) });
    showMessage(`${result.count} leads de alta confiança foram aprovados.`);
    await refresh();
  } catch (error) { showMessage(error.message, true); }
});

$('#approveModerate').addEventListener('click', async () => {
  const text = prompt('Esta ação aprova todos os leads de confiança moderada. Digite: APROVAR CONFIANÇA MODERADA');
  if (text !== 'APROVAR CONFIANÇA MODERADA') return;
  try {
    const result = await api('/api/approve-moderate-confidence', {
      method: 'POST',
      body: JSON.stringify({ confirm: text }),
    });
    showMessage(`${result.count} leads de confiança moderada foram aprovados.`);
    await refresh();
  } catch (error) { showMessage(error.message, true); }
});

$('#startCampaign').addEventListener('click', async () => {
  const text = prompt('Digite INICIAR CAMPANHA para confirmar. Em dry-run, somente prévias serão geradas.');
  if (text !== 'INICIAR CAMPANHA') return;
  try { await api('/api/campaign/start', { method: 'POST', body: JSON.stringify({ confirm: text }) }); showMessage('Campanha iniciada.'); await refresh(); }
  catch (error) { showMessage(error.message, true); }
});

$('#pauseCampaign').addEventListener('click', async () => {
  try { await api('/api/campaign/pause', { method: 'POST', body: '{}' }); showMessage('Campanha pausada.'); await refresh(); }
  catch (error) { showMessage(error.message, true); }
});

$('#sendNext').addEventListener('click', async () => {
  try {
    const result = await api('/api/send-next', { method: 'POST', body: JSON.stringify({ ignoreBusinessWindow: true }) });
    showMessage(result.dryRun ? `Prévia de ${result.company} gerada.` : `E-mail processado para ${result.company}.`);
    await refresh();
  } catch (error) { showMessage(error.message, true); }
});

$('#syncInbox').addEventListener('click', async () => {
  try { const result = await api('/api/inbox/sync', { method: 'POST', body: '{}' }); showMessage(`Caixa sincronizada: ${result.replies} respostas, ${result.removals} remoções e ${result.bounces} bounces.`); await refresh(); }
  catch (error) { showMessage(error.message, true); }
});

$('#verifySmtp').addEventListener('click', async () => {
  try { await api('/api/smtp/verify', { method: 'POST', body: '{}' }); showMessage('Conexão SMTP validada.'); }
  catch (error) { showMessage(error.message, true); }
});

function formatUserDate(value) {
  return value ? new Date(value).toLocaleString('pt-BR') : 'Nunca';
}

function usersMessage(text, error = false) {
  const el = $('#usersMessage');
  el.textContent = text;
  el.classList.remove('hidden', 'error');
  if (error) el.classList.add('error');
}

async function loadUsers() {
  const { users } = await api('/api/auth/users');
  const tbody = $('#userRows');
  tbody.replaceChildren();
  for (const user of users) {
    const tr = document.createElement('tr');
    const username = document.createElement('td'); username.textContent = user.username;
    const role = document.createElement('td'); role.append(badge(user.role === 'admin' ? 'Administrador' : 'Usuário', user.role === 'admin' ? 'approved' : 'neutral'));
    const created = document.createElement('td'); created.textContent = formatUserDate(user.createdAt);
    const lastLogin = document.createElement('td'); lastLogin.textContent = formatUserDate(user.lastSignInAt);
    const actions = document.createElement('td');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'danger';
    remove.textContent = user.id === currentUser.id ? 'Sessão atual' : 'Apagar';
    remove.disabled = user.id === currentUser.id;
    remove.addEventListener('click', async () => {
      if (!confirm(`Apagar definitivamente o usuário ${user.username}?`)) return;
      try {
        await api(`/api/auth/users/${user.id}`, { method: 'DELETE' });
        usersMessage(`Usuário ${user.username} apagado.`);
        await loadUsers();
      } catch (error) { usersMessage(error.message, true); }
    });
    actions.append(remove);
    tr.append(username, role, created, lastLogin, actions);
    tbody.append(tr);
  }
}

$('#loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#loginButton');
  button.disabled = true;
  $('#loginMessage').classList.add('hidden');
  try {
    const result = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: $('#loginUsername').value,
        password: $('#loginPassword').value,
      }),
    });
    await showDashboard(result.user);
  } catch (error) {
    showLogin(error.message);
  } finally {
    button.disabled = false;
  }
});

$('#logoutButton').addEventListener('click', async () => {
  try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch {}
  showLogin();
});

$('#manageUsers').addEventListener('click', async () => {
  $('#usersMessage').classList.add('hidden');
  $('#usersDialog').showModal();
  try { await loadUsers(); } catch (error) { usersMessage(error.message, true); }
});

$('#closeUsersDialog').addEventListener('click', () => $('#usersDialog').close());

$('#createUserForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const result = await api('/api/auth/users', {
      method: 'POST',
      body: JSON.stringify({
        username: $('#newUsername').value,
        password: $('#newUserPassword').value,
        role: $('#newUserRole').value,
      }),
    });
    event.currentTarget.reset();
    usersMessage(`Usuário ${result.user.username} criado.`);
    await loadUsers();
  } catch (error) { usersMessage(error.message, true); }
});

$('#changePassword').addEventListener('click', () => {
  $('#passwordForm').reset();
  $('#passwordMessage').classList.add('hidden');
  $('#passwordDialog').showModal();
});

$('#closePasswordDialog').addEventListener('click', () => $('#passwordDialog').close());

$('#passwordForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = $('#newPassword').value;
  const confirmation = $('#confirmPassword').value;
  const message = $('#passwordMessage');
  if (password !== confirmation) {
    message.textContent = 'As senhas não coincidem.';
    message.className = 'message error';
    return;
  }
  try {
    await api('/api/auth/password', { method: 'POST', body: JSON.stringify({ password }) });
    $('#passwordDialog').close();
    dashboardStarted = false;
    showLogin('Senha alterada. Entre novamente.');
  } catch (error) {
    message.textContent = error.message;
    message.className = 'message error';
  }
});

try {
  const { user } = await api('/api/auth/me');
  await showDashboard(user);
} catch {
  showLogin();
}
