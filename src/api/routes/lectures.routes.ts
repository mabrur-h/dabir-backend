import { Router } from 'express';
import * as lectureController from '../controllers/lecture.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ============================================
// LECTURE CRUD ROUTES
// ============================================

/**
 * POST /api/v1/lectures
 * Create a new lecture record (after upload completes)
 *
 * Body: { title?, originalFilename, gcsUri, fileSizeBytes, mimeType, language? }
 * Response: { lecture }
 */
router.post('/', lectureController.create);

/**
 * GET /api/v1/lectures
 * List user's lectures with pagination
 *
 * Query: { page?, limit?, status?, search? }
 * Response: { data: lectures[], pagination }
 */
router.get('/', lectureController.list);

/**
 * GET /api/v1/lectures/:id
 * Get lecture with full details (transcription, summary, key points)
 *
 * Response: { lecture }
 */
router.get('/:id', lectureController.getById);

/**
 * PATCH /api/v1/lectures/:id
 * Update lecture (title, language)
 *
 * Body: { title?, language? }
 * Response: { lecture }
 */
router.patch('/:id', lectureController.update);

/**
 * DELETE /api/v1/lectures/:id
 * Delete lecture and all related data
 *
 * Response: { message }
 */
router.delete('/:id', lectureController.remove);

// ============================================
// LECTURE STATUS & CONTENT ROUTES
// ============================================

/**
 * GET /api/v1/lectures/:id/status
 * Get lecture processing status
 *
 * Response: { lectureId, status, progress, jobs[] }
 */
router.get('/:id/status', lectureController.getStatus);

/**
 * GET /api/v1/lectures/:id/transcription
 * Get lecture transcription with segments
 *
 * Response: { transcription: { fullText, segments[] } }
 */
router.get('/:id/transcription', lectureController.getTranscription);

/**
 * GET /api/v1/lectures/:id/summary
 * Get lecture summary and key points
 *
 * Response: { summary, keyPoints[] }
 */
router.get('/:id/summary', lectureController.getSummary);

export default router;
