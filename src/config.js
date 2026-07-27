const DEFAULTS = {
  nodeEnv: 'development',
  port: 3000,
  rateLimitWindowMs: 60000,
  rateLimitMax: 30,
  gracefulShutdownTimeoutMs: 10000
};

function parseInteger(rawValue, key, fallback) {
  if (rawValue === undefined || rawValue === '') {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }
  return parsed;
}

function parseBoolean(rawValue, fallback = false) {
  if (rawValue === undefined || rawValue === '') {
    return fallback;
  }
  return rawValue === 'true';
}

function loadConfig(env = process.env) {
  const port = parseInteger(env.PORT, 'PORT', DEFAULTS.port);
  const rateLimitWindowMs = parseInteger(env.RATE_LIMIT_WINDOW_MS, 'RATE_LIMIT_WINDOW_MS', DEFAULTS.rateLimitWindowMs);
  const rateLimitMax = parseInteger(env.RATE_LIMIT_MAX, 'RATE_LIMIT_MAX', DEFAULTS.rateLimitMax);
  const gracefulShutdownTimeoutMs = parseInteger(
    env.GRACEFUL_SHUTDOWN_TIMEOUT_MS,
    'GRACEFUL_SHUTDOWN_TIMEOUT_MS',
    DEFAULTS.gracefulShutdownTimeoutMs
  );

  return {
    nodeEnv: env.NODE_ENV || DEFAULTS.nodeEnv,
    port,
    adminApiToken: env.ADMIN_API_TOKEN || '',
    enforceTlsHeaders: parseBoolean(env.ENFORCE_TLS_HEADERS, false),
    rateLimitWindowMs,
    rateLimitMax,
    gracefulShutdownTimeoutMs
  };
}

module.exports = {
  DEFAULTS,
  loadConfig
};
