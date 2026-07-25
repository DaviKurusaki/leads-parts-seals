import fs from 'node:fs/promises';

const inputFile = process.argv[2] || 'tmp/rfb-selected.json';
const outputFile = process.argv[3] || 'data/leads-rfb-2026-07-12.json';
const selected = JSON.parse(await fs.readFile(inputFile, 'utf8'));
const rules = JSON.parse(await fs.readFile('config/regras-personalizacao.json', 'utf8'));
const contexts = JSON.parse(await fs.readFile('config/contextos-regionais.json', 'utf8'));

const REGION_BY_UF = {
  AC: 'Norte', AL: 'Nordeste', AP: 'Norte', AM: 'Norte', BA: 'Nordeste', CE: 'Nordeste',
  DF: 'Centro-Oeste', ES: 'Sudeste', GO: 'Centro-Oeste', MA: 'Nordeste', MT: 'Centro-Oeste',
  MS: 'Centro-Oeste', MG: 'Sudeste', PA: 'Norte', PB: 'Nordeste', PR: 'Sul',
  PE: 'Nordeste', PI: 'Nordeste', RJ: 'Sudeste', RN: 'Nordeste', RS: 'Sul',
  RO: 'Norte', RR: 'Norte', SC: 'Sul', SP: 'Sudeste', SE: 'Nordeste', TO: 'Norte',
};
const FALLBACK_CONTEXT = {
  Norte: { mercados: 'mineração, agroindústria, energia, alimentos e manutenção de equipamentos', materiais: 'PU, PTFE, NBR e FKM' },
  Nordeste: { mercados: 'alimentos, energia, mineração, química e manutenção industrial', materiais: 'NBR, PU, PTFE e FKM' },
  'Centro-Oeste': { mercados: 'agroindústria, alimentos, mineração, logística e máquinas', materiais: 'NBR, PU, PTFE e FKM' },
  Sudeste: { mercados: 'máquinas, metalurgia, química, automotivo e manutenção industrial', materiais: 'PU, NBR, PTFE e FKM' },
  Sul: { mercados: 'metalmecânico, máquinas, alimentos, automotivo e manutenção industrial', materiais: 'PU, NBR, PTFE e FKM' },
};

function contextFor(candidate) {
  return contexts.cidades[`${candidate.city}|${candidate.uf}`]
    || contexts.estados[candidate.uf]
    || FALLBACK_CONTEXT[REGION_BY_UF[candidate.uf]];
}

function subjectFor(candidate) {
  if (candidate.segment === 'Distribuidora') return `Peças sob medida para ampliar o atendimento da ${candidate.company}`;
  if (candidate.segment === 'Fabricante') return `Componentes técnicos sob medida para a ${candidate.company}`;
  return `Apoio em vedações e peças técnicas para a ${candidate.company}`;
}

const generatedAt = new Date().toISOString();
const leads = selected.candidates.map((candidate, index) => {
  const rule = rules[candidate.segment] || rules.Industrial;
  const context = contextFor(candidate);
  const sourceUrl = candidate.source;
  const activity = candidate.cnaeDescription.toLowerCase();
  const initialBody = `Olá, equipe da ${candidate.company},

Localizamos a ${candidate.company} no cadastro público da Receita Federal, com atividade relacionada a ${activity}. Por isso, acredito que pode haver aderência com nosso trabalho em vedações e peças técnicas sob medida.

A Parts Seals fabrica ${rule.produtos}. Podemos apoiar especialmente em ${rule.aplicacoes}, com definição do material conforme fluido, pressão, temperatura, movimento e ambiente de operação.

${rule.cta}

Estou encaminhando em anexo uma apresentação comercial da Parts Seals. Se fizer sentido, também posso avaliar uma aplicação real, sem compromisso.

Atenciosamente,
{{NOME_REMETENTE}}
Parts Seals Vedações Industriais
{{TELEFONE_REMETENTE}} | {{SITE_REMETENTE}}`;
  return {
    id: 252 + index,
    company: candidate.company,
    segment: candidate.segment,
    city: candidate.city,
    uf: candidate.uf,
    region: REGION_BY_UF[candidate.uf],
    priority: candidate.selectionScore >= 100 ? 'A - Alta' : 'B - Moderada',
    email: candidate.email,
    emailSource: sourceUrl,
    canSend: true,
    commercialProfile: rule.perfil,
    regionalMarket: context.mercados,
    applications: rule.aplicacoes,
    suggestedProducts: `${rule.produtos}; também trabalhamos com Technyl e PEAD conforme a aplicação`,
    differentiation: rule.diferencial,
    personalizationBasis: `Empresa ativa no cadastro público da Receita Federal em ${candidate.city}/${candidate.uf}; CNAE ${candidate.cnae}: ${candidate.cnaeDescription}. E-mail em domínio próprio com registro MX validado em 25/07/2026.`,
    confidence: 'Moderada',
    humanReview: 'Sim',
    subject: subjectFor(candidate),
    greeting: `Olá, equipe da ${candidate.company},`,
    initialBody,
    followup1Body: `Olá, equipe da ${candidate.company},

Retomando meu contato: a Parts Seals pode apoiar em ${rule.aplicacoes}, inclusive quando a medida, o material ou o prazo exigem uma solução fora de catálogo.

Se tiverem uma medida, desenho ou foto de um item difícil de localizar, podemos fazer uma análise inicial. Há algum caso em aberto que possamos avaliar?

Atenciosamente,
{{NOME_REMETENTE}}
Parts Seals Vedações Industriais`,
    followup2Body: `Olá, equipe da ${candidate.company},

Encerrando meu contato para não insistir. Caso surja alguma demanda de vedação ou peça técnica sob medida, a Parts Seals fica à disposição para fabricar por desenho ou amostra.

Se não for um tema para vocês, também posso retirar este contato da nossa lista.

Atenciosamente,
{{NOME_REMETENTE}}
Parts Seals Vedações Industriais`,
    cta: rule.cta,
    privacyFooter: 'Este contato foi direcionado a um canal empresarial constante de cadastro público, por possível aderência entre as atividades das empresas. Para não receber novas mensagens da Parts Seals, responda com REMOVER.',
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
    notes: `Novo lead da base aberta CNPJ. CNPJ: ${candidate.cnpj}. Validar aderência e texto antes da aprovação.`,
    regionalSource: 'https://perfildaindustria.portaldaindustria.com.br/',
    specificSource: sourceUrl,
    researchPrompt: `Confirme a empresa ${candidate.company}, CNPJ ${candidate.cnpj}, de ${candidate.city}/${candidate.uf}, pelo site oficial. Valide produtos, mercados e aderência a vedações industriais. Não confunda homônimos e não invente informações.`,
    version: '2026-07-25 RFB v3',
    sourceType: 'rfb-open-data',
    cnpj: candidate.cnpj,
    cnae: candidate.cnae,
    cnaeDescription: candidate.cnaeDescription,
    mxValidatedAt: '2026-07-25T00:00:00.000Z',
    stage: 0,
    replied: false,
    paused: false,
    messageIds: [],
    research: null,
    createdAt: generatedAt,
    updatedAt: generatedAt,
  };
});

await fs.writeFile(outputFile, `${JSON.stringify({
  version: '2026-07-25-rfb-v3',
  generatedAt,
  source: 'Receita Federal — Dados Abertos CNPJ, snapshot 12/07/2026',
  sourceUrl: 'https://dados-abertos-rf-cnpj.casadosdados.com.br/arquivos/2026-07-12/',
  validation: selected.validation,
  leads,
}, null, 2)}\n`, 'utf8');
console.log(`Gerados ${leads.length} novos leads em ${outputFile}.`);
