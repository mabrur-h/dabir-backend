import { Worker, Job } from 'bullmq';
import { redisConnection } from '../services/queue/queue.service.js';
import { QUEUE_NAMES, LECTURE_STATUS, JOB_TYPE, JOB_STATUS } from '../config/constants.js';
import { createLogger } from '../utils/logger.js';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import * as ffmpegService from '../services/processing/ffmpeg.service.js';
import * as lectureService from '../services/lecture/lecture.service.js';
import * as gcsService from '../services/upload/gcs.service.js';
import * as subscriptionService from '../services/subscription/subscription.service.js';
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

    // Get lecture for user ID and language
    const lecture = await db.query.lectures.findFirst({
      where: eq(schema.lectures.id, lectureId),
    });

    if (!lecture) {
      throw new Error('Lecture not found');
    }

    // Deduct minutes from user's subscription
    const minutesDeducted = await subscriptionService.deductMinutes(
      lecture.userId,
      lectureId,
      result.durationSeconds
    );

    if (!minutesDeducted) {
      // User ran out of minutes - fail the job
      logger.warn(
        { lectureId, userId: lecture.userId, durationSeconds: result.durationSeconds },
        'Insufficient minutes for processing'
      );

      await lectureService.updateLectureStatus(
        lectureId,
        LECTURE_STATUS.FAILED,
        'Insufficient minutes. Please upgrade your plan or purchase additional minutes.'
      );

      await updateProcessingJob(lectureId, JOB_TYPE.AUDIO_EXTRACTION, {
        status: JOB_STATUS.FAILED,
        errorMessage: 'Insufficient minutes for processing',
      });

      throw new Error('Insufficient minutes for processing');
    }

    logger.info(
      { lectureId, userId: lecture.userId, durationSeconds: result.durationSeconds },
      'Minutes deducted for processing'
    );

    await job.updateProgress(90);

    // Mark job as completed
    await updateProcessingJob(lectureId, JOB_TYPE.AUDIO_EXTRACTION, {
      status: JOB_STATUS.COMPLETED,
      progress: 100,
      completedAt: new Date(),
    });

    // Queue transcription job
    await addTranscriptionJob({
      lectureId,
      audioGcsUri: result.audioGcsUri,
      language: lecture.language || 'uz',
    });

    // Delete original file from GCS to save storage (keep only processed MP3)
    // For audio passthrough, the original is already copied to audio path, so we can delete
    try {
      const { path: originalPath } = gcsService.parseGcsUri(gcsUri);
      await gcsService.deleteFile(originalPath);
      logger.info({ lectureId, gcsUri }, 'Original file deleted from GCS');

      // Clear the original gcsUri in the database since file is deleted
      await lectureService.clearLectureVideoUri(lectureId);
    } catch (deleteError) {
      // Log but don't fail the job if deletion fails
      logger.warn({ deleteError, lectureId, gcsUri }, 'Failed to delete original file');
    }

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
      lockDuration: 1800000, // 30 minutes - audio extraction can take longer
      stalledInterval: 30000, // Check for stalled jobs every 30 seconds
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Audio extraction job completed');
  });

  worker.on('failed', async (job, error) => {
    logger.error({ jobId: job?.id, error }, 'Audio extraction job failed');

    // Update lecture status to failed when all retries are exhausted
    if (job?.data?.lectureId) {
      try {
        await lectureService.updateLectureStatus(
          job.data.lectureId,
          LECTURE_STATUS.FAILED,
          error instanceof Error ? error.message : 'Audio extraction failed after all retries'
        );

        await updateProcessingJob(job.data.lectureId, JOB_TYPE.AUDIO_EXTRACTION, {
          status: JOB_STATUS.FAILED,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });

        logger.info({ jobId: job.id, lectureId: job.data.lectureId }, 'Updated lecture status to failed');
      } catch (updateError) {
        logger.error({ updateError, jobId: job.id }, 'Failed to update lecture status after job failure');
      }
    }
  });

  worker.on('error', (error) => {
    logger.error({ error }, 'Audio extraction worker error');
  });

  worker.on('stalled', async (jobId) => {
    logger.warn({ jobId }, 'Audio extraction job stalled - will be retried or marked as failed');
  });

  logger.info('Audio extraction worker started');

  return worker;
}
