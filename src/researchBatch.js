import { config } from './config.js';
import { addEvent, getState, loadState, saveState, updateLead } from './store.js';
import { researchLead } from './research.js';

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || fallback;
}

if (!config.openaiApiKey) {
  console.error('Preencha OPENAI_API_KEY no .env antes de executar a pesquisa em lote.');
  process.exit(1);
}

await loadState();
const limit = Math.max(Number(arg('limit', '10')) || 10, 1);
const confidence = arg('confidence', 'Alta');
const delayMs = Math.max(Number(arg('delay-ms', '3000')) || 3000, 0);
const includeExisting = arg('include-existing', 'false') === 'true';

const candidates = getState().leads
  .filter((lead) => lead.canSend && lead.email)
  .filter((lead) => !confidence || lead.confidence === confidence)
  .filter((lead) => includeExisting || !lead.research)
  .sort((a, b) => Number(a.id) - Number(b.id))
  .slice(0, limit);

console.log(`Pesquisando ${candidates.length} empresas. Nenhum e-mail será enviado ou aprovado.`);
for (const [index, lead] of candidates.entries()) {
  try {
    console.log(`[${index + 1}/${candidates.length}] ${lead.company}`);
    const research = await researchLead(lead);
    updateLead(lead.id, { research, campaignStatus: lead.approved ? lead.campaignStatus : 'Pesquisa concluída' });
    addEvent('lead.researched.batch', { leadId: lead.id, company: lead.company, confidence: research.confianca || '' });
    await saveState();
  } catch (error) {
    console.error(`Erro em ${lead.company}: ${error.message}`);
    addEvent('lead.research.error', { leadId: lead.id, company: lead.company, message: error.message });
    await saveState();
  }
  if (delayMs && index < candidates.length - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
}
console.log('Pesquisa em lote concluída. Revise os resultados no painel antes de aplicar os textos.');
