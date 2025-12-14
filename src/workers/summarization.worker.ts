import { Worker, Job } from 'bullmq';
import { redisConnection } from '../services/queue/queue.service.js';
import { QUEUE_NAMES, LECTURE_STATUS, JOB_TYPE, JOB_STATUS } from '../config/constants.js';
import { createLogger } from '../utils/logger.js';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import * as geminiService from '../services/processing/gemini.service.js';
import * as lectureService from '../services/lecture/lecture.service.js';
import type { SummarizationJobData } from '../types/index.js';

const logger = createLogger('summarization-worker');

/**
 * Process summarization job
 */
async function processSummarization(
  job: Job<SummarizationJobData>
): Promise<{ success: boolean; summaryId: string }> {
  const { lectureId, transcriptionId, language } = job.data;

  logger.info({ jobId: job.id, lectureId, transcriptionId }, 'Starting summarization');

  try {
    // Update lecture status
    await lectureService.updateLectureStatus(lectureId, LECTURE_STATUS.SUMMARIZING);

    // Update job progress
    await job.updateProgress(10);

    // Create/update processing job record
    await updateProcessingJob(lectureId, JOB_TYPE.SUMMARIZATION, {
      status: JOB_STATUS.ACTIVE,
      bullmqJobId: job.id,
      startedAt: new Date(),
    });

    // Get transcription
    const transcription = await db.query.transcriptions.findFirst({
      where: eq(schema.transcriptions.id, transcriptionId),
    });

    if (!transcription) {
      throw new Error('Transcription not found');
    }

    await job.updateProgress(20);

    // Summarize using Gemini
    const result = await geminiService.summarizeTranscription(transcription.fullText, language);

    await job.updateProgress(60);

    // Save summary to database
    const [summary] = await db
      .insert(schema.summaries)
      .values({
        lectureId,
        overview: result.overview,
        chapters: result.chapters,
        language,
        modelVersion: 'gemini-2.5-flash',
      })
      .returning();

    if (!summary) {
      throw new Error('Failed to save summary');
    }

    await job.updateProgress(80);

    // Save key points
    if (result.keyPoints.length > 0) {
      await db.insert(schema.keyPoints).values(
        result.keyPoints.map((kp, index) => ({
          lectureId,
          pointIndex: index + 1,
          title: kp.title,
          description: kp.description,
          timestampMs: kp.timestampMs,
          importance: kp.importance,
        }))
      );
    }

    await job.updateProgress(90);

    // Mark job as completed
    await updateProcessingJob(lectureId, JOB_TYPE.SUMMARIZATION, {
      status: JOB_STATUS.COMPLETED,
      progress: 100,
      completedAt: new Date(),
    });

    // Update lecture status to completed
    await lectureService.updateLectureStatus(lectureId, LECTURE_STATUS.COMPLETED);

    await job.updateProgress(100);

    logger.info(
      {
        jobId: job.id,
        lectureId,
        summaryId: summary.id,
        chapterCount: result.chapters.length,
        keyPointCount: result.keyPoints.length,
      },
      'Summarization completed'
    );

    return {
      success: true,
      summaryId: summary.id,
    };
  } catch (error) {
    logger.error({ error, jobId: job.id, lectureId }, 'Summarization failed');

    // Update lecture status to failed
    await lectureService.updateLectureStatus(
      lectureId,
      LECTURE_STATUS.FAILED,
      error instanceof Error ? error.message : 'Summarization failed'
    );

    // Update processing job
    await updateProcessingJob(lectureId, JOB_TYPE.SUMMARIZATION, {
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
 * Create and start the summarization worker
 */
export function createSummarizationWorker(): Worker<SummarizationJobData> {
  const worker = new Worker<SummarizationJobData>(
    QUEUE_NAMES.SUMMARIZATION,
    processSummarization,
    {
      connection: redisConnection,
      concurrency: 3, // Process 3 jobs concurrently
      limiter: {
        max: 10,
        duration: 60000, // Max 10 jobs per minute
      },
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Summarization job completed');
  });

  worker.on('failed', (job, error) => {
    logger.error({ jobId: job?.id, error }, 'Summarization job failed');
  });

  worker.on('error', (error) => {
    logger.error({ error }, 'Summarization worker error');
  });

  logger.info('Summarization worker started');

  return worker;
}
