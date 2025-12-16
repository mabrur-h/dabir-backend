import { Router } from 'express';
import * as shareController from '../controllers/share.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

// ============================================
// PUBLIC ROUTES (No authentication required)
// ============================================

/**
 * GET /api/v1/s/:slug
 * Get a publicly shared lecture by its slug
 *
 * No authentication required
 * Response: { title, durationSeconds, language, transcription?, summary?, keyPoints? }
 */
router.get('/:slug', shareController.getPublicLecture);

export default router;

// ============================================
// AUTHENTICATED SHARE ROUTES
// These are mounted under /api/v1/lectures/:id/share
// ============================================

export const lectureShareRouter = Router({ mergeParams: true });

// All routes require authentication
lectureShareRouter.use(authenticate);

/**
 * POST /api/v1/lectures/:id/share
 * Create a public share link for a lecture
 *
 * Body: { customSlug?, showTranscription?, showSummary?, showKeyPoints? }
 * Response: { share, shareUrl }
 */
lectureShareRouter.post('/', shareController.createShare);

/**
 * GET /api/v1/lectures/:id/share
 * Get share settings for a lecture
 *
 * Response: { share, shareUrl }
 */
lectureShareRouter.get('/', shareController.getShare);

/**
 * PATCH /api/v1/lectures/:id/share
 * Update share settings
 *
 * Body: { isPublic?, showTranscription?, showSummary?, showKeyPoints? }
 * Response: { share, shareUrl }
 */
lectureShareRouter.patch('/', shareController.updateShare);

/**
 * DELETE /api/v1/lectures/:id/share
 * Revoke/delete a share link
 *
 * Response: { message }
 */
lectureShareRouter.delete('/', shareController.deleteShare);

// ============================================
// UTILITY ROUTES
// ============================================

export const shareUtilRouter = Router();

// Requires authentication
shareUtilRouter.use(authenticate);

/**
 * POST /api/v1/shares/check-slug
 * Check if a custom slug is available
 *
 * Body: { slug }
 * Response: { slug, available }
 */
shareUtilRouter.post('/check-slug', shareController.checkSlugAvailability);
