import fs from 'node:fs/promises';

const oldText = 'Posso encaminhar uma apresentação curta ou avaliar um item real, sem compromisso?';
const newText = 'Estou encaminhando em anexo uma apresentação comercial da Parts Seals, com nossas linhas de atendimento, materiais e aplicações. Se fizer sentido, também posso avaliar um item real, sem compromisso.';
const baseUrl = 'http://127.0.0.1:3210';

async function updateRunningState() {
  const configResponse = await fetch(`${baseUrl}/api/config`);
  if (!configResponse.ok) throw new Error('Aplicativo local não está acessível.');

  let page = 1;
  let changed = 0;
  while (true) {
    const response = await fetch(`${baseUrl}/api/leads?page=${page}&pageSize=100`);
    if (!response.ok) throw new Error(`Falha ao carregar a página ${page} de leads.`);
    const result = await response.json();

    for (const lead of result.leads) {
      if (!String(lead.initialBody || '').includes(oldText)) continue;
      const patch = await fetch(`${baseUrl}/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initialBody: lead.initialBody.replaceAll(oldText, newText),
        }),
      });
      if (!patch.ok) throw new Error(`Falha ao atualizar o lead ${lead.id}.`);
      changed += 1;
    }

    if (page * result.pageSize >= result.total) break;
    page += 1;
  }
  return changed;
}

async function updateStateFile() {
  const statePath = './data/state.json';
  const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
  let changed = 0;
  for (const lead of state.leads) {
    if (!String(lead.initialBody || '').includes(oldText)) continue;
    lead.initialBody = lead.initialBody.replaceAll(oldText, newText);
    lead.updatedAt = new Date().toISOString();
    changed += 1;
  }
  state.updatedAt = new Date().toISOString();
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
  return changed;
}

async function updateState() {
  try {
    return { changed: await updateRunningState(), mode: 'api' };
  } catch (error) {
    if (error.cause?.code !== 'ECONNREFUSED') throw error;
    return { changed: await updateStateFile(), mode: 'file' };
  }
}

const stateResult = await updateState();

console.log(JSON.stringify({
  stateChanged: stateResult.changed,
  stateMode: stateResult.mode,
  workbookImportRule: 'enabled',
  newText,
}));
