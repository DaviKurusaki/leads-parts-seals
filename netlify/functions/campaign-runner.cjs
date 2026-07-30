let initialization;

exports.handler = async function handler() {
  const [
    { autoBatchSlot },
    { getState, loadState, refreshState },
  ] = await Promise.all([
    import('../../src/businessTime.js'),
    import('../../src/store.js'),
  ]);

  initialization ||= loadState();
  await initialization;
  await refreshState({ force: true });
  if (!getState().campaign.active) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: 'Campanha pausada.' }) };
  }

  const slot = autoBatchSlot();
  if (!slot) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: 'Fora da agenda automática.' }) };
  }

  const siteUrl = String(process.env.URL || '').replace(/\/+$/, '');
  const workerToken = process.env.SUPABASE_SECRET_KEY || '';
  if (!siteUrl || !workerToken) {
    throw new Error('URL ou SUPABASE_SECRET_KEY indisponível para iniciar o worker.');
  }

  const response = await fetch(`${siteUrl}/.netlify/functions/campaign-worker-background`, {
    method: 'POST',
    headers: { 'x-parts-seals-worker-token': workerToken },
  });
  if (!response.ok) {
    throw new Error(`Worker em segundo plano recusou a execução: HTTP ${response.status}.`);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, dispatched: true, slot: slot.key }),
  };
};
