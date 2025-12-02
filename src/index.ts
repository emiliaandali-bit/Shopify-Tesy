import createServer from './server';
import { loadEnv } from './services/env';
import logger from './services/logger';

const env = loadEnv();
const app = createServer(env);

app.listen(env.PORT, () => {
  logger.info(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
});
