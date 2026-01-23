const crypto = require('crypto');

function buildPrintotecaSignature(payload, secretKey) {
  return crypto.createHash('sha1').update(payload + secretKey).digest('hex');
}

module.exports = {
  buildPrintotecaSignature,
};
