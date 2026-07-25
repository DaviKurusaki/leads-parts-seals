import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('base complementar possui 881 contatos únicos e cobertura nacional validada', async () => {
  const seed = JSON.parse(await fs.readFile('data/leads-rfb-2026-07-12.json', 'utf8'));
  assert.equal(seed.leads.length, 881);
  assert.equal(new Set(seed.leads.map((lead) => lead.email)).size, 881);
  assert.ok(new Set(seed.leads.map((lead) => lead.uf)).size >= 23);
  assert.ok(seed.leads.every((lead) => lead.canSend && lead.email && lead.mxValidatedAt));
  assert.ok(seed.leads.every((lead) => lead.emailSource.startsWith('https://')));
});
