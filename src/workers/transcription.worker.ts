import { Worker, Job } from 'bullmq';
import { redisConnection } from '../services/queue/queue.service.js';
import { QUEUE_NAMES, LECTURE_STATUS, JOB_TYPE, JOB_STATUS, SUMMARIZATION_TYPE, type SummarizationType } from '../config/constants.js';
import { createLogger } from '../utils/logger.js';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import * as geminiService from '../services/processing/gemini.service.js';
import * as lectureService from '../services/lecture/lecture.service.js';
import * as subscriptionService from '../services/subscription/subscription.service.js';
import { addSummarizationJob } from '../services/queue/queue.service.js';
import { timeStringToMs } from '../utils/time.js';
import type { TranscriptionJobData } from '../types/index.js';

const logger = createLogger('transcription-worker');

/**
 * Process transcription job
 */
async function processTranscription(
  job: Job<TranscriptionJobData>
): Promise<{ success: boolean; transcriptionId: string }> {
  const { lectureId, audioGcsUri, language } = job.data;

  logger.info({ jobId: job.id, lectureId }, 'Starting transcription');

  try {
    // Update lecture status
    await lectureService.updateLectureStatus(lectureId, LECTURE_STATUS.TRANSCRIBING);

    // Update job progress
    await job.updateProgress(10);

    // Create/update processing job record
    await updateProcessingJob(lectureId, JOB_TYPE.TRANSCRIPTION, {
      status: JOB_STATUS.ACTIVE,
      bullmqJobId: job.id,
      startedAt: new Date(),
    });

    // Transcribe audio using Gemini
    await job.updateProgress(20);
    const startTime = Date.now();
    const result = await geminiService.transcribeAudio(audioGcsUri);
    const processingTimeMs = Date.now() - startTime;

    await job.updateProgress(70);

    // Save transcription to database
    const [transcription] = await db
      .insert(schema.transcriptions)
      .values({
        lectureId,
        fullText: result.fullText,
        wordCount: result.fullText.split(/\s+/).length,
        confidenceScore: String(result.confidence),
        modelVersion: 'gemini-2.5-flash',
        processingTimeMs,
      })
      .returning();

    if (!transcription) {
      throw new Error('Failed to save transcription');
    }

    await job.updateProgress(80);

    // Save segments
    if (result.segments.length > 0) {
      await db.insert(schema.transcriptionSegments).values(
        result.segments.map((seg, index) => ({
          transcriptionId: transcription.id,
          segmentIndex: index,
          startTimeMs: timeStringToMs(seg.startTime),
          endTimeMs: timeStringToMs(seg.endTime),
          text: seg.text,
          speakerLabel: seg.speaker || null,
        }))
      );
    }

    await job.updateProgress(90);

    // Mark job as completed
    await updateProcessingJob(lectureId, JOB_TYPE.TRANSCRIPTION, {
      status: JOB_STATUS.COMPLETED,
      progress: 100,
      completedAt: new Date(),
    });

    // Get lecture to retrieve summarizationType
    const lecture = await db.query.lectures.findFirst({
      where: eq(schema.lectures.id, lectureId),
    });

    const summarizationType = (lecture?.summarizationType as SummarizationType) || SUMMARIZATION_TYPE.LECTURE;

    // Queue summarization job
    await addSummarizationJob({
      lectureId,
      transcriptionId: transcription.id,
      language,
      summarizationType,
    });

    await job.updateProgress(100);

    logger.info(
      {
        jobId: job.id,
        lectureId,
        transcriptionId: transcription.id,
        segmentCount: result.segments.length,
        processingTimeMs,
      },
      'Transcription completed'
    );

    return {
      success: true,
      transcriptionId: transcription.id,
    };
  } catch (error) {
    logger.error({ error, jobId: job.id, lectureId }, 'Transcription failed');

    // Get lecture to check if minutes were charged
    const lecture = await db.query.lectures.findFirst({
      where: eq(schema.lectures.id, lectureId),
    });

    // Refund minutes if they were charged
    if (lecture && lecture.minutesCharged > 0 && !lecture.minutesRefunded) {
      try {
        await subscriptionService.refundMinutes(lecture.userId, lectureId);
        logger.info(
          { lectureId, userId: lecture.userId, minutesRefunded: lecture.minutesCharged },
          'Minutes refunded for failed transcription'
        );
      } catch (refundError) {
        logger.error({ refundError, lectureId }, 'Failed to refund minutes');
      }
    }

    // Update lecture status to failed
    await lectureService.updateLectureStatus(
      lectureId,
      LECTURE_STATUS.FAILED,
      error instanceof Error ? error.message : 'Transcription failed'
    );

    // Update processing job
    await updateProcessingJob(lectureId, JOB_TYPE.TRANSCRIPTION, {
      status: JOB_STATUS.FAILED,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
}

/**
 * Update processing job record
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
  // Check if job exists for this type
  const existingJob = await db.query.processingJobs.findFirst({
    where: eq(schema.processingJobs.lectureId, lectureId),
  });

  // For transcription, we create a new job record
  if (existingJob && existingJob.jobType === jobType) {
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
 * Create and start the transcription worker
 */
export function createTranscriptionWorker(): Worker<TranscriptionJobData> {
  const worker = new Worker<TranscriptionJobData>(
    QUEUE_NAMES.TRANSCRIPTION,
    processTranscription,
    {
      connection: redisConnection,
      concurrency: 3, // Process 3 jobs concurrently
      limiter: {
        max: 10,
        duration: 60000, // Max 10 jobs per minute (rate limiting for Gemini)
      },
      lockDuration: 600000, // 10 minutes - how long a job can run before considered stalled
      stalledInterval: 30000, // Check for stalled jobs every 30 seconds
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Transcription job completed');
  });

  worker.on('failed', async (job, error) => {
    logger.error({ jobId: job?.id, error }, 'Transcription job failed');

    // Update lecture status to failed when all retries are exhausted
    if (job?.data?.lectureId) {
      try {
        await lectureService.updateLectureStatus(
          job.data.lectureId,
          LECTURE_STATUS.FAILED,
          error instanceof Error ? error.message : 'Transcription failed after all retries'
        );

        await updateProcessingJob(job.data.lectureId, JOB_TYPE.TRANSCRIPTION, {
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
    logger.error({ error }, 'Transcription worker error');
  });

  worker.on('stalled', async (jobId) => {
    logger.warn({ jobId }, 'Transcription job stalled - will be retried or marked as failed');
  });

  logger.info('Transcription worker started');

  return worker;
}
