import { Router } from 'express';
import * as lectureController from '../controllers/lecture.controller.js';
import * as tagController from '../controllers/tag.controller.js';
import * as simpleUploadController from '../controllers/simpleUpload.controller.js';
import { lectureShareRouter } from './shares.routes.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { uploadRateLimiter } from '../middleware/rateLimit.middleware.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ============================================
// SIMPLE UPLOAD (must be before :id routes)
// ============================================

/**
 * POST /api/v1/lectures/upload
 * Simple multipart file upload (alternative to TUS for smaller files)
 * Rate limited: 10 uploads per hour per user
 *
 * Body: multipart/form-data with file, language?, summarizationType?, title?
 * Response: { lecture: { id, title, status, createdAt } }
 */
router.post('/upload', uploadRateLimiter, simpleUploadController.upload.single('file'), simpleUploadController.uploadFile);

// ============================================
// BATCH OPERATIONS (must be before :id routes)
// ============================================

/**
 * POST /api/v1/lectures/status
 * Batch status check for multiple lectures
 *
 * Body: { ids: string[] }
 * Response: { statuses: { [id]: { id, status, progress, errorMessage } } }
 */
router.post('/status', lectureController.getBatchStatus);

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
 * Query: { page?, limit?, status?, search?, fields? }
 * - status: 'uploaded' | 'extracting' | 'transcribing' | 'summarizing' | 'completed' | 'failed' | 'processing'
 * - fields: 'minimal' | 'full' (default: full)
 * Response: { data: lectures[], pagination }
 */
router.get('/', lectureController.listOptimized);

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
// LECTURE STATUS ROUTES
// ============================================

/**
 * GET /api/v1/lectures/:id/status
 * Get lecture processing status (detailed with jobs)
 *
 * Response: { lectureId, status, progress, jobs[] }
 */
router.get('/:id/status', lectureController.getStatus);

/**
 * GET /api/v1/lectures/:id/status/light
 * Get lightweight lecture status (for polling)
 *
 * Response: { id, status, progress, errorMessage }
 */
router.get('/:id/status/light', lectureController.getStatusLight);

// ============================================
// LECTURE CONTENT ROUTES
// ============================================

/**
 * GET /api/v1/lectures/:id/transcription
 * Get lecture transcription with segments (legacy, no pagination)
 *
 * Response: { transcription: { fullText, segments[] } }
 */
router.get('/:id/transcription', lectureController.getTranscription);

/**
 * GET /api/v1/lectures/:id/transcript
 * Get lecture transcription with optional pagination
 *
 * Query: { page?, limit? }
 * Response: { transcription: { fullText, wordCount, segments[], pagination? } }
 */
router.get('/:id/transcript', lectureController.getTranscript);

/**
 * GET /api/v1/lectures/:id/summary
 * Get lecture summary and key points (combined)
 *
 * Response: { summary, keyPoints[] }
 */
router.get('/:id/summary', lectureController.getSummary);

/**
 * GET /api/v1/lectures/:id/summary-only
 * Get lecture summary without key points
 *
 * Response: { summary: { id, summarizationType, overview, chapters[] } }
 */
router.get('/:id/summary-only', lectureController.getSummaryOnly);

/**
 * GET /api/v1/lectures/:id/keypoints
 * Get lecture key points only
 *
 * Response: { keyPoints[] }
 */
router.get('/:id/keypoints', lectureController.getKeyPoints);

// ============================================
// CUSTDEV ROUTES
// ============================================

/**
 * GET /api/v1/lectures/:id/custdev
 * Get full CustDev analysis data
 *
 * Response: { callSummary, keyPainPoints[], positiveFeedback[], productSuggestions[], internalActionItems[], mindMap }
 */
router.get('/:id/custdev', lectureController.getCustDev);

/**
 * GET /api/v1/lectures/:id/custdev/mindmap
 * Get CustDev mind map only
 *
 * Response: { mindMap }
 */
router.get('/:id/custdev/mindmap', lectureController.getCustDevMindMap);

/**
 * GET /api/v1/lectures/:id/custdev/painpoints
 * Get CustDev pain points only
 *
 * Response: { keyPainPoints[] }
 */
router.get('/:id/custdev/painpoints', lectureController.getCustDevPainPoints);

/**
 * GET /api/v1/lectures/:id/custdev/suggestions
 * Get CustDev product suggestions only
 *
 * Response: { productSuggestions[] }
 */
router.get('/:id/custdev/suggestions', lectureController.getCustDevSuggestions);

/**
 * GET /api/v1/lectures/:id/custdev/actions
 * Get CustDev action items only
 *
 * Response: { internalActionItems[] }
 */
router.get('/:id/custdev/actions', lectureController.getCustDevActions);

// ============================================
// LECTURE SHARE ROUTES
// ============================================

/**
 * Share routes for a lecture
 * POST /api/v1/lectures/:id/share - Create share link
 * GET /api/v1/lectures/:id/share - Get share settings
 * PATCH /api/v1/lectures/:id/share - Update share settings
 * DELETE /api/v1/lectures/:id/share - Revoke share link
 */
router.use('/:id/share', lectureShareRouter);

// ============================================
// LECTURE TAG ROUTES
// ============================================

/**
 * GET /api/v1/lectures/:lectureId/tags
 * Get all tags for a lecture
 *
 * Response: { tags[] }
 */
router.get('/:lectureId/tags', tagController.getLectureTags);

/**
 * PUT /api/v1/lectures/:lectureId/tags
 * Set all tags for a lecture (replace existing)
 *
 * Body: { tagIds: string[] }
 * Response: { tags[] }
 */
router.put('/:lectureId/tags', tagController.setLectureTags);

/**
 * POST /api/v1/lectures/:lectureId/tags/:tagId
 * Add a tag to a lecture
 *
 * Response: { message }
 */
router.post('/:lectureId/tags/:tagId', tagController.addTagToLecture);

/**
 * DELETE /api/v1/lectures/:lectureId/tags/:tagId
 * Remove a tag from a lecture
 *
 * Response: { message }
 */
router.delete('/:lectureId/tags/:tagId', tagController.removeTagFromLecture);

export default router;
