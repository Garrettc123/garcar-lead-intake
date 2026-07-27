const http = require('node:http');
const crypto = require('node:crypto');
const { loadConfig } = require('./config');
const logger = require('./logger');
const { validateLeadPayload } = require('./validation');

const MAX_BODY_BYTES = 32 * 1024;

function createRateLimiter(config) {
  const buckets = new Map();

  return {
    allow(ipAddress) {
      const now = Date.now();
      const bucket = buckets.get(ipAddress);

      if (!bucket || now - bucket.windowStart >= config.rateLimitWindowMs) {
        buckets.set(ipAddress, { windowStart: now, count: 1 });
        return true;
      }

      if (bucket.count >= config.rateLimitMax) {
        return false;
      }

      bucket.count += 1;
      return true;
    }
  };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let finished = false;

    req.on('data', (chunk) => {
      if (finished) {
        return;
      }

      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        finished = true;
        req.destroy();
        reject(new Error('request body too large'));
      }
    });

    req.on('end', () => {
      if (finished) {
        return;
      }

      if (!body) {
        resolve({});
        return;
      }

      try {
        finished = true;
        resolve(JSON.parse(body));
      } catch (error) {
        finished = true;
        reject(new Error('invalid JSON body'));
      }
    });

    req.on('error', (error) => {
      if (!finished) {
        finished = true;
        reject(error);
      }
    });
  });
}

function sendJson(res, statusCode, payload) {
  const response = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(response)
  });
  res.end(response);
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function isAuthorized(req, config) {
  if (!config.adminApiToken) {
    return false;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const provided = authHeader.slice('Bearer '.length);
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(config.adminApiToken);
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function createServer(config = loadConfig()) {
  const rateLimiter = createRateLimiter(config);
  const metrics = {
    accepted: 0,
    rejected: 0,
    rateLimited: 0
  };
  let shuttingDown = false;

  const server = http.createServer(async (req, res) => {
    const path = req.url ? req.url.split('?')[0] : '/';

    if (config.enforceTlsHeaders && req.headers['x-forwarded-proto'] !== 'https') {
      sendJson(res, 426, {
        error: 'https_required'
      });
      return;
    }

    if (req.method === 'GET' && path === '/healthz') {
      sendJson(res, 200, { status: 'ok' });
      return;
    }

    if (req.method === 'GET' && path === '/readyz') {
      if (shuttingDown) {
        sendJson(res, 503, { status: 'shutting_down' });
        return;
      }

      sendJson(res, 200, {
        status: 'ready',
        checks: {
          configLoaded: true
        }
      });
      return;
    }

    if (req.method === 'GET' && path === '/api/admin/stats') {
      if (!isAuthorized(req, config)) {
        sendJson(res, 401, { error: 'unauthorized' });
        return;
      }

      sendJson(res, 200, {
        metrics,
        nodeEnv: config.nodeEnv
      });
      return;
    }

    if (req.method === 'POST' && path === '/api/leads') {
      const clientIp = getClientIp(req);
      if (!rateLimiter.allow(clientIp)) {
        metrics.rateLimited += 1;
        sendJson(res, 429, { error: 'rate_limited' });
        return;
      }

      try {
        const payload = await readJsonBody(req);
        const validationErrors = validateLeadPayload(payload);

        if (validationErrors.length > 0) {
          metrics.rejected += 1;
          sendJson(res, 400, {
            error: 'validation_failed',
            details: validationErrors
          });
          return;
        }

        const leadId = crypto.randomUUID();
        metrics.accepted += 1;
        logger.info('lead_intake_received', {
          leadId,
          consentGiven: true,
          consentTimestamp: payload.consentTimestamp || new Date().toISOString(),
          source: payload.source || 'unknown'
        });

        sendJson(res, 202, {
          status: 'accepted',
          leadId
        });
      } catch (error) {
        const status = error.message === 'request body too large' ? 413 : 400;
        sendJson(res, status, {
          error: 'invalid_request',
          details: error.message
        });
      }
      return;
    }

    sendJson(res, 404, { error: 'not_found' });
  });

  function start() {
    return new Promise((resolve) => {
      server.listen(config.port, () => {
        logger.info('server_started', {
          port: config.port,
          nodeEnv: config.nodeEnv
        });
        resolve(server);
      });
    });
  }

  function stop() {
    return new Promise((resolve) => {
      shuttingDown = true;
      server.close(() => {
        logger.info('server_stopped');
        resolve();
      });

      setTimeout(() => {
        resolve();
      }, config.gracefulShutdownTimeoutMs).unref();
    });
  }

  return {
    config,
    metrics,
    server,
    start,
    stop,
    setShuttingDown: (value) => {
      shuttingDown = Boolean(value);
    }
  };
}

async function run() {
  const app = createServer();
  await app.start();

  async function shutdown(signal) {
    logger.info('shutdown_signal_received', { signal });
    await app.stop();
    process.exit(0);
  }

  process.on('SIGTERM', () => {
    shutdown('SIGTERM').catch((error) => {
      logger.error('shutdown_error', { message: error.message });
      process.exit(1);
    });
  });

  process.on('SIGINT', () => {
    shutdown('SIGINT').catch((error) => {
      logger.error('shutdown_error', { message: error.message });
      process.exit(1);
    });
  });
}

if (require.main === module) {
  run().catch((error) => {
    logger.error('startup_error', { message: error.message });
    process.exit(1);
  });
}

module.exports = {
  createServer,
  run
};
