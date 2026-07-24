import OpenAI from 'openai';
import { config } from './config.js';

function extractJson(text) {
  const value = String(text || '').trim();
  try { return JSON.parse(value); } catch {}
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) {
    try { return JSON.parse(fenced); } catch {}
  }
  const first = value.indexOf('{');
  const last = value.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(value.slice(first, last + 1)); } catch {}
  }
  return { resumo: value, fontes: [], confianca: 'Baixa', observacao: 'A resposta não veio em JSON estruturado.' };
}

export async function researchLead(lead) {
  if (!config.openaiApiKey) throw new Error('OPENAI_API_KEY não foi configurada.');
  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const prompt = `${lead.researchPrompt}\n\nContexto conhecido da planilha:\n- Segmento: ${lead.segment}\n- Cidade/UF: ${lead.city}/${lead.uf}\n- E-mail: ${lead.email}\n- Fonte existente: ${lead.specificSource || lead.emailSource}\n\nResponda somente em JSON válido com as chaves: resumo, produtos_servicos, mercados, evidencias, gancho_parts_seals, produtos_parts_seals, assunto_sugerido, email_inicial_sugerido, followup1_sugerido, followup2_sugerido, riscos_de_confusao, fontes, confianca. Cada item de fontes deve conter titulo e url. Os textos sugeridos devem ser B2B, objetivos, sem elogio genérico, sem afirmar mercados não comprovados, com uma pergunta simples e sem assinatura. Não invente dados.`;
  const response = await client.responses.create({
    model: config.openaiModel,
    tools: [{ type: 'web_search' }],
    input: prompt,
  });
  return extractJson(response.output_text);
}
