import { Worker, Job } from 'bullmq';
import { redisConnection } from '../services/queue/queue.service.js';
import { QUEUE_NAMES, LECTURE_STATUS, JOB_TYPE, JOB_STATUS, SUMMARIZATION_TYPE } from '../config/constants.js';
import { createLogger } from '../utils/logger.js';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import * as geminiService from '../services/processing/gemini.service.js';
import * as lectureService from '../services/lecture/lecture.service.js';
import * as subscriptionService from '../services/subscription/subscription.service.js';
import type { SummarizationJobData, SummaryResult, CustDevSummaryResult } from '../types/index.js';
import { sendLectureNotification } from '../services/notification/notification.service.js';

const logger = createLogger('summarization-worker');

/**
 * Type guard to check if result is CustDev summary
 */
function isCustDevSummary(result: SummaryResult | CustDevSummaryResult): result is CustDevSummaryResult {
  return 'callSummary' in result;
}

/**
 * Process summarization job
 */
async function processSummarization(
  job: Job<SummarizationJobData>
): Promise<{ success: boolean; summaryId: string }> {
  const { lectureId, transcriptionId, language, summarizationType } = job.data;

  logger.info({ jobId: job.id, lectureId, transcriptionId, summarizationType }, 'Starting summarization');

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

    // Summarize using Gemini with the appropriate prompt type
    const result = await geminiService.summarizeTranscription(
      transcription.fullText,
      summarizationType || SUMMARIZATION_TYPE.LECTURE
    );

    await job.updateProgress(60);

    let summary;

    if (summarizationType === SUMMARIZATION_TYPE.CUSTDEV && isCustDevSummary(result)) {
      // Save CustDev summary to database
      const [savedSummary] = await db
        .insert(schema.summaries)
        .values({
          lectureId,
          summarizationType: SUMMARIZATION_TYPE.CUSTDEV,
          overview: result.callSummary.overview,
          custdevData: result,
          language,
          modelVersion: 'gemini-2.5-flash',
        })
        .returning();

      summary = savedSummary;

      logger.info(
        {
          jobId: job.id,
          lectureId,
          summaryId: summary?.id,
          summarizationType,
          painPointCount: result.keyPainPoints?.length || 0,
          suggestionCount: result.productSuggestions?.length || 0,
        },
        'CustDev summarization completed'
      );
    } else {
      // Save Lecture summary to database
      const lectureResult = result as SummaryResult;
      const [savedSummary] = await db
        .insert(schema.summaries)
        .values({
          lectureId,
          summarizationType: SUMMARIZATION_TYPE.LECTURE,
          overview: lectureResult.overview,
          chapters: lectureResult.chapters,
          language,
          modelVersion: 'gemini-2.5-flash',
        })
        .returning();

      summary = savedSummary;

      await job.updateProgress(80);

      // Save key points for lecture type
      if (lectureResult.keyPoints && lectureResult.keyPoints.length > 0) {
        await db.insert(schema.keyPoints).values(
          lectureResult.keyPoints.map((kp, index) => ({
            lectureId,
            pointIndex: index + 1,
            title: kp.title,
            description: kp.description,
            timestampMs: kp.timestampMs,
            importance: kp.importance,
          }))
        );
      }

      logger.info(
        {
          jobId: job.id,
          lectureId,
          summaryId: summary?.id,
          summarizationType,
          chapterCount: lectureResult.chapters?.length || 0,
          keyPointCount: lectureResult.keyPoints?.length || 0,
        },
        'Lecture summarization completed'
      );
    }

    if (!summary) {
      throw new Error('Failed to save summary');
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

    // Send notification to Telegram bot
    const lecture = await db.query.lectures.findFirst({
      where: eq(schema.lectures.id, lectureId),
      columns: { userId: true, title: true },
    });
    if (lecture) {
      await sendLectureNotification({
        lectureId,
        userId: lecture.userId,
        status: 'completed',
        title: lecture.title || undefined,
        summarizationType,
      });
    }

    await job.updateProgress(100);

    return {
      success: true,
      summaryId: summary.id,
    };
  } catch (error) {
    logger.error({ error, jobId: job.id, lectureId, summarizationType }, 'Summarization failed');

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
          'Minutes refunded for failed summarization'
        );
      } catch (refundError) {
        logger.error({ refundError, lectureId }, 'Failed to refund minutes');
      }
    }

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
      lockDuration: 600000, // 10 minutes - how long a job can run before considered stalled
      stalledInterval: 30000, // Check for stalled jobs every 30 seconds
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Summarization job completed');
  });

  worker.on('failed', async (job, error) => {
    logger.error({ jobId: job?.id, error }, 'Summarization job failed');

    // Update lecture status to failed when all retries are exhausted
    if (job?.data?.lectureId) {
      try {
        await lectureService.updateLectureStatus(
          job.data.lectureId,
          LECTURE_STATUS.FAILED,
          error instanceof Error ? error.message : 'Summarization failed after all retries'
        );

        await updateProcessingJob(job.data.lectureId, JOB_TYPE.SUMMARIZATION, {
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
    logger.error({ error }, 'Summarization worker error');
  });

  worker.on('stalled', async (jobId) => {
    logger.warn({ jobId }, 'Summarization job stalled - will be retried or marked as failed');
  });

  logger.info('Summarization worker started');

  return worker;
}
