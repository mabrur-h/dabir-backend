import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { uploadRateLimiter } from '../middleware/rateLimit.middleware.js';
import { getTusHandler } from '../../services/upload/tus.service.js';

const router = Router();

// All upload routes require authentication
router.use(authenticate);

/**
 * TUS Upload Endpoints
 *
 * POST   /api/v1/uploads     - Create a new upload
 * HEAD   /api/v1/uploads/:id - Get upload status
 * PATCH  /api/v1/uploads/:id - Upload a chunk
 * DELETE /api/v1/uploads/:id - Cancel upload
 *
 * Client should send these headers:
 * - Tus-Resumable: 1.0.0
 * - Upload-Length: <total file size>
 * - Upload-Metadata: filename <base64>,filetype <base64>,title <base64>,language <base64>
 *
 * Example metadata:
 * filename ZXhhbXBsZS5tcDQ=,filetype dmlkZW8vbXA0,title TGVjdHVyZSAx,language dXo=
 *
 * Response headers on completion:
 * - X-Lecture-Id: <lecture uuid>
 */

// Rate limit only POST requests (creating new upload sessions)
// PATCH requests (chunk uploads) should not count against the limit
// as they are part of a single upload, not separate uploads
router.post('/', uploadRateLimiter, getTusHandler());
router.post('/*', uploadRateLimiter, getTusHandler());

// Handle other HTTP methods for tus protocol without rate limiting
// HEAD: Get upload status, PATCH: Upload chunks, DELETE: Cancel upload
router.head('/', getTusHandler());
router.head('/*', getTusHandler());
router.patch('/', getTusHandler());
router.patch('/*', getTusHandler());
router.delete('/', getTusHandler());
router.delete('/*', getTusHandler());

export default router;
