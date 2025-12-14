import { Worker, Job } from 'bullmq';
import { redisConnection } from '../services/queue/queue.service.js';
import { QUEUE_NAMES, LECTURE_STATUS, JOB_TYPE, JOB_STATUS } from '../config/constants.js';
import { createLogger } from '../utils/logger.js';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import * as ffmpegService from '../services/processing/ffmpeg.service.js';
import * as lectureService from '../services/lecture/lecture.service.js';
import { addTranscriptionJob } from '../services/queue/queue.service.js';
import type { AudioExtractionJobData } from '../types/index.js';

const logger = createLogger('audio-extraction-worker');

/**
 * Process audio extraction job
 */
async function processAudioExtraction(
  job: Job<AudioExtractionJobData>
): Promise<{ success: boolean; audioGcsUri: string; durationSeconds: number }> {
  const { lectureId, gcsUri, mimeType } = job.data;

  logger.info({ jobId: job.id, lectureId }, 'Starting audio extraction');

  try {
    // Update lecture status
    await lectureService.updateLectureStatus(lectureId, LECTURE_STATUS.EXTRACTING);

    // Update job progress
    await job.updateProgress(10);

    // Update processing job record
    await updateProcessingJob(lectureId, JOB_TYPE.AUDIO_EXTRACTION, {
      status: JOB_STATUS.ACTIVE,
      bullmqJobId: job.id,
      startedAt: new Date(),
    });

    // Extract audio
    await job.updateProgress(20);
    const result = await ffmpegService.extractAudioFromGcs(lectureId, gcsUri, mimeType);

    await job.updateProgress(80);

    // Update lecture with audio info
    await lectureService.updateLectureAudioUri(lectureId, result.audioGcsUri);
    await lectureService.updateLectureDuration(lectureId, result.durationSeconds);

    await job.updateProgress(90);

    // Mark job as completed
    await updateProcessingJob(lectureId, JOB_TYPE.AUDIO_EXTRACTION, {
      status: JOB_STATUS.COMPLETED,
      progress: 100,
      completedAt: new Date(),
    });

    // Get lecture language for transcription
    const lecture = await db.query.lectures.findFirst({
      where: eq(schema.lectures.id, lectureId),
    });

    // Queue transcription job
    await addTranscriptionJob({
      lectureId,
      audioGcsUri: result.audioGcsUri,
      language: lecture?.language || 'uz',
    });

    await job.updateProgress(100);

    logger.info(
      { jobId: job.id, lectureId, durationSeconds: result.durationSeconds },
      'Audio extraction completed'
    );

    return {
      success: true,
      audioGcsUri: result.audioGcsUri,
      durationSeconds: result.durationSeconds,
    };
  } catch (error) {
    logger.error({ error, jobId: job.id, lectureId }, 'Audio extraction failed');

    // Update lecture status to failed
    await lectureService.updateLectureStatus(
      lectureId,
      LECTURE_STATUS.FAILED,
      error instanceof Error ? error.message : 'Audio extraction failed'
    );

    // Update processing job
    await updateProcessingJob(lectureId, JOB_TYPE.AUDIO_EXTRACTION, {
      status: JOB_STATUS.FAILED,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
}

/**
 * Create or update processing job record
 */
async function updateProcessingJob(
  lectureId: string,
  jobType: string,
  updates: {
    status?: string;
    progress?: number;
    bullmqJobId?: string;
    errorMessage?: string;
    startedAt?: Date;
    completedAt?: Date;
  }
): Promise<void> {
  // Check if job exists
  const existingJob = await db.query.processingJobs.findFirst({
    where: eq(schema.processingJobs.lectureId, lectureId),
  });

  if (existingJob) {
    await db
      .update(schema.processingJobs)
      .set({
        ...updates,
        attempts: existingJob.attempts + 1,
      })
      .where(eq(schema.processingJobs.id, existingJob.id));
  } else {
    await db.insert(schema.processingJobs).values({
      lectureId,
      jobType,
      ...updates,
    });
  }
}

/**
 * Create and start the audio extraction worker
 */
export function createAudioExtractionWorker(): Worker<AudioExtractionJobData> {
  const worker = new Worker<AudioExtractionJobData>(
    QUEUE_NAMES.AUDIO_EXTRACTION,
    processAudioExtraction,
    {
      connection: redisConnection,
      concurrency: 2, // Process 2 jobs concurrently
      limiter: {
        max: 5,
        duration: 60000, // Max 5 jobs per minute
      },
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Audio extraction job completed');
  });

  worker.on('failed', (job, error) => {
    logger.error({ jobId: job?.id, error }, 'Audio extraction job failed');
  });

  worker.on('error', (error) => {
    logger.error({ error }, 'Audio extraction worker error');
  });

  logger.info('Audio extraction worker started');

  return worker;
}
