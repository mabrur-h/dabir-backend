import { Router } from 'express';
import * as lectureController from '../controllers/lecture.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ============================================
// USER STATISTICS ROUTES
// ============================================

/**
 * GET /api/v1/users/stats
 * Get user's lecture statistics
 *
 * Response: { total, completed, processing, failed }
 */
router.get('/stats', lectureController.getUserStats);

export default router;
