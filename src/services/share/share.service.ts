import { eq, and, sql } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { createLogger } from '../../utils/logger.js';
import { NotFoundError, ForbiddenError, ConflictError, BadRequestError } from '../../utils/errors.js';
import { LECTURE_STATUS } from '../../config/constants.js';
import { msToTimeString } from '../../utils/time.js';
import * as gcsService from '../upload/gcs.service.js';

const logger = createLogger('share-service');

// ============================================
// TYPES
// ============================================

export interface CreateShareInput {
  lectureId: string;
  userId: string;
  customSlug?: string;
  showTranscription?: boolean;
  showSummary?: boolean;
  showKeyPoints?: boolean;
}

export interface UpdateShareInput {
  isPublic?: boolean;
  showTranscription?: boolean;
  showSummary?: boolean;
  showKeyPoints?: boolean;
}

export interface ShareResponse {
  id: string;
  lectureId: string;
  slug: string;
  isPublic: boolean;
  showTranscription: boolean;
  showSummary: boolean;
  showKeyPoints: boolean;
  viewCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicLectureResponse {
  slug: string;
  title: string | null;
  durationSeconds: number | null;
  durationFormatted: string | null;
  language: string;
  summarizationType: string;
  createdAt: Date;
  transcription?: {
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
    index: number;
    title: string;
    description: string | null;
    timestampMs: number | null;
    timestampFormatted: string | null;
    importance: number | null;
  }> | null;
  ownerName?: string | null;
}

// ============================================
// SLUG GENERATION
// ============================================

/**
 * Generate a URL-friendly slug from text
 * Converts to lowercase, removes special chars, replaces spaces with hyphens
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    // Replace Cyrillic and other non-ASCII with transliteration or removal
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    // Replace common Cyrillic characters
    .replace(/[а-яё]/gi, (char) => {
      const map: Record<string, string> = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
        'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
        'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
        'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
        'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
      };
      return map[char.toLowerCase()] || '';
    })
    // Replace spaces and underscores with hyphens
    .replace(/[\s_]+/g, '-')
    // Remove all non-alphanumeric except hyphens
    .replace(/[^a-z0-9-]/g, '')
    // Remove multiple consecutive hyphens
    .replace(/-+/g, '-')
    // Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, '')
    // Limit length
    .substring(0, 50);
}

/**
 * Generate a short random suffix for uniqueness
 * Uses base36 (0-9, a-z) for URL-friendliness
 */
function generateShortId(length = 6): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Generate a unique slug for a lecture
 * Format: "title-slug-abc123" (title + random suffix)
 */
async function generateUniqueSlug(title: string | null, customSlug?: string): Promise<string> {
  // Use custom slug if provided
  if (customSlug) {
    const slug = slugify(customSlug);
    if (slug.length < 3) {
      throw new BadRequestError('Custom slug must be at least 3 characters after processing');
    }

    // Check if slug is already taken
    const existing = await db.query.lectureShares.findFirst({
      where: eq(schema.lectureShares.slug, slug),
    });

    if (existing) {
      throw new ConflictError('This share URL is already taken. Please choose a different one.');
    }

    return slug;
  }

  // Generate from title
  const baseSlug = title ? slugify(title) : 'lecture';
  const finalBase = baseSlug || 'lecture';

  // Try with random suffix
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const suffix = generateShortId(6);
    const slug = `${finalBase}-${suffix}`;

    const existing = await db.query.lectureShares.findFirst({
      where: eq(schema.lectureShares.slug, slug),
    });

    if (!existing) {
      return slug;
    }

    attempts++;
  }

  // Fallback to longer suffix
  return `${finalBase}-${generateShortId(10)}`;
}

// ============================================
// SHARE MANAGEMENT
// ============================================

/**
 * Create a public share link for a lecture
 */
export async function createShare(input: CreateShareInput): Promise<ShareResponse> {
  const { lectureId, userId, customSlug, showTranscription = true, showSummary = true, showKeyPoints = true } = input;

  // Get the lecture and verify ownership
  const lecture = await db.query.lectures.findFirst({
    where: eq(schema.lectures.id, lectureId),
  });

  if (!lecture) {
    throw new NotFoundError('Lecture not found', 'LECTURE_NOT_FOUND');
  }

  if (lecture.userId !== userId) {
    throw new ForbiddenError('You do not have permission to share this lecture', 'ACCESS_DENIED');
  }

  // Check if lecture is completed
  if (lecture.status !== LECTURE_STATUS.COMPLETED) {
    throw new BadRequestError(
      'Only completed lectures can be shared publicly. Please wait for processing to finish.',
      'LECTURE_NOT_COMPLETED'
    );
  }

  // Check if share already exists
  const existingShare = await db.query.lectureShares.findFirst({
    where: eq(schema.lectureShares.lectureId, lectureId),
  });

  if (existingShare) {
    throw new ConflictError('This lecture is already shared. Use update to modify sharing settings.', 'SHARE_EXISTS');
  }

  // Generate unique slug
  const slug = await generateUniqueSlug(lecture.title, customSlug);

  // Create the share
  const [share] = await db
    .insert(schema.lectureShares)
    .values({
      lectureId,
      slug,
      isPublic: true,
      showTranscription,
      showSummary,
      showKeyPoints,
    })
    .returning();

  logger.info({ lectureId, slug, userId }, 'Lecture share created');

  return formatShare(share!);
}

/**
 * Get share settings for a lecture (owner only)
 */
export async function getShare(lectureId: string, userId: string): Promise<ShareResponse | null> {
  // Verify lecture ownership
  const lecture = await db.query.lectures.findFirst({
    where: eq(schema.lectures.id, lectureId),
  });

  if (!lecture) {
    throw new NotFoundError('Lecture not found', 'LECTURE_NOT_FOUND');
  }

  if (lecture.userId !== userId) {
    throw new ForbiddenError('Access denied', 'ACCESS_DENIED');
  }

  const share = await db.query.lectureShares.findFirst({
    where: eq(schema.lectureShares.lectureId, lectureId),
  });

  return share ? formatShare(share) : null;
}

/**
 * Update share settings
 */
export async function updateShare(
  lectureId: string,
  userId: string,
  input: UpdateShareInput
): Promise<ShareResponse> {
  // Verify lecture ownership
  const lecture = await db.query.lectures.findFirst({
    where: eq(schema.lectures.id, lectureId),
  });

  if (!lecture) {
    throw new NotFoundError('Lecture not found', 'LECTURE_NOT_FOUND');
  }

  if (lecture.userId !== userId) {
    throw new ForbiddenError('Access denied', 'ACCESS_DENIED');
  }

  const existingShare = await db.query.lectureShares.findFirst({
    where: eq(schema.lectureShares.lectureId, lectureId),
  });

  if (!existingShare) {
    throw new NotFoundError('Share not found. Create a share first.', 'SHARE_NOT_FOUND');
  }

  const [updated] = await db
    .update(schema.lectureShares)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(schema.lectureShares.id, existingShare.id))
    .returning();

  logger.info({ lectureId, shareId: updated!.id }, 'Lecture share updated');

  return formatShare(updated!);
}

/**
 * Delete/revoke a share link
 */
export async function deleteShare(lectureId: string, userId: string): Promise<void> {
  // Verify lecture ownership
  const lecture = await db.query.lectures.findFirst({
    where: eq(schema.lectures.id, lectureId),
  });

  if (!lecture) {
    throw new NotFoundError('Lecture not found', 'LECTURE_NOT_FOUND');
  }

  if (lecture.userId !== userId) {
    throw new ForbiddenError('Access denied', 'ACCESS_DENIED');
  }

  const result = await db
    .delete(schema.lectureShares)
    .where(eq(schema.lectureShares.lectureId, lectureId))
    .returning();

  if (result.length === 0) {
    throw new NotFoundError('Share not found', 'SHARE_NOT_FOUND');
  }

  logger.info({ lectureId, userId }, 'Lecture share deleted');
}

// ============================================
// PUBLIC ACCESS
// ============================================

/**
 * Get a publicly shared lecture by slug (no auth required)
 */
export async function getPublicLecture(slug: string): Promise<PublicLectureResponse> {
  // Find the share by slug
  const share = await db.query.lectureShares.findFirst({
    where: and(
      eq(schema.lectureShares.slug, slug),
      eq(schema.lectureShares.isPublic, true)
    ),
  });

  if (!share) {
    throw new NotFoundError('Shared lecture not found or is no longer public', 'SHARE_NOT_FOUND');
  }

  // Get the lecture with related data
  const lecture = await db.query.lectures.findFirst({
    where: eq(schema.lectures.id, share.lectureId),
    with: {
      user: {
        columns: {
          name: true,
          telegramFirstName: true,
          telegramUsername: true,
        },
      },
    },
  });

  if (!lecture || lecture.status !== LECTURE_STATUS.COMPLETED) {
    throw new NotFoundError('Lecture is not available', 'LECTURE_UNAVAILABLE');
  }

  // Increment view count (fire and forget)
  db.update(schema.lectureShares)
    .set({ viewCount: sql`${schema.lectureShares.viewCount} + 1` })
    .where(eq(schema.lectureShares.id, share.id))
    .execute()
    .catch((err) => logger.error({ err, shareId: share.id }, 'Failed to increment view count'));

  // Build response based on share settings
  const response: PublicLectureResponse = {
    slug: share.slug,
    title: lecture.title,
    durationSeconds: lecture.durationSeconds,
    durationFormatted: lecture.durationSeconds ? msToTimeString(lecture.durationSeconds * 1000) : null,
    language: lecture.language,
    summarizationType: lecture.summarizationType,
    createdAt: lecture.createdAt,
    ownerName: lecture.user?.name || lecture.user?.telegramFirstName || lecture.user?.telegramUsername || null,
  };

  // Include transcription if allowed
  if (share.showTranscription) {
    const transcription = await db.query.transcriptions.findFirst({
      where: eq(schema.transcriptions.lectureId, lecture.id),
      with: {
        segments: {
          orderBy: (segments, { asc }) => [asc(segments.segmentIndex)],
        },
      },
    });

    if (transcription) {
      response.transcription = {
        fullText: transcription.fullText,
        wordCount: transcription.wordCount,
        segments: transcription.segments.map((seg) => ({
          index: seg.segmentIndex,
          startTimeMs: seg.startTimeMs,
          endTimeMs: seg.endTimeMs,
          startTimeFormatted: msToTimeString(seg.startTimeMs),
          endTimeFormatted: msToTimeString(seg.endTimeMs),
          text: seg.text,
          speaker: seg.speakerLabel,
        })),
      };
    }
  }

  // Include summary if allowed
  if (share.showSummary) {
    const summary = await db.query.summaries.findFirst({
      where: eq(schema.summaries.lectureId, lecture.id),
    });

    if (summary) {
      const chapters = summary.chapters as Array<{
        index: number;
        title: string;
        summary: string;
        startTimeMs: number;
        endTimeMs: number;
      }> | null;

      response.summary = {
        overview: summary.overview,
        chapters: chapters?.map((ch) => ({
          ...ch,
          startTimeFormatted: msToTimeString(ch.startTimeMs),
          endTimeFormatted: msToTimeString(ch.endTimeMs),
        })) || null,
      };
    }
  }

  // Include key points if allowed
  if (share.showKeyPoints) {
    const keyPoints = await db.query.keyPoints.findMany({
      where: eq(schema.keyPoints.lectureId, lecture.id),
      orderBy: (kp, { asc }) => [asc(kp.pointIndex)],
    });

    if (keyPoints.length > 0) {
      response.keyPoints = keyPoints.map((kp) => ({
        index: kp.pointIndex,
        title: kp.title,
        description: kp.description,
        timestampMs: kp.timestampMs,
        timestampFormatted: kp.timestampMs ? msToTimeString(kp.timestampMs) : null,
        importance: kp.importance,
      }));
    }
  }

  logger.debug({ slug, viewCount: share.viewCount + 1 }, 'Public lecture accessed');

  return response;
}

/**
 * Check if a slug is available
 */
export async function isSlugAvailable(slug: string): Promise<boolean> {
  const processedSlug = slugify(slug);

  if (processedSlug.length < 3) {
    return false;
  }

  const existing = await db.query.lectureShares.findFirst({
    where: eq(schema.lectureShares.slug, processedSlug),
  });

  return !existing;
}

// ============================================
// HELPERS
// ============================================

function formatShare(share: typeof schema.lectureShares.$inferSelect): ShareResponse {
  return {
    id: share.id,
    lectureId: share.lectureId,
    slug: share.slug,
    isPublic: share.isPublic,
    showTranscription: share.showTranscription,
    showSummary: share.showSummary,
    showKeyPoints: share.showKeyPoints,
    viewCount: share.viewCount,
    createdAt: share.createdAt,
    updatedAt: share.updatedAt,
  };
}
