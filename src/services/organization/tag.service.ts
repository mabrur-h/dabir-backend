import { eq, and, sql } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { createLogger } from '../../utils/logger.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../../utils/errors.js';

const logger = createLogger('tag-service');

// ============================================
// TYPES
// ============================================

export interface CreateTagInput {
  name: string;
  color?: string;
}

export interface UpdateTagInput {
  name?: string;
  color?: string | null;
}

export interface TagResponse {
  id: string;
  name: string;
  color: string | null;
  lectureCount?: number;
  createdAt: Date;
}

// ============================================
// TAG OPERATIONS
// ============================================

/**
 * Create a new tag
 */
export async function createTag(
  userId: string,
  input: CreateTagInput
): Promise<TagResponse> {
  try {
    const [tag] = await db
      .insert(schema.tags)
      .values({
        userId,
        name: input.name.trim(),
        color: input.color || null,
      })
      .returning();

    if (!tag) {
      throw new Error('Failed to create tag');
    }

    logger.info({ tagId: tag.id, userId }, 'Tag created');

    return {
      id: tag.id,
      name: tag.name,
      color: tag.color,
      createdAt: tag.createdAt,
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('unique')) {
      throw new ConflictError('Tag with this name already exists', 'TAG_EXISTS');
    }
    throw error;
  }
}

/**
 * Get tag by ID
 */
export async function getTagById(tagId: string, userId: string): Promise<TagResponse> {
  const tag = await db.query.tags.findFirst({
    where: eq(schema.tags.id, tagId),
  });

  if (!tag) {
    throw new NotFoundError('Tag not found', 'TAG_NOT_FOUND');
  }

  if (tag.userId !== userId) {
    throw new ForbiddenError('Access denied', 'ACCESS_DENIED');
  }

  return {
    id: tag.id,
    name: tag.name,
    color: tag.color,
    createdAt: tag.createdAt,
  };
}

/**
 * List all tags for a user
 */
export async function listTags(userId: string): Promise<TagResponse[]> {
  const tags = await db.query.tags.findMany({
    where: eq(schema.tags.userId, userId),
    orderBy: [schema.tags.name],
  });

  return tags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    color: tag.color,
    createdAt: tag.createdAt,
  }));
}

/**
 * List tags with lecture counts
 */
export async function listTagsWithCounts(userId: string): Promise<TagResponse[]> {
  const tags = await db.query.tags.findMany({
    where: eq(schema.tags.userId, userId),
    orderBy: [schema.tags.name],
  });

  // Get lecture counts for each tag
  const tagsWithCounts = await Promise.all(
    tags.map(async (tag) => {
      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.lectureTags)
        .where(eq(schema.lectureTags.tagId, tag.id));

      return {
        id: tag.id,
        name: tag.name,
        color: tag.color,
        lectureCount: countResult?.count ?? 0,
        createdAt: tag.createdAt,
      };
    })
  );

  return tagsWithCounts;
}

/**
 * Update a tag
 */
export async function updateTag(
  tagId: string,
  userId: string,
  input: UpdateTagInput
): Promise<TagResponse> {
  // Check ownership
  const existing = await db.query.tags.findFirst({
    where: eq(schema.tags.id, tagId),
  });

  if (!existing) {
    throw new NotFoundError('Tag not found', 'TAG_NOT_FOUND');
  }

  if (existing.userId !== userId) {
    throw new ForbiddenError('Access denied', 'ACCESS_DENIED');
  }

  try {
    const [updated] = await db
      .update(schema.tags)
      .set({
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.color !== undefined && { color: input.color }),
      })
      .where(eq(schema.tags.id, tagId))
      .returning();

    if (!updated) {
      throw new Error('Failed to update tag');
    }

    logger.info({ tagId }, 'Tag updated');

    return {
      id: updated.id,
      name: updated.name,
      color: updated.color,
      createdAt: updated.createdAt,
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('unique')) {
      throw new ConflictError('Tag with this name already exists', 'TAG_EXISTS');
    }
    throw error;
  }
}

/**
 * Delete a tag
 */
export async function deleteTag(tagId: string, userId: string): Promise<void> {
  // Check ownership
  const existing = await db.query.tags.findFirst({
    where: eq(schema.tags.id, tagId),
  });

  if (!existing) {
    throw new NotFoundError('Tag not found', 'TAG_NOT_FOUND');
  }

  if (existing.userId !== userId) {
    throw new ForbiddenError('Access denied', 'ACCESS_DENIED');
  }

  // Delete tag (lecture_tags will be deleted via cascade)
  await db.delete(schema.tags).where(eq(schema.tags.id, tagId));

  logger.info({ tagId, userId }, 'Tag deleted');
}

// ============================================
// LECTURE TAG OPERATIONS
// ============================================

/**
 * Add a tag to a lecture
 */
export async function addTagToLecture(
  lectureId: string,
  tagId: string,
  userId: string
): Promise<void> {
  // Verify lecture ownership
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

  // Verify tag ownership
  const tag = await db.query.tags.findFirst({
    where: eq(schema.tags.id, tagId),
    columns: { id: true, userId: true },
  });

  if (!tag) {
    throw new NotFoundError('Tag not found', 'TAG_NOT_FOUND');
  }

  if (tag.userId !== userId) {
    throw new ForbiddenError('Access denied', 'ACCESS_DENIED');
  }

  try {
    await db.insert(schema.lectureTags).values({
      lectureId,
      tagId,
    });

    logger.info({ lectureId, tagId }, 'Tag added to lecture');
  } catch (error: unknown) {
    // Ignore duplicate entries
    if (error instanceof Error && error.message.includes('unique')) {
      // Tag already exists on lecture, that's fine
      return;
    }
    throw error;
  }
}

/**
 * Remove a tag from a lecture
 */
export async function removeTagFromLecture(
  lectureId: string,
  tagId: string,
  userId: string
): Promise<void> {
  // Verify lecture ownership
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

  await db
    .delete(schema.lectureTags)
    .where(
      and(
        eq(schema.lectureTags.lectureId, lectureId),
        eq(schema.lectureTags.tagId, tagId)
      )
    );

  logger.info({ lectureId, tagId }, 'Tag removed from lecture');
}

/**
 * Get all tags for a lecture
 */
export async function getLectureTags(
  lectureId: string,
  userId: string
): Promise<TagResponse[]> {
  // Verify lecture ownership
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

  const lectureTags = await db.query.lectureTags.findMany({
    where: eq(schema.lectureTags.lectureId, lectureId),
    with: {
      tag: true,
    },
  });

  return lectureTags.map((lt) => ({
    id: lt.tag.id,
    name: lt.tag.name,
    color: lt.tag.color,
    createdAt: lt.tag.createdAt,
  }));
}

/**
 * Set all tags for a lecture (replace existing)
 */
export async function setLectureTags(
  lectureId: string,
  tagIds: string[],
  userId: string
): Promise<TagResponse[]> {
  // Verify lecture ownership
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

  // Verify all tags belong to user
  if (tagIds.length > 0) {
    const tags = await db.query.tags.findMany({
      where: and(
        sql`${schema.tags.id} IN (${sql.join(tagIds.map(id => sql`${id}`), sql`, `)})`,
        eq(schema.tags.userId, userId)
      ),
    });

    if (tags.length !== tagIds.length) {
      throw new NotFoundError('One or more tags not found', 'TAG_NOT_FOUND');
    }
  }

  // Remove existing tags
  await db
    .delete(schema.lectureTags)
    .where(eq(schema.lectureTags.lectureId, lectureId));

  // Add new tags
  if (tagIds.length > 0) {
    await db.insert(schema.lectureTags).values(
      tagIds.map((tagId) => ({
        lectureId,
        tagId,
      }))
    );
  }

  logger.info({ lectureId, tagIds }, 'Lecture tags updated');

  return getLectureTags(lectureId, userId);
}
