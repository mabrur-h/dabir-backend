import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as shareService from '../../services/share/share.service.js';
import type { AuthenticatedRequest } from '../../types/index.js';

// ============================================
// VALIDATION SCHEMAS
// ============================================

export const lectureIdParamSchema = z.object({
  id: z.string().uuid('Invalid lecture ID'),
});

export const slugParamSchema = z.object({
  slug: z
    .string()
    .min(3, 'Slug must be at least 3 characters')
    .max(255, 'Slug must be at most 255 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
});

export const createShareSchema = z.object({
  customSlug: z
    .string()
    .min(3, 'Custom URL must be at least 3 characters')
    .max(100, 'Custom URL must be at most 100 characters')
    .regex(
      /^[a-zA-Z0-9\s_-]+$/,
      'Custom URL can only contain letters, numbers, spaces, hyphens, and underscores'
    )
    .optional(),
  showTranscription: z.boolean().optional(),
  showSummary: z.boolean().optional(),
  showKeyPoints: z.boolean().optional(),
});

export const updateShareSchema = z.object({
  isPublic: z.boolean().optional(),
  showTranscription: z.boolean().optional(),
  showSummary: z.boolean().optional(),
  showKeyPoints: z.boolean().optional(),
});

export const checkSlugSchema = z.object({
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(100, 'Slug must be at most 100 characters'),
});

// ============================================
// AUTHENTICATED CONTROLLERS (Owner operations)
// ============================================

/**
 * POST /lectures/:id/share
 * Create a public share link for a lecture
 */
export async function createShare(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id: lectureId } = lectureIdParamSchema.parse(req.params);
    const body = createShareSchema.parse(req.body);
    const userId = (req as AuthenticatedRequest).user.id;

    const share = await shareService.createShare({
      lectureId,
      userId,
      customSlug: body.customSlug,
      showTranscription: body.showTranscription,
      showSummary: body.showSummary,
      showKeyPoints: body.showKeyPoints,
    });

    res.status(201).json({
      success: true,
      data: {
        share,
        shareUrl: `/s/${share.slug}`,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /lectures/:id/share
 * Get share settings for a lecture
 */
export async function getShare(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id: lectureId } = lectureIdParamSchema.parse(req.params);
    const userId = (req as AuthenticatedRequest).user.id;

    const share = await shareService.getShare(lectureId, userId);

    res.json({
      success: true,
      data: {
        share,
        shareUrl: share ? `/s/${share.slug}` : null,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /lectures/:id/share
 * Update share settings
 */
export async function updateShare(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id: lectureId } = lectureIdParamSchema.parse(req.params);
    const body = updateShareSchema.parse(req.body);
    const userId = (req as AuthenticatedRequest).user.id;

    const share = await shareService.updateShare(lectureId, userId, body);

    res.json({
      success: true,
      data: {
        share,
        shareUrl: `/s/${share.slug}`,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /lectures/:id/share
 * Revoke/delete a share link
 */
export async function deleteShare(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id: lectureId } = lectureIdParamSchema.parse(req.params);
    const userId = (req as AuthenticatedRequest).user.id;

    await shareService.deleteShare(lectureId, userId);

    res.json({
      success: true,
      data: {
        message: 'Share link has been revoked',
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /shares/check-slug
 * Check if a custom slug is available
 */
export async function checkSlugAvailability(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { slug } = checkSlugSchema.parse(req.body);

    const available = await shareService.isSlugAvailable(slug);

    res.json({
      success: true,
      data: {
        slug,
        available,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ============================================
// PUBLIC CONTROLLERS (No auth required)
// ============================================

/**
 * GET /s/:slug
 * Get a publicly shared lecture (no authentication required)
 */
export async function getPublicLecture(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { slug } = slugParamSchema.parse(req.params);

    const lecture = await shareService.getPublicLecture(slug);

    res.json({
      success: true,
      data: lecture,
    });
  } catch (error) {
    next(error);
  }
}
