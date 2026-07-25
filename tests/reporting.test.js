import test from 'node:test';
import assert from 'node:assert/strict';
import { responseBucket } from '../src/reporting.js';

test('classifica respostas comerciais nos grupos de KPI', () => {
  assert.equal(responseBucket({ replied: true, responseClass: 'Interessado' }), 'interested');
  assert.equal(responseBucket({ replied: true, responseClass: 'Não interessado' }), 'notInterested');
  assert.equal(responseBucket({ replied: true, responseClass: 'A classificar' }), 'unclassified');
  assert.equal(responseBucket({ replied: true, optedOut: true }), 'optedOut');
  assert.equal(responseBucket({ replied: false }), 'noReply');
});
