import dns from 'node:dns/promises';
import { config } from './config.js';

function domainFromEmail(email) {
  return String(email || '').split('@')[1]?.trim().toLowerCase() || '';
}

async function txt(name) {
  try { return (await dns.resolveTxt(name)).map((parts) => parts.join('')); }
  catch { return []; }
}

async function mx(name) {
  try { return await dns.resolveMx(name); }
  catch { return []; }
}

const domain = domainFromEmail(config.senderEmail);
if (!domain) {
  console.error('Preencha SENDER_EMAIL no arquivo .env antes de executar a verificação.');
  process.exitCode = 1;
} else {
  const [rootTxt, dmarcTxt, dkimTxt, mxRecords] = await Promise.all([
    txt(domain),
    txt(`_dmarc.${domain}`),
    config.dkimSelector ? txt(`${config.dkimSelector}._domainkey.${domain}`) : Promise.resolve([]),
    mx(domain),
  ]);

  const spf = rootTxt.find((record) => record.toLowerCase().startsWith('v=spf1'));
  const dmarc = dmarcTxt.find((record) => record.toLowerCase().startsWith('v=dmarc1'));
  const dkim = dkimTxt.find((record) => /v=dkim1|p=/i.test(record));

  console.log(`\nDomínio analisado: ${domain}\n`);
  console.log(`${mxRecords.length ? 'OK' : 'FALTA'}  MX: ${mxRecords.length ? mxRecords.map((x) => x.exchange).join(', ') : 'nenhum registro encontrado'}`);
  console.log(`${spf ? 'OK' : 'FALTA'}  SPF: ${spf || 'nenhum registro v=spf1 encontrado'}`);
  console.log(`${dmarc ? 'OK' : 'FALTA'}  DMARC: ${dmarc || 'nenhum registro em _dmarc encontrado'}`);
  if (config.dkimSelector) {
    console.log(`${dkim ? 'OK' : 'FALTA'}  DKIM (${config.dkimSelector}): ${dkim ? 'registro encontrado' : 'registro não encontrado'}`);
  } else {
    console.log('PENDENTE  DKIM: informe DKIM_SELECTOR no .env para consultar o registro correto.');
  }

  const okay = Boolean(mxRecords.length && spf && dmarc && (!config.dkimSelector || dkim));
  console.log(`\nResultado: ${okay ? 'estrutura DNS básica localizada.' : 'existem pendências antes do envio ao vivo.'}`);
  console.log('A existência do registro não garante alinhamento correto; confirme também no painel do provedor de e-mail.\n');
  if (!okay) process.exitCode = 1;
}
