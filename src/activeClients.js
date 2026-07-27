import fs from 'node:fs/promises';
import { config } from './config.js';

const publicEmailDomains = new Set([
  'gmail.com',
  'hotmail.com',
  'hotmail.com.br',
  'live.com',
  'outlook.com',
  'outlook.com.br',
  'yahoo.com',
  'yahoo.com.br',
]);

const legalAndGenericTerms = new Set([
  'com',
  'comercio',
  'comercial',
  'da',
  'das',
  'de',
  'do',
  'dos',
  'e',
  'eireli',
  'epp',
  'industria',
  'industrial',
  'industriais',
  'ltda',
  'me',
  'sa',
  'servicos',
]);

const weakCompanyTerms = new Set([
  'acessorios',
  'componentes',
  'equipamentos',
  'grupo',
  'hidraulica',
  'hidraulicas',
  'manutencao',
  'pecas',
  'pneumatica',
  'pneumaticas',
  'solucoes',
  'suprimentos',
  'vedacao',
  'vedacoes',
]);

function normalize(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' e ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function companyTokens(value = '') {
  return normalize(value)
    .split(' ')
    .filter((token) => token && !legalAndGenericTerms.has(token));
}

function companyKey(value = '') {
  return companyTokens(value).join(' ');
}

function distinctiveTokens(value = '') {
  return companyTokens(value).filter((token) => token.length >= 2 && !weakCompanyTerms.has(token));
}

function digits(value = '') {
  return String(value || '').replace(/\D/g, '');
}

function email(value = '') {
  return String(value || '').trim().toLowerCase();
}

function domainFromEmail(value = '') {
  return email(value).split('@')[1]?.replace(/^www\./, '') || '';
}

function domainFromSite(value = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  try {
    const parsed = new URL(raw.match(/^https?:\/\//) ? raw : `https://${raw}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return raw.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}

function locationParts(value = '') {
  const normalized = normalize(value);
  const parts = normalized.split(' ');
  const uf = parts.at(-1)?.length === 2 ? parts.pop() : '';
  return { city: parts.join(' '), uf };
}

function sameLocation(lead, client) {
  const activeLocation = locationParts(client.city);
  return (
    activeLocation.city
    && activeLocation.city === normalize(lead.city)
    && (!activeLocation.uf || activeLocation.uf === normalize(lead.uf))
  );
}

function subsetMatch(lead, client) {
  if (!sameLocation(lead, client)) return false;
  const leadTokens = companyTokens(lead.company);
  if (!leadTokens.length) return false;
  const leadDistinctive = distinctiveTokens(lead.company);
  if (!leadDistinctive.length) return false;

  return [client.name, client.legalName].some((candidate) => {
    const activeTokens = companyTokens(candidate);
    return leadTokens.every((token) => activeTokens.includes(token));
  });
}

export async function readActiveClientRegistry() {
  try {
    const parsed = JSON.parse(await fs.readFile(config.activeClientsFile, 'utf8'));
    return Array.isArray(parsed.clients) ? parsed.clients : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export function activeClientMatch(lead, clients) {
  const leadCnpj = digits(lead.cnpj);
  const leadEmail = email(lead.email);
  const leadDomain = domainFromEmail(leadEmail);
  const leadCompanyKey = companyKey(lead.company);

  for (const client of clients) {
    const clientCnpj = digits(client.cnpj);
    if (leadCnpj.length === 14 && clientCnpj === leadCnpj) {
      return { client, reason: 'CNPJ idêntico' };
    }

    const clientEmail = email(client.email);
    if (leadEmail && clientEmail && clientEmail === leadEmail) {
      return { client, reason: 'e-mail idêntico' };
    }

    const clientDomains = new Set([
      domainFromEmail(clientEmail),
      domainFromSite(client.site),
    ].filter((domain) => domain && !publicEmailDomains.has(domain)));
    if (leadDomain && !publicEmailDomains.has(leadDomain) && clientDomains.has(leadDomain)) {
      return { client, reason: 'domínio idêntico' };
    }

    const activeKeys = [companyKey(client.name), companyKey(client.legalName)].filter(Boolean);
    if (leadCompanyKey && activeKeys.includes(leadCompanyKey)) {
      return { client, reason: 'nome idêntico' };
    }

    if (subsetMatch(lead, client)) {
      return { client, reason: 'nome compatível na mesma cidade' };
    }
  }

  return null;
}

export async function filterActiveClients(leads) {
  const clients = await readActiveClientRegistry();
  const kept = [];
  const suppressed = [];

  for (const lead of leads) {
    const match = activeClientMatch(lead, clients);
    if (match) {
      suppressed.push({
        leadId: lead.id,
        company: lead.company,
        clientCode: match.client.code,
        activeClient: match.client.name,
        reason: match.reason,
      });
    } else {
      kept.push(lead);
    }
  }

  return { kept, suppressed };
}
