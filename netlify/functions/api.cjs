const serverless = require('serverless-http');

let expressHandler;

exports.handler = async function handler(event, context) {
  const { default: app, initializeApp } = await import('../../src/server.js');
  await initializeApp();
  expressHandler ||= serverless(app);
  return expressHandler(event, context);
};
