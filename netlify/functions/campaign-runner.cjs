let initialization;

exports.handler = async function handler() {
  const [
    { processScheduledBatch },
    { getState, loadState, refreshState },
  ] = await Promise.all([
    import('../../src/scheduler.js'),
    import('../../src/store.js'),
  ]);

  initialization ||= loadState();
  await initialization;
  await refreshState({ force: true });
  if (!getState().campaign.active) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: 'Campanha pausada.' }) };
  }

  const result = await processScheduledBatch();
  return {
    statusCode: result.ok ? 200 : 202,
    body: JSON.stringify(result),
  };
};
