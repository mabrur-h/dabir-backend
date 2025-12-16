import { Router } from 'express';
import * as folderController from '../controllers/folder.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ============================================
// FOLDER ROUTES
// ============================================

/**
 * POST /api/v1/folders
 * Create a new folder
 *
 * Body: { name: string, color?: string, parentId?: string }
 * Response: { folder }
 */
router.post('/', folderController.create);

/**
 * GET /api/v1/folders
 * List all folders (flat list)
 *
 * Response: { folders[] }
 */
router.get('/', folderController.list);

/**
 * GET /api/v1/folders/tree
 * List folders as a tree structure
 *
 * Response: { folders[] } with nested children
 */
router.get('/tree', folderController.listTree);

/**
 * GET /api/v1/folders/:id
 * Get folder by ID with lecture count
 *
 * Response: { folder }
 */
router.get('/:id', folderController.getById);

/**
 * PATCH /api/v1/folders/:id
 * Update a folder
 *
 * Body: { name?: string, color?: string, parentId?: string | null }
 * Response: { folder }
 */
router.patch('/:id', folderController.update);

/**
 * DELETE /api/v1/folders/:id
 * Delete a folder (lectures will be moved to no folder)
 *
 * Response: { message }
 */
router.delete('/:id', folderController.remove);

export default router;
