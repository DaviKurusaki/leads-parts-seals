import fs from 'node:fs/promises';

const inputs = process.argv.slice(2, -1);
const output = process.argv.at(-1) || 'tmp/rfb-selected.json';
if (inputs.length < 1) throw new Error('Informe os JSONs de candidatos e o arquivo de saída.');

const VALID_UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);
const FINAL_TARGET = 1000;
const TARGETS = {
  SP: 190, MG: 90, PR: 75, RS: 75, SC: 75, RJ: 65, BA: 53, GO: 45, MT: 40,
  ES: 35, PE: 35, CE: 30, PA: 25, MS: 25, AM: 25, DF: 20, AL: 15, MA: 10,
  PB: 10, RN: 15, SE: 10, PI: 8, RO: 10, TO: 8, AC: 5, AP: 3, RR: 3,
};
const BAD_LOCAL_PARTS = /contab|contador|fiscal|legaliza|departamentopessoal|dpessoal|escritorio|financeiro|faturamento|controladoria|cobranca|recursoshumanos|^rh([._-]|$)|^dp([._-]|$)|^nfe?([._-]|$)|^adm(inistrativo)?([._-]|$)/i;
const BAD_DOMAINS = /contab|contador|escritorio|assessoriacontabil|gestaocontabil|contabiliza/i;
const GOOD_LOCAL_PARTS = /^(vendas|comercial|contato|sac|atendimento|orcamento|compras|info)([._-]|$)/i;
const GENERIC_NAME_WORDS = new Set([
  'industria', 'industrial', 'comercio', 'comercial', 'servicos', 'service', 'maquinas',
  'equipamentos', 'engenharia', 'manutencao', 'solucoes', 'brasil', 'ltda', 'eireli',
]);

function normalizedName(value) {
  return String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\W+/g, ' ').trim().toLowerCase();
}

function companyMatchesDomain(company, domain) {
  const companyCompact = normalizedName(company).replaceAll(' ', '');
  const domainCompact = String(domain || '').toLowerCase().replace(/\.(com|net|org|ind|eco|eng|br)+/g, '').replace(/\W/g, '');
  const tokens = normalizedName(company).split(' ')
    .filter((token) => token.length >= 4 && !GENERIC_NAME_WORDS.has(token));
  return tokens.some((token) => domainCompact.includes(token))
    || (domainCompact.length >= 5 && companyCompact.includes(domainCompact));
}

const state = JSON.parse(await fs.readFile('data/state.json', 'utf8'));
const existingValid = state.leads.filter((lead) => (
  lead.sourceType !== 'rfb-open-data'
  && lead.email
  && lead.canSend
));
const existingEmails = new Set(existingValid.map((lead) => lead.email.toLowerCase()));
const existingNames = new Set(existingValid.map((lead) => normalizedName(lead.company)));
const currentByUf = Object.fromEntries(VALID_UFS.values().map((uf) => [uf, 0]));
for (const lead of existingValid) currentByUf[lead.uf] = (currentByUf[lead.uf] || 0) + 1;

const merged = [];
for (const input of inputs) {
  const parsed = JSON.parse(await fs.readFile(input, 'utf8'));
  merged.push(...parsed.candidates);
}

const unique = [];
const seenEmails = new Set(existingEmails);
const seenNames = new Set(existingNames);
for (const candidate of merged) {
  const name = normalizedName(candidate.company);
  const localPart = candidate.email.split('@')[0];
  if (
    !VALID_UFS.has(candidate.uf)
    || seenEmails.has(candidate.email)
    || seenNames.has(name)
    || BAD_LOCAL_PARTS.test(localPart)
    || BAD_DOMAINS.test(candidate.domain)
    || !companyMatchesDomain(candidate.company, candidate.domain)
  ) continue;
  seenEmails.add(candidate.email);
  seenNames.add(name);
  unique.push({
    ...candidate,
    selectionScore: candidate.score + (GOOD_LOCAL_PARTS.test(localPart) ? 10 : 0),
  });
}

const domains = [...new Set(unique.map((candidate) => candidate.domain))];
const mxStatus = new Map();
for (let index = 0; index < domains.length; index += 50) {
  const batch = domains.slice(index, index + 50);
  const results = await Promise.all(batch.map(async (domain) => {
    try {
      const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`, {
        headers: { Accept: 'application/dns-json' },
        signal: AbortSignal.timeout(5000),
      });
      const payload = await response.json();
      return [domain, Array.isArray(payload.Answer) && payload.Answer.some((answer) => answer.type === 15)];
    } catch {
      return [domain, false];
    }
  }));
  for (const [domain, valid] of results) mxStatus.set(domain, valid);
}

const valid = unique.filter((candidate) => mxStatus.get(candidate.domain));
valid.sort((a, b) => b.selectionScore - a.selectionScore || a.company.localeCompare(b.company));

const selected = [];
const selectedEmails = new Set();
const selectedByUf = Object.fromEntries(VALID_UFS.values().map((uf) => [uf, 0]));
const domainUsage = new Map();

function take(candidate) {
  if (selectedEmails.has(candidate.email)) return false;
  if ((domainUsage.get(candidate.domain) || 0) >= 3) return false;
  selected.push(candidate);
  selectedEmails.add(candidate.email);
  selectedByUf[candidate.uf] += 1;
  domainUsage.set(candidate.domain, (domainUsage.get(candidate.domain) || 0) + 1);
  return true;
}

for (const uf of VALID_UFS) {
  const needed = Math.max((TARGETS[uf] || 0) - (currentByUf[uf] || 0), 0);
  for (const candidate of valid.filter((item) => item.uf === uf)) {
    if (selectedByUf[uf] >= needed) break;
    take(candidate);
  }
}

const additionsNeeded = FINAL_TARGET - existingValid.length;
for (const candidate of valid) {
  if (selected.length >= additionsNeeded) break;
  take(candidate);
}
if (selected.length < additionsNeeded) {
  throw new Error(`Apenas ${selected.length} candidatos passaram; são necessários ${additionsNeeded}.`);
}

const finalSelected = selected.slice(0, additionsNeeded);
const finalByUf = { ...currentByUf };
for (const candidate of finalSelected) finalByUf[candidate.uf] = (finalByUf[candidate.uf] || 0) + 1;

await fs.writeFile(output, JSON.stringify({
  generatedAt: new Date().toISOString(),
  validation: 'Situação ativa + CNAE aderente + e-mail em domínio próprio + MX válido + deduplicação',
  existingValid: existingValid.length,
  additions: finalSelected.length,
  finalEligible: existingValid.length + finalSelected.length,
  rejectedWithoutMx: unique.length - valid.length,
  finalByUf,
  candidates: finalSelected,
}, null, 2), 'utf8');
console.log(JSON.stringify({
  uniqueCandidates: unique.length,
  mxValid: valid.length,
  rejectedWithoutMx: unique.length - valid.length,
  additions: finalSelected.length,
  finalEligible: existingValid.length + finalSelected.length,
  finalByUf,
}, null, 2));
