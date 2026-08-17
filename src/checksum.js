const crypto = require('crypto');

function generateChecksum(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const fs = require('fs');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function generateChecksumFromBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function verifyChecksum(data, expected) {
  const actual = typeof data === 'string'
    ? crypto.createHash('sha256').update(Buffer.from(data)).digest('hex')
    : crypto.createHash('sha256').update(data).digest('hex');
  return actual === expected;
}

module.exports = { generateChecksum, generateChecksumFromBuffer, verifyChecksum };
