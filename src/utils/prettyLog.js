const logger = require('../services/logger');

function logBox(title, lines = []) {
  const header = `==== ${title} ====`;
  logger.info(header);
  lines.forEach((line) => logger.info(line));
  logger.info('='.repeat(header.length));
}

function logJson(label, obj) {
  const json = JSON.stringify(obj, null, 2);
  logBox(label, [json]);
}

module.exports = {
  logBox,
  logJson,
};
