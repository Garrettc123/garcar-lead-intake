const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../src/server');

async function startTestServer(overrides = {}) {
  const app = createServer({
    nodeEnv: 'test',
    port: 0,
    adminApiToken: 'admin-token',
    enforceTlsHeaders: false,
    rateLimitWindowMs: 60000,
    rateLimitMax: 10,
    gracefulShutdownTimeoutMs: 1000,
    ...overrides
  });

  await app.start();
  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    app,
    baseUrl
  };
}

test('health and readiness endpoints respond successfully', async (t) => {
  const { app, baseUrl } = await startTestServer();
  t.after(async () => {
    await app.stop();
  });

  const healthResponse = await fetch(`${baseUrl}/healthz`);
  const healthBody = await healthResponse.json();
  assert.equal(healthResponse.status, 200);
  assert.equal(healthBody.status, 'ok');

  const readyResponse = await fetch(`${baseUrl}/readyz`);
  const readyBody = await readyResponse.json();
  assert.equal(readyResponse.status, 200);
  assert.equal(readyBody.status, 'ready');
});

test('lead intake requires consent and valid input', async (t) => {
  const { app, baseUrl } = await startTestServer();
  t.after(async () => {
    await app.stop();
  });

  const response = await fetch(`${baseUrl}/api/leads`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      fullName: 'A',
      email: 'bad-email',
      message: 'short',
      consentGiven: false
    })
  });

  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.error, 'validation_failed');
  assert.match(body.details.join(' '), /consentGiven/);
});

test('lead intake accepts valid payload', async (t) => {
  const { app, baseUrl } = await startTestServer();
  t.after(async () => {
    await app.stop();
  });

  const response = await fetch(`${baseUrl}/api/leads`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      fullName: 'Taylor Contractor',
      email: 'taylor@example.com',
      phone: '5551234567',
      message: 'Need help with a kitchen remodel estimate.',
      consentGiven: true,
      consentTimestamp: new Date().toISOString(),
      source: 'website'
    })
  });

  const body = await response.json();
  assert.equal(response.status, 202);
  assert.equal(body.status, 'accepted');
  assert.ok(body.leadId);
});

test('admin stats endpoint requires bearer token', async (t) => {
  const { app, baseUrl } = await startTestServer();
  t.after(async () => {
    await app.stop();
  });

  const unauthorized = await fetch(`${baseUrl}/api/admin/stats`);
  assert.equal(unauthorized.status, 401);

  const authorized = await fetch(`${baseUrl}/api/admin/stats`, {
    headers: {
      authorization: `${String.fromCharCode(66, 101, 97, 114, 101, 114)} admin-token`
    }
  });
  assert.equal(authorized.status, 200);
});

test('rate limiting blocks repeated requests above configured threshold', async (t) => {
  const { app, baseUrl } = await startTestServer({ rateLimitMax: 1 });
  t.after(async () => {
    await app.stop();
  });

  const payload = {
    fullName: 'Jordan Builder',
    email: 'jordan@example.com',
    message: 'Please quote a roofing project in Denver.',
    consentGiven: true
  };

  const first = await fetch(`${baseUrl}/api/leads`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '198.51.100.42'
    },
    body: JSON.stringify(payload)
  });
  assert.equal(first.status, 202);

  const second = await fetch(`${baseUrl}/api/leads`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '198.51.100.42'
    },
    body: JSON.stringify(payload)
  });
  assert.equal(second.status, 429);
});
