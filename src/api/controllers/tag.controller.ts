import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as tagService from '../../services/organization/tag.service.js';
import type { AuthenticatedRequest } from '../../types/index.js';

// ============================================
// VALIDATION SCHEMAS
// ============================================

export const createTagSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export const updateTagSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
});

export const tagIdParamSchema = z.object({
  id: z.string().uuid('Invalid tag ID'),
});

export const lectureIdParamSchema = z.object({
  lectureId: z.string().uuid('Invalid lecture ID'),
});

export const lectureTagsSchema = z.object({
  tagIds: z.array(z.string().uuid()).max(50),
});

// ============================================
// TAG CONTROLLERS
// ============================================

/**
 * POST /tags
 * Create a new tag
 */
export async function create(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const input = createTagSchema.parse(req.body);

    const tag = await tagService.createTag(user.id, input);

    res.status(201).json({
      success: true,
      data: { tag },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /tags
 * List all tags
 */
export async function list(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const withCounts = req.query.counts === 'true';

    const tags = withCounts
      ? await tagService.listTagsWithCounts(user.id)
      : await tagService.listTags(user.id);

    res.json({
      success: true,
      data: { tags },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /tags/:id
 * Get tag by ID
 */
export async function getById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const { id } = tagIdParamSchema.parse(req.params);

    const tag = await tagService.getTagById(id, user.id);

    res.json({
      success: true,
      data: { tag },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /tags/:id
 * Update a tag
 */
export async function update(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const { id } = tagIdParamSchema.parse(req.params);
    const input = updateTagSchema.parse(req.body);

    const tag = await tagService.updateTag(id, user.id, input);

    res.json({
      success: true,
      data: { tag },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /tags/:id
 * Delete a tag
 */
export async function remove(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const { id } = tagIdParamSchema.parse(req.params);

    await tagService.deleteTag(id, user.id);

    res.json({
      success: true,
      data: { message: 'Tag deleted successfully' },
    });
  } catch (error) {
    next(error);
  }
}

// ============================================
// LECTURE TAG CONTROLLERS
// ============================================

/**
 * GET /lectures/:lectureId/tags
 * Get all tags for a lecture
 */
export async function getLectureTags(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const { lectureId } = lectureIdParamSchema.parse(req.params);

    const tags = await tagService.getLectureTags(lectureId, user.id);

    res.json({
      success: true,
      data: { tags },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /lectures/:lectureId/tags
 * Set all tags for a lecture (replace existing)
 */
export async function setLectureTags(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const { lectureId } = lectureIdParamSchema.parse(req.params);
    const { tagIds } = lectureTagsSchema.parse(req.body);

    const tags = await tagService.setLectureTags(lectureId, tagIds, user.id);

    res.json({
      success: true,
      data: { tags },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /lectures/:lectureId/tags/:tagId
 * Add a tag to a lecture
 */
export async function addTagToLecture(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const params = z.object({
      lectureId: z.string().uuid(),
      tagId: z.string().uuid(),
    }).parse(req.params);

    await tagService.addTagToLecture(params.lectureId, params.tagId, user.id);

    res.json({
      success: true,
      data: { message: 'Tag added to lecture' },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /lectures/:lectureId/tags/:tagId
 * Remove a tag from a lecture
 */
export async function removeTagFromLecture(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const params = z.object({
      lectureId: z.string().uuid(),
      tagId: z.string().uuid(),
    }).parse(req.params);

    await tagService.removeTagFromLecture(params.lectureId, params.tagId, user.id);

    res.json({
      success: true,
      data: { message: 'Tag removed from lecture' },
    });
  } catch (error) {
    next(error);
  }
}
