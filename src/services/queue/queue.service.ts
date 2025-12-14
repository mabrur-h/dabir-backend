import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../../config/index.js';
import { QUEUE_NAMES } from '../../config/constants.js';
import { createLogger } from '../../utils/logger.js';
import type {
  AudioExtractionJobData,
  TranscriptionJobData,
  SummarizationJobData,
} from '../../types/index.js';

const logger = createLogger('queue');

// Redis connection
export const redisConnection = new IORedis(config.redis.url, {
  maxRetriesPerRequest: null,
});

redisConnection.on('connect', () => {
  logger.info('Connected to Redis');
});

redisConnection.on('error', (err) => {
  logger.error({ err }, 'Redis connection error');
});

// Queue instances
export const audioExtractionQueue = new Queue<AudioExtractionJobData>(
  QUEUE_NAMES.AUDIO_EXTRACTION,
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 30000,
      },
      removeOnComplete: {
        age: 86400, // 24 hours
        count: 1000,
      },
      removeOnFail: {
        age: 604800, // 7 days
      },
    },
  }
);

export const transcriptionQueue = new Queue<TranscriptionJobData>(QUEUE_NAMES.TRANSCRIPTION, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 60000,
    },
    removeOnComplete: {
      age: 86400,
      count: 1000,
    },
    removeOnFail: {
      age: 604800,
    },
  },
});

export const summarizationQueue = new Queue<SummarizationJobData>(QUEUE_NAMES.SUMMARIZATION, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 30000,
    },
    removeOnComplete: {
      age: 86400,
      count: 1000,
    },
    removeOnFail: {
      age: 604800,
    },
  },
});

// Queue events for monitoring
export const audioExtractionEvents = new QueueEvents(QUEUE_NAMES.AUDIO_EXTRACTION, {
  connection: redisConnection,
});

export const transcriptionEvents = new QueueEvents(QUEUE_NAMES.TRANSCRIPTION, {
  connection: redisConnection,
});

export const summarizationEvents = new QueueEvents(QUEUE_NAMES.SUMMARIZATION, {
  connection: redisConnection,
});

// Helper functions to add jobs
export async function addAudioExtractionJob(data: AudioExtractionJobData) {
  const job = await audioExtractionQueue.add('extract-audio', data, {
    jobId: `audio-${data.lectureId}`,
  });
  logger.info({ jobId: job.id, lectureId: data.lectureId }, 'Added audio extraction job');
  return job;
}

export async function addTranscriptionJob(data: TranscriptionJobData) {
  const job = await transcriptionQueue.add('transcribe', data, {
    jobId: `transcription-${data.lectureId}`,
  });
  logger.info({ jobId: job.id, lectureId: data.lectureId }, 'Added transcription job');
  return job;
}

export async function addSummarizationJob(data: SummarizationJobData) {
  const job = await summarizationQueue.add('summarize', data, {
    jobId: `summary-${data.lectureId}`,
  });
  logger.info({ jobId: job.id, lectureId: data.lectureId }, 'Added summarization job');
  return job;
}

// Health check
export async function checkRedisHealth(): Promise<boolean> {
  try {
    await redisConnection.ping();
    return true;
  } catch (error) {
    logger.error({ error }, 'Redis health check failed');
    return false;
  }
}

// Graceful shutdown
export async function closeQueueConnections(): Promise<void> {
  logger.info('Closing queue connections');
  await audioExtractionQueue.close();
  await transcriptionQueue.close();
  await summarizationQueue.close();
  await audioExtractionEvents.close();
  await transcriptionEvents.close();
  await summarizationEvents.close();
  await redisConnection.quit();
}
