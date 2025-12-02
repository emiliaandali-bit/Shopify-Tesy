const timestamp = () => new Date().toISOString();

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

function log(level: LogLevel, message: string, meta?: unknown): void {
  const base = `[${timestamp()}] [${level}] ${message}`;
  if (meta !== undefined) {
    console.log(base, meta);
  } else {
    console.log(base);
  }
}

const logger = {
  info: (message: string, meta?: unknown) => log('INFO', message, meta),
  warn: (message: string, meta?: unknown) => log('WARN', message, meta),
  error: (message: string, meta?: unknown) => log('ERROR', message, meta),
  debug: (message: string, meta?: unknown) => log('DEBUG', message, meta),
};

export default logger;
