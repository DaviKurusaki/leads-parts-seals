import path from 'node:path';
import ExcelJS from 'exceljs';
import unzipper from 'unzipper';
import { config } from './config.js';

const oldAttachmentCopy = 'Posso encaminhar uma apresentação curta ou avaliar um item real, sem compromisso?';
const currentAttachmentCopy = 'Estou encaminhando em anexo uma apresentação comercial da Parts Seals, com nossas linhas de atendimento, materiais e aplicações. Se fizer sentido, também posso avaliar um item real, sem compromisso.';

function normalize(value) {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('text' in value) return String(value.text ?? '');
    if ('result' in value) return String(value.result ?? '');
    if ('hyperlink' in value) return String(value.text || value.hyperlink || '');
  }
  return String(value).trim();
}

function updateAttachmentCopy(value) {
  return normalize(value).replaceAll(oldAttachmentCopy, currentAttachmentCopy);
}

function yes(value) {
  return ['sim', 'yes', 'true', '1'].includes(normalize(value).toLowerCase());
}

function decodeXml(value = '') {
  return String(value)
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function columnName(reference = '') {
  return String(reference).match(/^[A-Z]+/)?.[0] || '';
}

function parseSharedStrings(xml = '') {
  const strings = [];
  for (const match of String(xml).matchAll(/<(?:x:)?si\b[^>]*>([\s\S]*?)<\/(?:x:)?si>/g)) {
    const parts = [...match[1].matchAll(/<(?:x:)?t\b[^>]*>([\s\S]*?)<\/(?:x:)?t>/g)];
    strings.push(decodeXml(parts.map((part) => part[1]).join('')));
  }
  return strings;
}

function parseWorksheetRows(xml, sharedStrings = []) {
  const rows = [];
  const rowPattern = /<(?:x:)?row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/(?:x:)?row>/g;
  const cellPattern = /<(?:x:)?c\b([^>]*?)\/>|<(?:x:)?c\b([^>]*?)>([\s\S]*?)<\/(?:x:)?c>/g;

  for (const rowMatch of String(xml).matchAll(rowPattern)) {
    const cells = {};
    for (const cellMatch of rowMatch[2].matchAll(cellPattern)) {
      const attributes = cellMatch[1] || cellMatch[2] || '';
      const body = cellMatch[3] || '';
      const reference = attributes.match(/\br="([^"]+)"/)?.[1] || '';
      const type = attributes.match(/\bt="([^"]+)"/)?.[1] || '';
      const rawValue = body.match(/<(?:x:)?v>([\s\S]*?)<\/(?:x:)?v>/)?.[1] || '';
      const inlineParts = [...body.matchAll(/<(?:x:)?t\b[^>]*>([\s\S]*?)<\/(?:x:)?t>/g)];
      let value = inlineParts.length
        ? inlineParts.map((part) => decodeXml(part[1])).join('')
        : decodeXml(rawValue);
      if (type === 's') value = sharedStrings[Number.parseInt(rawValue, 10)] || '';
      cells[columnName(reference)] = value;
    }
    rows.push(cells);
  }
  return rows;
}

async function readCampaignRowsFromXml(filePath) {
  const archive = await unzipper.Open.file(filePath);
  const entries = new Map(archive.files.map((file) => [file.path.replaceAll('\\', '/'), file]));
  const readEntry = async (entryPath, required = true) => {
    const entry = entries.get(entryPath.replace(/^\/+/, ''));
    if (!entry) {
      if (required) throw new Error(`Arquivo interno ausente no XLSX: ${entryPath}`);
      return '';
    }
    return (await entry.buffer()).toString('utf8').replace(/^\uFEFF/, '');
  };

  const workbookXml = await readEntry('xl/workbook.xml');
  const relationshipsXml = await readEntry('xl/_rels/workbook.xml.rels');
  const sheetTag = [...workbookXml.matchAll(/<(?:x:)?sheet\b([^>]*?)\/>/g)]
    .find((match) => /\bname="Campanha"/.test(match[1]));
  const relationshipId = sheetTag?.[1].match(/\br:id="([^"]+)"/)?.[1] || '';
  if (!relationshipId) throw new Error('A aba "Campanha" não foi encontrada na planilha.');

  const relationship = [...relationshipsXml.matchAll(/<Relationship\b([^>]*?)\/>/g)]
    .find((match) => match[1].match(/\bId="([^"]+)"/)?.[1] === relationshipId);
  const target = relationship?.[1].match(/\bTarget="([^"]+)"/)?.[1] || '';
  if (!target) throw new Error('O arquivo interno da aba "Campanha" não foi localizado.');

  const sheetPath = target.startsWith('/')
    ? target.slice(1)
    : path.posix.normalize(path.posix.join('xl', target));
  const sharedStrings = parseSharedStrings(await readEntry('xl/sharedStrings.xml', false));
  const rows = parseWorksheetRows(await readEntry(sheetPath), sharedStrings);
  if (!rows.length) throw new Error('A aba "Campanha" está vazia.');
  return rows;
}

async function readRecords(filePath) {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.getWorksheet('Campanha');
    if (!sheet) throw new Error('A aba "Campanha" não foi encontrada na planilha.');

    const headers = {};
    sheet.getRow(1).eachCell((cell, colNumber) => {
      headers[normalize(cell.value)] = colNumber;
    });
    const records = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      records.push(Object.fromEntries(
        Object.entries(headers).map(([name, colNumber]) => [
          name,
          normalize(row.getCell(colNumber).value),
        ]),
      ));
    });
    return records;
  } catch (error) {
    console.warn(`Leitura padrão do XLSX indisponível; usando modo compatível: ${error.message}`);
    const rows = await readCampaignRowsFromXml(filePath);
    const headers = Object.fromEntries(
      Object.entries(rows[0]).map(([column, name]) => [normalize(name), column]),
    );
    return rows.slice(1).map((row) => Object.fromEntries(
      Object.entries(headers).map(([name, column]) => [name, normalize(row[column])]),
    ));
  }
}

export async function readCampaignWorkbook(filePath = config.workbookPath) {
  const records = await readRecords(filePath);
  const get = (row, name) => normalize(row[name]);
  const leads = [];

  for (const row of records) {
    const id = Number.parseInt(get(row, 'ID'), 10);
    const company = get(row, 'Empresa');
    if (!id || !company) continue;

    leads.push({
      id,
      company,
      segment: get(row, 'Segmento'),
      city: get(row, 'Cidade'),
      uf: get(row, 'UF'),
      region: get(row, 'Região'),
      priority: get(row, 'Prioridade'),
      email: get(row, 'E-mail').toLowerCase(),
      emailSource: get(row, 'Fonte do E-mail'),
      canSend: get(row, 'Enviar?') === 'Sim',
      commercialProfile: get(row, 'Perfil comercial'),
      regionalMarket: get(row, 'Mercado regional sugerido'),
      applications: get(row, 'Aplicações mais aderentes'),
      suggestedProducts: get(row, 'Produtos Parts Seals sugeridos'),
      differentiation: get(row, 'Diferencial a destacar'),
      personalizationBasis: get(row, 'Base da personalização'),
      confidence: get(row, 'Confiança'),
      humanReview: get(row, 'Revisão humana obrigatória'),
      subject: get(row, 'Assunto inicial'),
      greeting: get(row, 'Saudação'),
      initialBody: updateAttachmentCopy(get(row, 'E-mail inicial')),
      followup1Body: get(row, 'Follow-up 1'),
      followup2Body: get(row, 'Follow-up 2'),
      cta: get(row, 'CTA principal'),
      privacyFooter: get(row, 'Rodapé LGPD'),
      campaignStatus: get(row, 'Status campanha') || (get(row, 'E-mail') ? 'Aguardando aprovação' : 'Sem e-mail'),
      approved: yes(get(row, 'Aprovado?')),
      approvedAt: get(row, 'Data aprovação') || null,
      sentAt: get(row, 'Data envio 1') || null,
      followup1At: get(row, 'Data follow-up 1') || null,
      followup2At: get(row, 'Data follow-up 2') || null,
      response: get(row, 'Resposta'),
      responseClass: get(row, 'Classificação resposta'),
      optedOut: yes(get(row, 'Opt-out')),
      bounce: get(row, 'Erro/Bounce'),
      notes: get(row, 'Observações campanha'),
      regionalSource: get(row, 'Fonte regional'),
      specificSource: get(row, 'Fonte específica'),
      researchPrompt: get(row, 'Prompt de pesquisa futura'),
      version: get(row, 'Versão'),
      stage: get(row, 'Data follow-up 2') ? 3 : get(row, 'Data follow-up 1') ? 2 : get(row, 'Data envio 1') ? 1 : 0,
      replied: Boolean(get(row, 'Resposta')) || get(row, 'Status campanha') === 'Respondeu',
      paused: false,
      messageIds: [],
      research: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  return leads;
}
