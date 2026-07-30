let initialization;

exports.handler = async function handler(event) {
  const expectedToken = process.env.SUPABASE_SECRET_KEY || '';
  const receivedToken = event.headers?.['x-parts-seals-worker-token'] || '';
  if (!expectedToken || receivedToken !== expectedToken) {
    return { statusCode: 401 };
  }

  const [
    { processScheduledBatch },
    { loadState, refreshState },
  ] = await Promise.all([
    import('../../src/scheduler.js'),
    import('../../src/store.js'),
  ]);

  initialization ||= loadState();
  await initialization;
  await refreshState({ force: true });
  await processScheduledBatch();
  return { statusCode: 202 };
};
