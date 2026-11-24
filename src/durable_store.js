'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Single-host, persistent-volume journal. Not a multi-writer database.
function openJournal(filePath) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
    throw new Error('persistent journal path must be absolute');
  }
  const parent = path.dirname(filePath);
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  const flags = fs.constants.O_APPEND | fs.constants.O_CREAT |
    fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW || 0);
  const fd = fs.openSync(filePath, flags, 0o600);
  try {
    if (!fs.fstatSync(fd).isFile()) throw new Error('journal is not a regular file');
    return fd;
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}

function journalReady(filePath) {
  try {
    const fd = openJournal(filePath);
    fs.closeSync(fd);
    return true;
  } catch (_error) {
    return false;
  }
}

function persistLead(filePath, lead) {
  const fd = openJournal(filePath);
  try {
    const data = Buffer.from(`${JSON.stringify(lead)}\n`, 'utf8');
    let offset = 0;
    while (offset < data.length) {
      const written = fs.writeSync(fd, data, offset, data.length - offset);
      if (written < 1) throw new Error('short journal write');
      offset += written;
    }
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

module.exports = { journalReady, persistLead };
