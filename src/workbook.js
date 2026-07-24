import ExcelJS from 'exceljs';
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

export async function readCampaignWorkbook(filePath = config.workbookPath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet('Campanha');
  if (!sheet) throw new Error('A aba "Campanha" não foi encontrada na planilha.');

  const headers = {};
  sheet.getRow(1).eachCell((cell, colNumber) => {
    headers[normalize(cell.value)] = colNumber;
  });

  const get = (row, name) => normalize(row.getCell(headers[name]).value);
  const leads = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const id = Number.parseInt(get(row, 'ID'), 10);
    const company = get(row, 'Empresa');
    if (!id || !company) return;

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
  });

  return leads;
}
