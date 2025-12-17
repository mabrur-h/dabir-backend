import { createApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';

// ============================================
// KNOWN ERROR PATTERNS (non-fatal)
// ============================================

/**
 * Check if error is the known GCS metadata bug from @tus/gcs-store
 * This is not fatal - just means an upload can't be resumed
 */
function isKnownNonFatalError(error: Error): boolean {
  const message = error.message || '';
  const stack = error.stack || '';

  // GCS Store metadata destructuring error
  if (message.includes("Cannot destructure property 'size' of 'metadata.metadata'")) {
    return true;
  }

  // GCS Store errors from TUS library
  if (stack.includes('@tus/gcs-store') && message.includes('Cannot destructure')) {
    return true;
  }

  return false;
}

// ============================================
// GLOBAL ERROR HANDLERS
// ============================================

// Handle uncaught exceptions - log but don't crash for known non-fatal errors
process.on('uncaughtException', (error) => {
  if (isKnownNonFatalError(error)) {
    logger.warn(
      { error: error.message, stack: error.stack },
      'Known non-fatal error caught (GCS metadata issue) - continuing'
    );
    return; // Don't exit
  }

  logger.fatal(
    { error: error.message, stack: error.stack },
    'Uncaught exception - shutting down'
  );
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));

  if (isKnownNonFatalError(error)) {
    logger.warn(
      { error: error.message, stack: error.stack },
      'Known non-fatal rejection caught (GCS metadata issue) - continuing'
    );
    return;
  }

  logger.error(
    { reason: error.message, stack: error.stack },
    'Unhandled promise rejection'
  );
  // Don't exit on unhandled rejections, just log them
});

// ============================================
// SERVER STARTUP
// ============================================

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
    logger.fatal({ error, message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }, 'Failed to start server');
    process.exit(1);
  }
};

start();
