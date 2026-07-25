import test from 'node:test';
import assert from 'node:assert/strict';
import { readCampaignWorkbook } from '../src/workbook.js';

test('importa a planilha de campanha no modo compatível', async () => {
  const leads = await readCampaignWorkbook();

  assert.equal(leads.length, 251);
  assert.equal(leads.filter((lead) => lead.canSend && lead.email).length, 119);
  assert.equal(leads[0].company, 'C T Neto Cld Vedações');
});
