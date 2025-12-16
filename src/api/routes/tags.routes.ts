import { Router } from 'express';
import * as tagController from '../controllers/tag.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ============================================
// TAG ROUTES
// ============================================

/**
 * POST /api/v1/tags
 * Create a new tag
 *
 * Body: { name: string, color?: string }
 * Response: { tag }
 */
router.post('/', tagController.create);

/**
 * GET /api/v1/tags
 * List all tags
 *
 * Query: { counts?: boolean } - Include lecture counts per tag
 * Response: { tags[] }
 */
router.get('/', tagController.list);

/**
 * GET /api/v1/tags/:id
 * Get tag by ID
 *
 * Response: { tag }
 */
router.get('/:id', tagController.getById);

/**
 * PATCH /api/v1/tags/:id
 * Update a tag
 *
 * Body: { name?: string, color?: string | null }
 * Response: { tag }
 */
router.patch('/:id', tagController.update);

/**
 * DELETE /api/v1/tags/:id
 * Delete a tag
 *
 * Response: { message }
 */
router.delete('/:id', tagController.remove);

export default router;
