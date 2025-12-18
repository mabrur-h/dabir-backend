import { eq, and, desc, sql, ilike } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { createLogger } from '../../utils/logger.js';
import { NotFoundError, ForbiddenError } from '../../utils/errors.js';
import { LECTURE_STATUS, SUMMARIZATION_TYPE, type LectureStatus, type SummarizationType } from '../../config/constants.js';
import { msToTimeString } from '../../utils/time.js';
import * as gcsService from '../upload/gcs.service.js';
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
  summarizationType?: SummarizationType;
  contentHash?: string;
}

export interface UpdateLectureInput {
  title?: string;
  language?: string;
  folderId?: string | null;
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
  summarizationType: SummarizationType;
  errorMessage: string | null;
  folderId: string | null;
  tags: TagInfo[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TagInfo {
  id: string;
  name: string;
  color: string | null;
}

export interface LectureDetailResponse extends LectureResponse {
  audioUrl?: string | null;
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
    summarizationType: SummarizationType;
    overview: string;
    // Lecture type fields
    chapters: Array<{
      index: number;
      title: string;
      summary: string;
      startTimeMs: number;
      endTimeMs: number;
      startTimeFormatted: string;
      endTimeFormatted: string;
    }> | null;
    // CustDev type fields
    custdevData?: {
      callSummary: {
        title: string;
        overview: string;
        customerMood: string;
      };
      keyPainPoints: Array<{
        painPoint: string;
        impact: string;
        timestampMs: number;
      }>;
      positiveFeedback: Array<{
        feature: string;
        benefit: string;
        timestampMs: number;
      }>;
      productSuggestions: Array<{
        type: string;
        priority: string;
        description: string;
        relatedPainPoint: string;
      }>;
      internalActionItems: Array<{
        owner: string;
        action: string;
        timestampMs: number;
      }>;
      mindMap?: {
        centralNode: {
          label: string;
          description: string;
        };
        branches: {
          customerProfile: {
            label: string;
            items: Array<{ key: string; value: string }>;
          };
          needsAndGoals: {
            label: string;
            items: Array<{ goal: string; priority: string }>;
          };
          painPoints: {
            label: string;
            items: Array<{ pain: string; severity: string; emotion: string }>;
          };
          journeyStage: {
            label: string;
            currentStage: string;
            touchpoints: string[];
          };
          opportunities: {
            label: string;
            items: Array<{ opportunity: string; effort: string; impact: string }>;
          };
          keyInsights: {
            label: string;
            patterns: string[];
            quotes: Array<{ text: string; context: string }>;
          };
          actionItems: {
            label: string;
            items: Array<{ action: string; owner: string; priority: string }>;
          };
        };
        connections: Array<{ from: string; to: string; reason: string }>;
      };
    } | null;
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

// Lightweight status response for polling
export interface LectureStatusLightResponse {
  id: string;
  status: LectureStatus;
  progress: number;
  errorMessage: string | null;
}

// Batch status response
export interface BatchStatusResponse {
  statuses: Record<string, LectureStatusLightResponse>;
}

// Transcription with pagination
export interface TranscriptionResponse {
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
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Summary-only response
export interface SummaryResponse {
  id: string;
  summarizationType: SummarizationType;
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
}

// KeyPoints-only response
export interface KeyPointsResponse {
  keyPoints: Array<{
    id: string;
    index: number;
    title: string;
    description: string | null;
    timestampMs: number | null;
    timestampFormatted: string | null;
    importance: number | null;
  }>;
}

// CustDev response types
export interface CustDevMindMapResponse {
  mindMap: LectureDetailResponse['summary'] extends { custdevData?: infer C } | null | undefined
    ? C extends { mindMap?: infer M } | null | undefined
      ? M
      : never
    : never;
}

export interface CustDevPainPointsResponse {
  keyPainPoints: Array<{
    painPoint: string;
    impact: string;
    timestampMs: number;
  }>;
}

export interface CustDevSuggestionsResponse {
  productSuggestions: Array<{
    type: string;
    priority: string;
    description: string;
    relatedPainPoint: string;
  }>;
}

export interface CustDevActionsResponse {
  internalActionItems: Array<{
    owner: string;
    action: string;
    timestampMs: number;
  }>;
}

export interface CustDevFullResponse {
  callSummary: {
    title: string;
    overview: string;
    customerMood: string;
  } | null;
  keyPainPoints: Array<{
    painPoint: string;
    impact: string;
    timestampMs: number;
  }>;
  positiveFeedback: Array<{
    feature: string;
    benefit: string;
    timestampMs: number;
  }>;
  productSuggestions: Array<{
    type: string;
    priority: string;
    description: string;
    relatedPainPoint: string;
  }>;
  internalActionItems: Array<{
    owner: string;
    action: string;
    timestampMs: number;
  }>;
  mindMap: CustDevMindMapResponse['mindMap'] | null;
}

// User statistics response
export interface UserStatsResponse {
  total: number;
  completed: number;
  processing: number;
  failed: number;
}

// Minimal lecture response for list
export interface LectureMinimalResponse {
  id: string;
  title: string | null;
  originalFilename: string;
  status: LectureStatus;
  summarizationType: SummarizationType;
  durationFormatted: string | null;
  fileSizeBytes: number;
  folderId: string | null;
  tags: TagInfo[];
  createdAt: Date;
  language: string;
}

// ============================================
// HELPERS
// ============================================

function formatLecture(lecture: typeof schema.lectures.$inferSelect, tags: TagInfo[] = []): LectureResponse {
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
    summarizationType: lecture.summarizationType as SummarizationType,
    errorMessage: lecture.errorMessage,
    folderId: lecture.folderId,
    tags,
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

/**
 * Fetch tags for multiple lectures in a single query
 */
async function fetchTagsForLectures(lectureIds: string[]): Promise<Record<string, TagInfo[]>> {
  if (lectureIds.length === 0) {
    return {};
  }

  const lectureTags = await db.query.lectureTags.findMany({
    where: sql`${schema.lectureTags.lectureId} IN (${sql.join(lectureIds.map(id => sql`${id}`), sql`, `)})`,
    with: {
      tag: true,
    },
  });

  // Group tags by lecture ID
  const tagsByLectureId: Record<string, TagInfo[]> = {};
  for (const lt of lectureTags) {
    const lectureId = lt.lectureId;
    if (!tagsByLectureId[lectureId]) {
      tagsByLectureId[lectureId] = [];
    }
    tagsByLectureId[lectureId].push({
      id: lt.tag.id,
      name: lt.tag.name,
      color: lt.tag.color,
    });
  }

  return tagsByLectureId;
}

// ============================================
// CRUD OPERATIONS
// ============================================

/**
 * Find an existing lecture by content hash for deduplication
 * Only returns lectures that are successfully COMPLETED - this ensures we don't
 * return stuck/failed lectures and allows users to re-upload if processing failed.
 */
export async function findLectureByContentHash(
  userId: string,
  contentHash: string
): Promise<LectureResponse | null> {
  const lecture = await db.query.lectures.findFirst({
    where: and(
      eq(schema.lectures.userId, userId),
      eq(schema.lectures.contentHash, contentHash),
      // Only match COMPLETED lectures - this allows re-upload if:
      // - Original upload failed to process
      // - Original got stuck in 'uploaded' or 'processing' state
      // - Original was marked as 'failed'
      eq(schema.lectures.status, LECTURE_STATUS.COMPLETED)
    ),
    orderBy: [desc(schema.lectures.createdAt)],
  });

  if (!lecture) {
    return null;
  }

  logger.info(
    { lectureId: lecture.id, userId, contentHash, status: lecture.status },
    'Found existing completed lecture with same content hash'
  );

  return formatLecture(lecture);
}

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
      summarizationType: input.summarizationType || SUMMARIZATION_TYPE.LECTURE,
      status: LECTURE_STATUS.UPLOADED,
      contentHash: input.contentHash || null,
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

  // Generate signed URL for audio file if available
  let audioUrl: string | null = null;
  if (lecture.audioGcsUri) {
    try {
      const { path: audioPath } = gcsService.parseGcsUri(lecture.audioGcsUri);
      // Generate a signed URL valid for 60 minutes
      audioUrl = await gcsService.getSignedDownloadUrl(audioPath, 60);
    } catch (error) {
      logger.warn({ error, lectureId }, 'Failed to generate audio signed URL');
    }
  }

  return {
    ...formatLecture(lecture),
    audioUrl,
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
          summarizationType: summary.summarizationType as SummarizationType,
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
          custdevData: summary.custdevData ?? null,
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

  // Fetch tags for all lectures in a single query
  const lectureIds = lectures.map(l => l.id);
  const tagsByLectureId = await fetchTagsForLectures(lectureIds);

  return {
    data: lectures.map(lecture => formatLecture(lecture, tagsByLectureId[lecture.id] || [])),
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

  // If folderId is provided, verify it belongs to the user
  if (input.folderId !== undefined && input.folderId !== null) {
    const folder = await db.query.folders.findFirst({
      where: and(
        eq(schema.folders.id, input.folderId),
        eq(schema.folders.userId, userId)
      ),
    });

    if (!folder) {
      throw new NotFoundError('Folder not found', 'FOLDER_NOT_FOUND');
    }
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

/**
 * Clear lecture video URI (after original video is deleted)
 */
export async function clearLectureVideoUri(lectureId: string): Promise<void> {
  await db
    .update(schema.lectures)
    .set({
      gcsUri: '', // Clear the original video URI
      updatedAt: new Date(),
    })
    .where(eq(schema.lectures.id, lectureId));
}

// ============================================
// OPTIMIZED ENDPOINTS
// ============================================

/**
 * Get lightweight lecture status (for polling)
 */
export async function getLectureStatusLight(
  lectureId: string,
  userId: string
): Promise<LectureStatusLightResponse> {
  const lecture = await db.query.lectures.findFirst({
    where: eq(schema.lectures.id, lectureId),
    columns: {
      id: true,
      userId: true,
      status: true,
      errorMessage: true,
    },
  });

  if (!lecture) {
    throw new NotFoundError('Lecture not found', 'LECTURE_NOT_FOUND');
  }

  if (lecture.userId !== userId) {
    throw new ForbiddenError('Access denied', 'ACCESS_DENIED');
  }

  // Get overall progress from jobs
  const jobs = await db.query.processingJobs.findMany({
    where: eq(schema.processingJobs.lectureId, lectureId),
    columns: {
      status: true,
      progress: true,
    },
  });

  const progress = calculateOverallProgress(jobs);

  return {
    id: lecture.id,
    status: lecture.status as LectureStatus,
    progress,
    errorMessage: lecture.errorMessage,
  };
}

/**
 * Get batch status for multiple lectures (for polling multiple)
 */
export async function getBatchLectureStatus(
  lectureIds: string[],
  userId: string
): Promise<BatchStatusResponse> {
  if (lectureIds.length === 0) {
    return { statuses: {} };
  }

  // Get lectures that belong to this user
  const lectures = await db.query.lectures.findMany({
    where: and(
      sql`${schema.lectures.id} IN (${sql.join(lectureIds.map(id => sql`${id}`), sql`, `)})`,
      eq(schema.lectures.userId, userId)
    ),
    columns: {
      id: true,
      status: true,
      errorMessage: true,
    },
  });

  // Get all processing jobs for these lectures
  const lectureIdsFound = lectures.map(l => l.id);
  const jobs = lectureIdsFound.length > 0
    ? await db.query.processingJobs.findMany({
        where: sql`${schema.processingJobs.lectureId} IN (${sql.join(lectureIdsFound.map(id => sql`${id}`), sql`, `)})`,
        columns: {
          lectureId: true,
          status: true,
          progress: true,
        },
      })
    : [];

  // Group jobs by lecture ID
  const jobsByLecture = jobs.reduce<Record<string, typeof jobs>>((acc, job) => {
    const existing = acc[job.lectureId];
    if (existing) {
      existing.push(job);
    } else {
      acc[job.lectureId] = [job];
    }
    return acc;
  }, {});

  // Build response
  const statuses: Record<string, LectureStatusLightResponse> = {};
  for (const lecture of lectures) {
    const lectureJobs = jobsByLecture[lecture.id] || [];
    statuses[lecture.id] = {
      id: lecture.id,
      status: lecture.status as LectureStatus,
      progress: calculateOverallProgress(lectureJobs),
      errorMessage: lecture.errorMessage,
    };
  }

  return { statuses };
}

/**
 * Get transcription with pagination
 */
export async function getTranscriptionPaginated(
  lectureId: string,
  userId: string,
  pagination?: { page: number; limit: number }
): Promise<TranscriptionResponse | null> {
  // Check ownership
  const lecture = await db.query.lectures.findFirst({
    where: eq(schema.lectures.id, lectureId),
    columns: { id: true, userId: true },
  });

  if (!lecture) {
    throw new NotFoundError('Lecture not found', 'LECTURE_NOT_FOUND');
  }

  if (lecture.userId !== userId) {
    throw new ForbiddenError('Access denied', 'ACCESS_DENIED');
  }

  // Get transcription
  const transcription = await db.query.transcriptions.findFirst({
    where: eq(schema.transcriptions.lectureId, lectureId),
  });

  if (!transcription) {
    return null;
  }

  // Get segments count
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.transcriptionSegments)
    .where(eq(schema.transcriptionSegments.transcriptionId, transcription.id));

  const totalSegments = countResult?.count ?? 0;

  // Get segments with pagination
  let segments;
  let paginationResponse;

  if (pagination) {
    const { page, limit } = pagination;
    const offset = (page - 1) * limit;
    const totalPages = Math.ceil(totalSegments / limit);

    const rawSegments = await db.query.transcriptionSegments.findMany({
      where: eq(schema.transcriptionSegments.transcriptionId, transcription.id),
      orderBy: [schema.transcriptionSegments.segmentIndex],
      limit,
      offset,
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

    paginationResponse = {
      page,
      limit,
      total: totalSegments,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  } else {
    // Return all segments without pagination
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

  return {
    fullText: transcription.fullText,
    wordCount: transcription.wordCount,
    segments,
    pagination: paginationResponse,
  };
}

/**
 * Get summary only (without keypoints)
 */
export async function getSummaryOnly(
  lectureId: string,
  userId: string
): Promise<SummaryResponse | null> {
  // Check ownership
  const lecture = await db.query.lectures.findFirst({
    where: eq(schema.lectures.id, lectureId),
    columns: { id: true, userId: true },
  });

  if (!lecture) {
    throw new NotFoundError('Lecture not found', 'LECTURE_NOT_FOUND');
  }

  if (lecture.userId !== userId) {
    throw new ForbiddenError('Access denied', 'ACCESS_DENIED');
  }

  // Get summary
  const summary = await db.query.summaries.findFirst({
    where: eq(schema.summaries.lectureId, lectureId),
  });

  if (!summary) {
    return null;
  }

  return {
    id: summary.id,
    summarizationType: summary.summarizationType as SummarizationType,
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
  };
}

/**
 * Get keypoints only
 */
export async function getKeyPointsOnly(
  lectureId: string,
  userId: string
): Promise<KeyPointsResponse | null> {
  // Check ownership
  const lecture = await db.query.lectures.findFirst({
    where: eq(schema.lectures.id, lectureId),
    columns: { id: true, userId: true },
  });

  if (!lecture) {
    throw new NotFoundError('Lecture not found', 'LECTURE_NOT_FOUND');
  }

  if (lecture.userId !== userId) {
    throw new ForbiddenError('Access denied', 'ACCESS_DENIED');
  }

  // Get key points
  const rawKeyPoints = await db.query.keyPoints.findMany({
    where: eq(schema.keyPoints.lectureId, lectureId),
    orderBy: [schema.keyPoints.pointIndex],
  });

  if (rawKeyPoints.length === 0) {
    return null;
  }

  return {
    keyPoints: rawKeyPoints.map((kp) => ({
      id: kp.id,
      index: kp.pointIndex,
      title: kp.title,
      description: kp.description,
      timestampMs: kp.timestampMs,
      timestampFormatted: kp.timestampMs ? msToTimeString(kp.timestampMs) : null,
      importance: kp.importance,
    })),
  };
}

/**
 * Get CustDev data
 */
export async function getCustDevData(
  lectureId: string,
  userId: string
): Promise<CustDevFullResponse | null> {
  // Check ownership
  const lecture = await db.query.lectures.findFirst({
    where: eq(schema.lectures.id, lectureId),
    columns: { id: true, userId: true, summarizationType: true },
  });

  if (!lecture) {
    throw new NotFoundError('Lecture not found', 'LECTURE_NOT_FOUND');
  }

  if (lecture.userId !== userId) {
    throw new ForbiddenError('Access denied', 'ACCESS_DENIED');
  }

  if (lecture.summarizationType !== SUMMARIZATION_TYPE.CUSTDEV) {
    return null;
  }

  // Get summary with custdev data
  const summary = await db.query.summaries.findFirst({
    where: eq(schema.summaries.lectureId, lectureId),
  });

  if (!summary?.custdevData) {
    return null;
  }

  const data = summary.custdevData;
  return {
    callSummary: data.callSummary || null,
    keyPainPoints: data.keyPainPoints || [],
    positiveFeedback: data.positiveFeedback || [],
    productSuggestions: data.productSuggestions || [],
    internalActionItems: data.internalActionItems || [],
    mindMap: data.mindMap || null,
  };
}

/**
 * Get CustDev mind map only
 */
export async function getCustDevMindMap(
  lectureId: string,
  userId: string
): Promise<CustDevMindMapResponse | null> {
  const custdevData = await getCustDevData(lectureId, userId);
  if (!custdevData?.mindMap) {
    return null;
  }
  return { mindMap: custdevData.mindMap };
}

/**
 * Get CustDev pain points only
 */
export async function getCustDevPainPoints(
  lectureId: string,
  userId: string
): Promise<CustDevPainPointsResponse | null> {
  const custdevData = await getCustDevData(lectureId, userId);
  if (!custdevData) {
    return null;
  }
  return { keyPainPoints: custdevData.keyPainPoints };
}

/**
 * Get CustDev suggestions only
 */
export async function getCustDevSuggestions(
  lectureId: string,
  userId: string
): Promise<CustDevSuggestionsResponse | null> {
  const custdevData = await getCustDevData(lectureId, userId);
  if (!custdevData) {
    return null;
  }
  return { productSuggestions: custdevData.productSuggestions };
}

/**
 * Get CustDev action items only
 */
export async function getCustDevActions(
  lectureId: string,
  userId: string
): Promise<CustDevActionsResponse | null> {
  const custdevData = await getCustDevData(lectureId, userId);
  if (!custdevData) {
    return null;
  }
  return { internalActionItems: custdevData.internalActionItems };
}

/**
 * Get user statistics
 */
export async function getUserStats(userId: string): Promise<UserStatsResponse> {
  // Processing statuses
  const processingStatuses = [
    LECTURE_STATUS.UPLOADED,
    LECTURE_STATUS.EXTRACTING,
    LECTURE_STATUS.TRANSCRIBING,
    LECTURE_STATUS.SUMMARIZING,
  ];

  const [result] = await db
    .select({
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${schema.lectures.status} = ${LECTURE_STATUS.COMPLETED})::int`,
      processing: sql<number>`count(*) filter (where ${schema.lectures.status} IN (${sql.join(processingStatuses.map(s => sql`${s}`), sql`, `)}))::int`,
      failed: sql<number>`count(*) filter (where ${schema.lectures.status} = ${LECTURE_STATUS.FAILED})::int`,
    })
    .from(schema.lectures)
    .where(eq(schema.lectures.userId, userId));

  return {
    total: result?.total ?? 0,
    completed: result?.completed ?? 0,
    processing: result?.processing ?? 0,
    failed: result?.failed ?? 0,
  };
}

/**
 * Helper to format lecture to minimal response
 */
function formatLectureMinimal(lecture: typeof schema.lectures.$inferSelect, tags: TagInfo[] = []): LectureMinimalResponse {
  return {
    id: lecture.id,
    title: lecture.title,
    originalFilename: lecture.originalFilename,
    status: lecture.status as LectureStatus,
    summarizationType: lecture.summarizationType as SummarizationType,
    durationFormatted: lecture.durationSeconds
      ? msToTimeString(lecture.durationSeconds * 1000)
      : null,
    fileSizeBytes: lecture.fileSizeBytes,
    folderId: lecture.folderId,
    tags,
    createdAt: lecture.createdAt,
    language: lecture.language,
  };
}

/**
 * List user's lectures with pagination - supports minimal fields and processing filter
 */
export async function listLecturesOptimized(
  userId: string,
  pagination: PaginationParams,
  filters?: {
    status?: LectureStatus | 'processing';
    search?: string;
    fields?: 'minimal' | 'full';
  }
): Promise<PaginatedResponse<LectureResponse | LectureMinimalResponse>> {
  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  // Build where conditions
  const conditions = [eq(schema.lectures.userId, userId)];

  // Handle "processing" as a meta-status
  if (filters?.status === 'processing') {
    const processingStatuses = [
      LECTURE_STATUS.UPLOADED,
      LECTURE_STATUS.EXTRACTING,
      LECTURE_STATUS.TRANSCRIBING,
      LECTURE_STATUS.SUMMARIZING,
    ];
    conditions.push(
      sql`${schema.lectures.status} IN (${sql.join(processingStatuses.map(s => sql`${s}`), sql`, `)})`
    );
  } else if (filters?.status) {
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

  // Fetch tags for all lectures in a single query
  const lectureIds = lectures.map(l => l.id);
  const tagsByLectureId = await fetchTagsForLectures(lectureIds);

  // Format based on fields parameter
  const data = filters?.fields === 'minimal'
    ? lectures.map(lecture => formatLectureMinimal(lecture, tagsByLectureId[lecture.id] || []))
    : lectures.map(lecture => formatLecture(lecture, tagsByLectureId[lecture.id] || []));

  return {
    data,
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
