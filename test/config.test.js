const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS, loadConfig } = require('../src/config');

test('loadConfig returns defaults when env values are absent', () => {
  const config = loadConfig({});

  assert.equal(config.port, DEFAULTS.port);
  assert.equal(config.rateLimitMax, DEFAULTS.rateLimitMax);
  assert.equal(config.adminApiToken, '');
  assert.equal(config.enforceTlsHeaders, false);
});

test('loadConfig parses explicit env values', () => {
  const config = loadConfig({
    PORT: '8080',
    RATE_LIMIT_WINDOW_MS: '15000',
    RATE_LIMIT_MAX: '10',
    ADMIN_API_TOKEN: 'secret-token',
    ENFORCE_TLS_HEADERS: 'true'
  });

  assert.equal(config.port, 8080);
  assert.equal(config.rateLimitWindowMs, 15000);
  assert.equal(config.rateLimitMax, 10);
  assert.equal(config.adminApiToken, 'secret-token');
  assert.equal(config.enforceTlsHeaders, true);
});

test('loadConfig throws when integer env values are invalid', () => {
  assert.throws(() => loadConfig({ PORT: '0' }), /PORT must be a positive integer/);
});
