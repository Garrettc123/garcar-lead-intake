const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateLeadPayload(payload) {
  const errors = [];

  if (!payload || typeof payload !== 'object') {
    return ['payload must be a JSON object'];
  }

  if (typeof payload.fullName !== 'string' || payload.fullName.trim().length < 2) {
    errors.push('fullName must be at least 2 characters');
  }

  if (typeof payload.email !== 'string' || !EMAIL_PATTERN.test(payload.email)) {
    errors.push('email must be valid');
  }

  if (payload.phone !== undefined && (typeof payload.phone !== 'string' || payload.phone.trim().length < 7)) {
    errors.push('phone must be at least 7 characters when provided');
  }

  if (typeof payload.message !== 'string' || payload.message.trim().length < 10) {
    errors.push('message must be at least 10 characters');
  }

  if (payload.consentGiven !== true) {
    errors.push('consentGiven must be true before lead intake');
  }

  if (payload.consentTimestamp !== undefined && Number.isNaN(Date.parse(payload.consentTimestamp))) {
    errors.push('consentTimestamp must be an ISO-8601 timestamp when provided');
  }

  return errors;
}

module.exports = {
  validateLeadPayload
};
