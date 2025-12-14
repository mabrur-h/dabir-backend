import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
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

// Handle all HTTP methods for tus protocol
router.all('/', getTusHandler());
router.all('/:id', getTusHandler());

export default router;
