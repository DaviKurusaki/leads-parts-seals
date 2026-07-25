import dns from 'node:dns/promises';
import OpenAI from 'openai';
import { config } from './config.js';

const UF_NAMES = Object.freeze({
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão',
  MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará',
  PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
  SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
});

export function normalizeUf(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return Object.hasOwn(UF_NAMES, normalized) ? normalized : '';
}

export function isCorporateEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return false;
  return !/(gmail|hotmail|outlook|yahoo|icloud|bol)\./i.test(value.split('@')[1]);
}

export async function hasMx(email) {
  const domain = String(email || '').split('@')[1]?.toLowerCase();
  if (!domain) return false;
  try {
    return (await dns.resolveMx(domain)).length > 0;
  } catch {
    return false;
  }
}

function parseJson(text) {
  const value = String(text || '').trim();
  try { return JSON.parse(value); } catch {}
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) {
    try { return JSON.parse(fenced); } catch {}
  }
  const first = value.indexOf('{');
  const last = value.lastIndexOf('}');
  if (first >= 0 && last > first) return JSON.parse(value.slice(first, last + 1));
  throw new Error('A pesquisa não retornou dados estruturados.');
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

export async function discoverLeads({ uf, segment = '', limit = 10, existingEmails = [] }) {
  const normalizedUf = normalizeUf(uf);
  if (!normalizedUf) throw new Error('Selecione uma UF válida.');
  if (!config.openaiApiKey) throw new Error('Configure OPENAI_API_KEY no arquivo .env para ativar a busca na web.');

  const safeLimit = Math.min(Math.max(Number(limit) || 10, 3), 20);
  const stateName = UF_NAMES[normalizedUf];
  const segmentHint = String(segment || '').trim();
  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const prompt = `Localize até ${safeLimit} empresas B2B reais no estado de ${stateName} (${normalizedUf}) com possível demanda por vedações industriais, peças técnicas sob medida, manutenção industrial, hidráulica, pneumática, usinagem ou revenda técnica.
${segmentHint ? `Priorize o segmento: ${segmentHint}.` : ''}

Use somente fontes públicas. Para cada empresa, confirme o município e encontre um e-mail CORPORATIVO publicado no site oficial ou em página institucional confiável. Não retorne e-mails pessoais, inferidos, adivinhados ou comprados. Não repita empresas. Prefira site oficial e página de contato.

Responda somente em JSON válido:
{"companies":[{"company":"","city":"","uf":"${normalizedUf}","segment":"","website":"","email":"","emailSource":"","companySource":"","evidence":"","confidence":"Alta|Moderada"}]}

emailSource deve ser a URL exata da página pública onde o e-mail aparece. companySource deve comprovar empresa e localização. Se não houver e-mail público comprovado, não inclua a empresa.`;

  const response = await client.responses.create({
    model: config.openaiModel,
    tools: [{ type: 'web_search' }],
    input: prompt,
  });
  const parsed = parseJson(response.output_text);
  const known = new Set(existingEmails.map((email) => String(email || '').trim().toLowerCase()).filter(Boolean));
  const candidates = Array.isArray(parsed.companies) ? parsed.companies : [];
  const validated = [];

  for (const candidate of candidates.slice(0, safeLimit * 2)) {
    const email = String(candidate.email || '').trim().toLowerCase();
    const emailSource = safeUrl(candidate.emailSource);
    const companySource = safeUrl(candidate.companySource);
    if (!candidate.company || normalizeUf(candidate.uf) !== normalizedUf || known.has(email)) continue;
    const formatValid = isCorporateEmail(email);
    const mxValid = formatValid ? await hasMx(email) : false;
    const sourceValid = Boolean(emailSource && companySource);
    if (!formatValid || !mxValid || !sourceValid) continue;
    known.add(email);
    validated.push({
      company: String(candidate.company).trim(),
      city: String(candidate.city || '').trim(),
      uf: normalizedUf,
      segment: String(candidate.segment || segmentHint || 'Industrial').trim(),
      website: safeUrl(candidate.website),
      email,
      emailSource,
      companySource,
      evidence: String(candidate.evidence || '').trim(),
      confidence: candidate.confidence === 'Alta' ? 'Alta' : 'Moderada',
      validation: { format: true, corporateDomain: true, mx: true, publicSource: true },
    });
    if (validated.length >= safeLimit) break;
  }

  return {
    uf: normalizedUf,
    requested: safeLimit,
    found: validated.length,
    candidates: validated,
    disclaimer: 'Validação confirma formato, domínio corporativo, registro MX e fonte pública; não garante que a caixa postal individual aceite mensagens.',
  };
}

export function discoveredLead(candidate, id) {
  const now = new Date().toISOString();
  const company = String(candidate.company || '').trim();
  const city = String(candidate.city || '').trim();
  const uf = normalizeUf(candidate.uf);
  const segment = String(candidate.segment || 'Industrial').trim();
  const email = String(candidate.email || '').trim().toLowerCase();
  if (!company || !uf || !isCorporateEmail(email)) throw new Error('Candidato inválido.');

  return {
    id,
    company,
    segment,
    city,
    uf,
    region: '',
    priority: 'Novo lead pesquisado',
    email,
    emailSource: candidate.emailSource,
    canSend: true,
    commercialProfile: segment,
    regionalMarket: '',
    applications: 'Vedações industriais e peças técnicas sob medida',
    suggestedProducts: 'PTFE, PU, NBR, FKM, POM, PEEK, nylon, Celeron, Technyl e PEAD',
    differentiation: 'fabricação sob medida por desenho, amostra ou aplicação',
    personalizationBasis: candidate.evidence || 'Empresa e contato encontrados em fontes públicas.',
    confidence: candidate.confidence === 'Alta' ? 'Alta' : 'Moderada',
    humanReview: 'Obrigatória',
    subject: `Peças técnicas sob medida para a ${company}`,
    greeting: `Olá, equipe da ${company},`,
    initialBody: `Olá, equipe da ${company},\n\nA Parts Seals fabrica vedações e peças técnicas sob medida por desenho, amostra ou aplicação, com apoio na escolha de materiais.\n\nPelo perfil da ${company}, gostaria de entender se vocês recebem demandas especiais, urgentes ou fora de linha que poderíamos avaliar.\n\nPosso enviar nossa apresentação e analisar uma aplicação real, sem compromisso?\n\nAtenciosamente,\n{{NOME_REMETENTE}}\nParts Seals Vedações Industriais\n{{TELEFONE_REMETENTE}} | {{SITE_REMETENTE}}`,
    followup1Body: `Olá, equipe da ${company},\n\nRetomando meu contato: caso tenham uma medida, desenho ou foto de um item difícil de localizar, podemos fazer uma análise inicial.\n\nHá algum caso em aberto que possamos avaliar?`,
    followup2Body: `Olá, equipe da ${company},\n\nEncerrando meu contato para não insistir. Se surgir uma demanda de vedação ou peça técnica sob medida, a Parts Seals fica à disposição.\n\nCaso prefiram não receber novos contatos, basta responder REMOVER.`,
    cta: 'Existe algum item especial ou urgente que possamos avaliar?',
    privacyFooter: 'Este contato foi direcionado a um canal corporativo público por possível aderência entre as empresas. Para não receber novas mensagens, responda REMOVER.',
    campaignStatus: 'Aguardando revisão',
    approved: false,
    approvedAt: null,
    sentAt: null,
    followup1At: null,
    followup2At: null,
    response: '',
    responseClass: '',
    optedOut: false,
    bounce: '',
    notes: 'Lead encontrado pela busca web. Revise as fontes e o texto antes de aprovar.',
    specificSource: candidate.companySource || candidate.website || candidate.emailSource,
    website: candidate.website || '',
    sourceType: 'web-discovery',
    stage: 0,
    replied: false,
    paused: false,
    messageIds: [],
    research: null,
    createdAt: now,
    updatedAt: now,
  };
}
