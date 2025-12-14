import { createApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';

const start = async () => {
  try {
    const app = createApp();

    // Start server
    app.listen(config.server.port, () => {
      logger.info(
        {
          port: config.server.port,
          env: config.server.nodeEnv,
        },
        `🚀 Server started on port ${config.server.port}`
      );
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Received shutdown signal');

      // TODO: Close database connections
      // TODO: Close Redis connections
      // TODO: Wait for pending jobs

      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.fatal({ error }, 'Failed to start server');
    process.exit(1);
  }
};

start();
