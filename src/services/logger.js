const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

function log(level, message, meta) {
  const timestamp = new Date().toISOString();
  const base = `[${timestamp}] [${level}] ${message}`;
  if (meta !== undefined) {
    console.log(base, meta);
  } else {
    console.log(base);
  }
}

const logger = {
  debug: (message, meta) => log('DEBUG', message, meta),
  info: (message, meta) => log('INFO', message, meta),
  warn: (message, meta) => log('WARN', message, meta),
  error: (message, meta) => log('ERROR', message, meta),
};

module.exports = logger;
