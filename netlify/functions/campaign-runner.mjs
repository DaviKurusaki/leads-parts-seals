import { processNext } from '../../src/scheduler.js';
import { getState, loadState, refreshState } from '../../src/store.js';

let initialization;

export async function handler() {
  initialization ||= loadState();
  await initialization;
  await refreshState({ force: true });
  if (!getState().campaign.active) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: 'Campanha pausada.' }) };
  }

  const result = await processNext();
  return {
    statusCode: result.ok ? 200 : 202,
    body: JSON.stringify(result),
  };
}
