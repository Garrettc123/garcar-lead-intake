'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../src/server');
const { journalReady, persistLead } = require('../src/durable_store');

const payload = {
  fullName: 'Example Buyer',
  email: 'buyer@example.com',
  message: 'Please review my company's callback process.',
  consentGiven: true,
  source: 'local-test'
};
function config(journalPath) {
  return {
    nodeEnv: 'production', port: 0, leadJournalPath: journalPath,
    adminApiToken: '', enforceTlsHeaders: false,
    rateLimitWindowMs: 60000, rateLimitMax: 30,
    gracefulShutdownTimeoutMs: 1000
  };
}
function endpoint(app) {
  return `http://127.0.0.1:${app.server.address().port}`;
}
function submit(url) {
  return fetch(`${url}/api/leads`, {
    method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify(payload)
  });
}
test('production readiness and lead ingestion fail closed without persistent storage', async (t) => {
  const app = createServer(config(''));
  await app.start();
  t.after(() => app.stop());
  assert.equal((await fetch(`${endpoint(app)}/readyz`)).status, 503);
  const result = await submit(endpoint(app));
  assert.equal(result.status, 503);
  assert.equal((await result.json()).error, 'storage_unavailable');
  assert.equal(app.metrics.accepted, 0);
});
test('accepted lead is durable and readable after service restart', async (t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'garcar-lead-journal-'));
  t.after(() => fs.rmSync(folder, {recursive: true, force: true}));
  const file = path.join(folder, 'leads.ndjson');
  const first = createServer(config(file));
  await first.start();
  assert.equal((await fetch(`${endpoint(first)}/readyz`)).status, 200);
  const response = await submit(endpoint(first));
  assert.equal(response.status, 202);
  const { leadId } = await response.json();
  await first.stop();
  const second = createServer(config(file));
  await second.start();
  t.after(() => second.stop());
  assert.equal((await fetch(`${endpoint(second)}/readyz`)).status, 200);
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
  const record = JSON.parse(lines[0]);
  assert.equal(record.leadId, leadId);
  assert.equal(record.email, payload.email);
  assert.equal(record.consentGiven, true);
  assert.equal(fs.statSync(file).mode & 0o077, 0);
});
test('relative file path and nonregular journal target rejected', () => {
  assert.equal(journalReady('relative.ndjson'), false);
  assert.throws(() => persistLead('relative.ndjson', payload));
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'garcar-nonfile-'));
  try {
    assert.equal(journalReady(folder), false);
    assert.throws(() => persistLead(folder, payload));
  } finally {
    fs.rmSync(folder, {recursive: true, force: true});
  }
});
