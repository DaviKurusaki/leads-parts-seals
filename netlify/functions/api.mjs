import serverless from 'serverless-http';
import app, { initializeApp } from '../../src/server.js';

const expressHandler = serverless(app);

export async function handler(event, context) {
  await initializeApp();
  return expressHandler(event, context);
}
