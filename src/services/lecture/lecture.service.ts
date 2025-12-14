import { eq, and, desc, sql, ilike } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { createLogger } from '../../utils/logger.js';
import { NotFoundError, ForbiddenError } from '../../utils/errors.js';
import { LECTURE_STATUS, type LectureStatus } from '../../config/constants.js';
import { msToTimeString } from '../../utils/time.js';
import type { PaginationParams, PaginatedResponse } from '../../types/index.js';

const logger = createLogger('lecture-service');

// ============================================
// TYPES
// ============================================

export interface CreateLectureInput {
  userId: string;
  title?: string;
  originalFilename: string;
  gcsUri: string;
  fileSizeBytes: number;
  mimeType: string;
  language?: string;
}

export interface UpdateLectureInput {
  title?: string;
  language?: string;
}

export interface LectureResponse {
  id: string;
  title: string | null;
  originalFilename: string;
  fileSizeBytes: number;
  mimeType: string;
  durationSeconds: number | null;
  durationFormatted: string | null;
  status: LectureStatus;
  language: string;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LectureDetailResponse extends LectureResponse {
  transcription?: {
    id: string;
    fullText: string;
    wordCount: number | null;
    segments: Array<{
      index: number;
      startTimeMs: number;
      endTimeMs: number;
      startTimeFormatted: string;
      endTimeFormatted: string;
      text: string;
      speaker: string | null;
    }>;
  } | null;
  summary?: {
    id: string;
    overview: string;
    chapters: Array<{
      index: number;
      title: string;
      summary: string;
      startTimeMs: number;
      endTimeMs: number;
      startTimeFormatted: string;
      endTimeFormatted: string;
    }> | null;
  } | null;
  keyPoints?: Array<{
    id: string;
    index: number;
    title: string;
    description: string | null;
    timestampMs: number | null;
    timestampFormatted: string | null;
    importance: number | null;
  }>;
}

export interface LectureStatusResponse {
  lectureId: string;
  status: LectureStatus;
  progress: number;
  jobs: Array<{
    type: string;
    status: string;
    progress: number;
    error: string | null;
  }>;
}

// ============================================
// HELPERS
// ============================================

function formatLecture(lecture: typeof schema.lectures.$inferSelect): LectureResponse {
  return {
    id: lecture.id,
    title: lecture.title,
    originalFilename: lecture.originalFilename,
    fileSizeBytes: lecture.fileSizeBytes,
    mimeType: lecture.mimeType,
    durationSeconds: lecture.durationSeconds,
    durationFormatted: lecture.durationSeconds
      ? msToTimeString(lecture.durationSeconds * 1000)
      : null,
    status: lecture.status as LectureStatus,
    language: lecture.language,
    errorMessage: lecture.errorMessage,
    createdAt: lecture.createdAt,
    updatedAt: lecture.updatedAt,
  };
}

function calculateOverallProgress(jobs: Array<{ status: string; progress: number }>): number {
  if (jobs.length === 0) return 0;

  const totalProgress = jobs.reduce((sum, job) => {
    if (job.status === 'completed') return sum + 100;
    if (job.status === 'failed') return sum + 0;
    return sum + job.progress;
  }, 0);

  return Math.round(totalProgress / jobs.length);
}

// ============================================
// CRUD OPERATIONS
// ============================================

/**
 * Create a new lecture record
 */
export async function createLecture(input: CreateLectureInput): Promise<LectureResponse> {
  const [lecture] = await db
    .insert(schema.lectures)
    .values({
      userId: input.userId,
      title: input.title || null,
      originalFilename: input.originalFilename,
      gcsUri: input.gcsUri,
      fileSizeBytes: input.fileSizeBytes,
      mimeType: input.mimeType,
      language: input.language || 'uz',
      status: LECTURE_STATUS.UPLOADED,
    })
    .returning();

  if (!lecture) {
    throw new Error('Failed to create lecture');
  }

  logger.info({ lectureId: lecture.id, userId: input.userId }, 'Lecture created');

  return formatLecture(lecture);
}

/**
 * Get a lecture by ID (with ownership check)
 */
export async function getLectureById(
  lectureId: string,
  userId: string
): Promise<LectureResponse> {
  const lecture = await db.query.lectures.findFirst({
    where: eq(schema.lectures.id, lectureId),
  });

  if (!lecture) {
    throw new NotFoundError('Lecture not found', 'LECTURE_NOT_FOUND');
  }

  if (lecture.userId !== userId) {
    throw new ForbiddenError('Access denied', 'ACCESS_DENIED');
  }

  return formatLecture(lecture);
}

/**
 * Get lecture with full details (transcription, summary, key points)
 */
export async function getLectureDetails(
  lectureId: string,
  userId: string
): Promise<LectureDetailResponse> {
  const lecture = await db.query.lectures.findFirst({
    where: eq(schema.lectures.id, lectureId),
  });

  if (!lecture) {
    throw new NotFoundError('Lecture not found', 'LECTURE_NOT_FOUND');
  }

  if (lecture.userId !== userId) {
    throw new ForbiddenError('Access denied', 'ACCESS_DENIED');
  }

  // Get transcription with segments
  const transcription = await db.query.transcriptions.findFirst({
    where: eq(schema.transcriptions.lectureId, lectureId),
  });

  let segments: LectureDetailResponse['transcription'] extends { segments: infer S } | null | undefined ? S : never = [];
  if (transcription) {
    const rawSegments = await db.query.transcriptionSegments.findMany({
      where: eq(schema.transcriptionSegments.transcriptionId, transcription.id),
      orderBy: [schema.transcriptionSegments.segmentIndex],
    });

    segments = rawSegments.map((s) => ({
      index: s.segmentIndex,
      startTimeMs: s.startTimeMs,
      endTimeMs: s.endTimeMs,
      startTimeFormatted: msToTimeString(s.startTimeMs),
      endTimeFormatted: msToTimeString(s.endTimeMs),
      text: s.text,
      speaker: s.speakerLabel,
    }));
  }

  // Get summary
  const summary = await db.query.summaries.findFirst({
    where: eq(schema.summaries.lectureId, lectureId),
  });

  // Get key points
  const rawKeyPoints = await db.query.keyPoints.findMany({
    where: eq(schema.keyPoints.lectureId, lectureId),
    orderBy: [schema.keyPoints.pointIndex],
  });

  const keyPoints = rawKeyPoints.map((kp) => ({
    id: kp.id,
    index: kp.pointIndex,
    title: kp.title,
    description: kp.description,
    timestampMs: kp.timestampMs,
    timestampFormatted: kp.timestampMs ? msToTimeString(kp.timestampMs) : null,
    importance: kp.importance,
  }));

  return {
    ...formatLecture(lecture),
    transcription: transcription
      ? {
          id: transcription.id,
          fullText: transcription.fullText,
          wordCount: transcription.wordCount,
          segments,
        }
      : null,
    summary: summary
      ? {
          id: summary.id,
          overview: summary.overview,
          chapters: summary.chapters?.map((ch, idx) => ({
            index: ch.index ?? idx + 1,
            title: ch.title,
            summary: ch.summary,
            startTimeMs: ch.startTimeMs,
            endTimeMs: ch.endTimeMs,
            startTimeFormatted: msToTimeString(ch.startTimeMs),
            endTimeFormatted: msToTimeString(ch.endTimeMs),
          })) ?? null,
        }
      : null,
    keyPoints,
  };
}

/**
 * List user's lectures with pagination
 */
export async function listLectures(
  userId: string,
  pagination: PaginationParams,
  filters?: {
    status?: LectureStatus;
    search?: string;
  }
): Promise<PaginatedResponse<LectureResponse>> {
  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  // Build where conditions
  const conditions = [eq(schema.lectures.userId, userId)];

  if (filters?.status) {
    conditions.push(eq(schema.lectures.status, filters.status));
  }

  if (filters?.search) {
    conditions.push(
      sql`(${ilike(schema.lectures.title, `%${filters.search}%`)} OR ${ilike(schema.lectures.originalFilename, `%${filters.search}%`)})`
    );
  }

  // Get total count
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.lectures)
    .where(and(...conditions));

  const total = countResult?.count ?? 0;

  // Get lectures
  const lectures = await db.query.lectures.findMany({
    where: and(...conditions),
    orderBy: [desc(schema.lectures.createdAt)],
    limit,
    offset,
  });

  const totalPages = Math.ceil(total / limit);

  return {
    data: lectures.map(formatLecture),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * Update a lecture
 */
export async function updateLecture(
  lectureId: string,
  userId: string,
  input: UpdateLectureInput
): Promise<LectureResponse> {
  // Check ownership
  const existing = await db.query.lectures.findFirst({
    where: eq(schema.lectures.id, lectureId),
  });

  if (!existing) {
    throw new NotFoundError('Lecture not found', 'LECTURE_NOT_FOUND');
  }

  if (existing.userId !== userId) {
    throw new ForbiddenError('Access denied', 'ACCESS_DENIED');
  }

  // Update
  const [updated] = await db
    .update(schema.lectures)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(schema.lectures.id, lectureId))
    .returning();

  if (!updated) {
    throw new Error('Failed to update lecture');
  }

  logger.info({ lectureId }, 'Lecture updated');

  return formatLecture(updated);
}

/**
 * Delete a lecture and all related data
 */
export async function deleteLecture(lectureId: string, userId: string): Promise<void> {
  // Check ownership
  const existing = await db.query.lectures.findFirst({
    where: eq(schema.lectures.id, lectureId),
  });

  if (!existing) {
    throw new NotFoundError('Lecture not found', 'LECTURE_NOT_FOUND');
  }

  if (existing.userId !== userId) {
    throw new ForbiddenError('Access denied', 'ACCESS_DENIED');
  }

  // Delete (cascade will handle related records)
  await db.delete(schema.lectures).where(eq(schema.lectures.id, lectureId));

  logger.info({ lectureId, userId }, 'Lecture deleted');

  // TODO: Delete files from GCS
}

/**
 * Get lecture processing status
 */
export async function getLectureStatus(
  lectureId: string,
  userId: string
): Promise<LectureStatusResponse> {
  // Check ownership
  const lecture = await db.query.lectures.findFirst({
    where: eq(schema.lectures.id, lectureId),
  });

  if (!lecture) {
    throw new NotFoundError('Lecture not found', 'LECTURE_NOT_FOUND');
  }

  if (lecture.userId !== userId) {
    throw new ForbiddenError('Access denied', 'ACCESS_DENIED');
  }

  // Get processing jobs
  const jobs = await db.query.processingJobs.findMany({
    where: eq(schema.processingJobs.lectureId, lectureId),
    orderBy: [schema.processingJobs.createdAt],
  });

  const jobsResponse = jobs.map((job) => ({
    type: job.jobType,
    status: job.status,
    progress: job.progress,
    error: job.errorMessage,
  }));

  return {
    lectureId,
    status: lecture.status as LectureStatus,
    progress: calculateOverallProgress(jobsResponse),
    jobs: jobsResponse,
  };
}

/**
 * Update lecture status (internal use)
 */
export async function updateLectureStatus(
  lectureId: string,
  status: LectureStatus,
  errorMessage?: string
): Promise<void> {
  await db
    .update(schema.lectures)
    .set({
      status,
      errorMessage: errorMessage ?? null,
      updatedAt: new Date(),
    })
    .where(eq(schema.lectures.id, lectureId));

  logger.info({ lectureId, status }, 'Lecture status updated');
}

/**
 * Update lecture duration (after audio extraction)
 */
export async function updateLectureDuration(
  lectureId: string,
  durationSeconds: number
): Promise<void> {
  await db
    .update(schema.lectures)
    .set({
      durationSeconds,
      updatedAt: new Date(),
    })
    .where(eq(schema.lectures.id, lectureId));
}

/**
 * Update lecture audio URI (after audio extraction)
 */
export async function updateLectureAudioUri(
  lectureId: string,
  audioGcsUri: string
): Promise<void> {
  await db
    .update(schema.lectures)
    .set({
      audioGcsUri,
      updatedAt: new Date(),
    })
    .where(eq(schema.lectures.id, lectureId));
}
