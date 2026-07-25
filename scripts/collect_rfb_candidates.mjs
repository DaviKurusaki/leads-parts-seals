import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { StringDecoder } from 'node:string_decoder';
import { Transform } from 'node:stream';
import unzipper from 'unzipper';

const snapshot = process.argv[2] || 'tmp/rfb-2026-07-12';
const establishmentFile = process.argv[3] || 'Estabelecimentos1.zip';
const outputFile = process.argv[4] || 'tmp/rfb-candidates.json';

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.com.br', 'outlook.com',
  'outlook.com.br', 'live.com', 'msn.com', 'yahoo.com', 'yahoo.com.br', 'icloud.com',
  'terra.com.br', 'uol.com.br', 'bol.com.br', 'ig.com.br', 'proton.me', 'protonmail.com',
]);

const SEGMENTS = [
  [/^4663000$/, 'Distribuidora', 100],
  [/^4662100$/, 'Industrial', 95],
  [/^4661300$/, 'Industrial', 90],
  [/^33147/, 'Industrial', 95],
  [/^33139/, 'Industrial', 90],
  [/^33112/, 'Industrial', 90],
  [/^33121/, 'Industrial', 90],
  [/^2813/, 'Fabricante', 100],
  [/^2812/, 'Fabricante', 95],
  [/^2814/, 'Fabricante', 95],
  [/^2822/, 'Fabricante', 95],
  [/^2823/, 'Fabricante', 95],
  [/^2824/, 'Fabricante', 95],
  [/^2825/, 'Fabricante', 95],
  [/^2829/, 'Fabricante', 90],
  [/^2539/, 'Fabricante', 85],
  [/^2451/, 'Fabricante', 85],
  [/^2452/, 'Fabricante', 85],
  [/^22196/, 'Fabricante/Vedações', 90],
  [/^22293/, 'Fabricante', 80],
];

function parseRow(line) {
  const value = line.replace(/^\uFEFF/, '').replace(/\r$/, '');
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).split('";"').map((cell) => cell.replaceAll('""', '"').trim());
  }
  return value.split(';').map((cell) => cell.replace(/^"|"$/g, '').trim());
}

function firstZipEntryStream(zipPath) {
  return fs.createReadStream(zipPath).pipe(unzipper.ParseOne());
}

function latin1Decoder() {
  const decoder = new StringDecoder('latin1');
  return new Transform({
    transform(chunk, _encoding, callback) {
      callback(null, decoder.write(chunk));
    },
    flush(callback) {
      const final = decoder.end();
      if (final) this.push(final);
      callback();
    },
  });
}

async function readLookup(zipPath) {
  const rows = new Map();
  const entry = firstZipEntryStream(zipPath);
  const lines = readline.createInterface({ input: entry.pipe(latin1Decoder()), crlfDelay: Infinity });
  for await (const line of lines) {
    const [code, description] = parseRow(line);
    if (code) rows.set(code, description);
  }
  return rows;
}

function emailInfo(rawEmail) {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  const domain = email.split('@')[1];
  if (FREE_EMAIL_DOMAINS.has(domain)) return null;
  if (/^(contato|email|teste|nao|sememail|financeiro)@example\./.test(email)) return null;
  return { email, domain };
}

function segmentFor(cnae) {
  for (const [pattern, segment, score] of SEGMENTS) {
    if (pattern.test(cnae)) return { segment, score };
  }
  return null;
}

const municipalities = await readLookup(path.join(snapshot, 'Municipios.zip'));
const cnaes = await readLookup(path.join(snapshot, 'Cnaes.zip'));
const entry = firstZipEntryStream(path.join(snapshot, establishmentFile));
const lines = readline.createInterface({ input: entry.pipe(latin1Decoder()), crlfDelay: Infinity });
const candidates = [];
const seenEmails = new Set();
let scanned = 0;

for await (const line of lines) {
  scanned += 1;
  const row = parseRow(line);
  const fantasyName = row[4];
  const status = row[5];
  const mainCnae = row[11];
  const uf = row[19];
  const email = emailInfo(row[27]);
  const fit = segmentFor(mainCnae);
  if (
    row[3] !== '1'
    || status !== '02'
    || !fantasyName
    || fantasyName.length < 3
    || !/[A-ZÀ-Ü]/i.test(fantasyName)
    || !email
    || !fit
    || seenEmails.has(email.email)
  ) continue;

  seenEmails.add(email.email);
  candidates.push({
    cnpj: `${row[0]}${row[1]}${row[2]}`,
    company: fantasyName.replace(/\s+/g, ' ').trim(),
    segment: fit.segment,
    score: fit.score,
    city: municipalities.get(row[20]) || row[20],
    uf,
    email: email.email,
    domain: email.domain,
    cnae: mainCnae,
    cnaeDescription: cnaes.get(mainCnae) || '',
    source: 'https://dados-abertos-rf-cnpj.casadosdados.com.br/arquivos/2026-07-12/',
    sourceSnapshot: 'Receita Federal — Dados Abertos CNPJ, 12/07/2026',
  });
}

await fsp.mkdir(path.dirname(outputFile), { recursive: true });
await fsp.writeFile(outputFile, JSON.stringify({ scanned, candidates }, null, 2), 'utf8');
const byUf = Object.fromEntries(
  [...Map.groupBy(candidates, (candidate) => candidate.uf)]
    .map(([uf, items]) => [uf, items.length])
    .sort(([a], [b]) => a.localeCompare(b)),
);
console.log(JSON.stringify({ scanned, accepted: candidates.length, byUf }, null, 2));
