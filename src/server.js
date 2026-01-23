const createApp = require('./app');
const { loadEnv } = require('./services/env');
const logger = require('./services/logger');

const env = loadEnv();
const app = createApp(env);

app.listen(env.PORT, () => {
  logger.info(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
});

module.exports = app;
