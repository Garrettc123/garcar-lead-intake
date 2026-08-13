function log(level, event, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...details
  };

  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

module.exports = {
  info: (event, details) => log('info', event, details),
  warn: (event, details) => log('warn', event, details),
  error: (event, details) => log('error', event, details)
};
