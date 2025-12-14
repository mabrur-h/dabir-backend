import { createLogger } from '../utils/logger.js';
import { redisConnection, closeQueueConnections } from '../services/queue/queue.service.js';
import { closeDatabaseConnection } from '../db/index.js';
import { createAudioExtractionWorker } from './audioExtraction.worker.js';
import { createTranscriptionWorker } from './transcription.worker.js';
import { createSummarizationWorker } from './summarization.worker.js';
import { checkFfmpegAvailable } from '../services/processing/ffmpeg.service.js';
import type { Worker } from 'bullmq';

const logger = createLogger('workers');

async function startWorkers() {
  logger.info('🚀 Starting workers...');

  // Store worker references for graceful shutdown
  const workers: Worker[] = [];

  try {
    // Check FFmpeg availability
    const ffmpegAvailable = await checkFfmpegAvailable();
    if (!ffmpegAvailable) {
      logger.warn('FFmpeg not available - audio extraction may fail');
    }

    // Wait for Redis connection
    await new Promise<void>((resolve, reject) => {
      if (redisConnection.status === 'ready') {
        resolve();
        return;
      }
      redisConnection.once('ready', resolve);
      redisConnection.once('error', reject);
    });

    logger.info('✅ Redis connected');

    // Start workers
    const audioWorker = createAudioExtractionWorker();
    workers.push(audioWorker);
    logger.info('✅ Audio extraction worker started');

    const transcriptionWorker = createTranscriptionWorker();
    workers.push(transcriptionWorker);
    logger.info('✅ Transcription worker started');

    const summarizationWorker = createSummarizationWorker();
    workers.push(summarizationWorker);
    logger.info('✅ Summarization worker started');

    logger.info(`🎉 All ${workers.length} workers started successfully`);

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Received shutdown signal, stopping workers...');

      try {
        // Close all workers
        await Promise.all(
          workers.map(async (worker) => {
            await worker.close();
          })
        );

        await closeQueueConnections();
        await closeDatabaseConnection();

        logger.info('✅ Workers stopped gracefully');
        process.exit(0);
      } catch (error) {
        logger.error({ error }, 'Error during shutdown');
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Keep the process running
    process.on('uncaughtException', (error) => {
      logger.error({ error }, 'Uncaught exception');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error({ reason, promise }, 'Unhandled rejection');
    });
  } catch (error) {
    logger.fatal({ error }, 'Failed to start workers');
    process.exit(1);
  }
}

startWorkers();
