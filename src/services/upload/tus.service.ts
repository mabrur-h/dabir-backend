import { Server as TusServer, Upload } from '@tus/server';
import { Storage } from '@google-cloud/storage';
import type { Request, Response } from 'express';
import { config } from '../../config/index.js';
import { createLogger } from '../../utils/logger.js';
import * as lectureService from '../lecture/lecture.service.js';
import { addAudioExtractionJob } from '../queue/queue.service.js';
import { getFileMd5Hash, deleteFile } from './gcs.service.js';
import { MemoryGCSStore, createRedisClient } from './memory-gcs-store.js';

const logger = createLogger('tus-service');

// ============================================
// TUS SERVER SETUP
// ============================================

let tusServer: TusServer;
let redisClient: ReturnType<typeof createRedisClient> | null = null;

export function createTusServer(): TusServer {
  if (tusServer) {
    return tusServer;
  }

  // Create Redis client for upload state tracking
  if (!redisClient) {
    redisClient = createRedisClient();
  }

  // Create GCS bucket reference
  const storage = new Storage({
    projectId: config.gcp.projectId,
    keyFilename: config.gcp.credentials,
  });
  const bucket = storage.bucket(config.gcp.bucketName);

  // Use our custom store that buffers to temp files and uses Redis for state
  // This avoids the @tus/gcs-store metadata corruption bugs
  const store = new MemoryGCSStore({ redis: redisClient, bucket });

  tusServer = new TusServer({
    path: '/api/v1/uploads',
    datastore: store,
    maxSize: config.upload.maxFileSizeBytes,
    respectForwardedHeaders: true,

    // Generate URL for the upload
    generateUrl: (_req, { proto, host, path, id }) => {
      return `${proto}://${host}${path}/${id}`;
    },

    // Intercept errors before they're sent to the client
    // This allows us to convert cryptic GCS errors into clear, actionable responses
    onResponseError: async (req, _res, error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const method = req.method || 'UNKNOWN';

      // Log the error for debugging
      logger.warn({ error: errorMessage, method }, 'TUS response error');

      // If error already has status_code and body, pass it through
      const tusError = error as { status_code?: number; body?: string };
      if (tusError.status_code && tusError.body) {
        return { status_code: tusError.status_code, body: tusError.body };
      }

      // For POST (create upload), don't convert to 404 - let the actual error through
      if (method === 'POST') {
        return {
          status_code: 500,
          body: JSON.stringify({
            success: false,
            error: {
              code: 'UPLOAD_CREATE_ERROR',
              message: errorMessage || 'Failed to create upload session.',
            },
          }),
        };
      }

      // For PATCH/HEAD/GET (resume operations), check for session-related errors
      if (isSessionExpiredError(error)) {
        logger.warn({ error: errorMessage, method }, 'Converting session error to UPLOAD_NOT_FOUND');
        return {
          status_code: 404,
          body: JSON.stringify({
            success: false,
            error: {
              code: 'UPLOAD_NOT_FOUND',
              message: 'Upload session expired or corrupted. Please start a new upload.',
            },
          }),
        };
      }

      // Convert generic errors to 500 response
      return {
        status_code: 500,
        body: JSON.stringify({
          success: false,
          error: {
            code: 'UPLOAD_ERROR',
            message: 'Something went wrong. Please retry.',
          },
        }),
      };
    },

    // Extract metadata from upload
    // This returns the GCS object path (which also becomes the upload ID in URLs)
    // NOTE: The returned ID should NOT include 'uploads/' prefix since the route is already at /api/v1/uploads
    // The GCS path will be constructed separately
    namingFunction: (_req, metadata) => {
      // Use user ID and timestamp for unique naming
      let userId = metadata?.userId || 'unknown';
      // Decode base64 if needed (check if it looks like a UUID)
      if (userId !== 'unknown' && !userId.includes('-')) {
        try {
          const decoded = Buffer.from(userId, 'base64').toString('utf-8');
          if (/^[0-9a-f-]{36}$/i.test(decoded)) {
            userId = decoded;
          }
        } catch {
          // Keep original
        }
      }
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 10);
      // Return just the unique ID part - GCSStore will handle storage path
      return `${userId}/${timestamp}-${randomId}`;
    },

    // Override getUpload ID extraction to handle the nested path
    getFileIdFromRequest: (req) => {
      // The URL here is the path after the route prefix
      // For example: "/userId/timestamp-random" (Express strips /api/v1/uploads)
      const url = req.url || '';
      logger.debug({ url }, 'getFileIdFromRequest called');

      // Extract the upload ID (userId/timestamp-random pattern)
      // URL format: /userId/timestamp-random
      const match = url.match(/^\/([^/]+\/[^/]+)$/);
      if (match) {
        return match[1];
      }

      // Fallback: if URL starts with /, remove it and return the rest
      if (url.startsWith('/')) {
        const id = url.slice(1);
        if (id) return id;
      }

      return undefined;
    },

    // Called when upload is created
    onUploadCreate: async (_req, _res, upload) => {
      // Debug: log raw metadata to understand encoding
      logger.debug({ rawMetadata: upload.metadata }, 'Raw metadata in onUploadCreate');

      logger.info(
        {
          uploadId: upload.id,
          size: upload.size,
          metadata: upload.metadata,
        },
        'Upload created'
      );

      // Validate file type
      // Note: Check if TUS decoded the metadata or not
      let mimeType = upload.metadata?.filetype || upload.metadata?.mimeType;
      if (mimeType) {
        // Try to decode if it looks like base64 (no slashes in raw base64 for mime types)
        if (!mimeType.includes('/')) {
          try {
            mimeType = Buffer.from(mimeType, 'base64').toString('utf-8');
          } catch {
            // Keep original if decode fails
          }
        }
        logger.debug({ mimeType, allowed: config.upload.allowedMimeTypes }, 'Checking mime type');
        if (!config.upload.allowedMimeTypes.includes(mimeType)) {
          throw { status_code: 415, body: `File type ${mimeType} is not allowed` };
        }
      }

      return _res;
    },

    // Called when upload is complete
    onUploadFinish: async (_req, res, upload) => {
      logger.info(
        {
          uploadId: upload.id,
          size: upload.size,
          metadata: upload.metadata,
        },
        'Upload completed'
      );

      try {
        // Extract metadata - decode base64 if needed
        const decodeIfBase64 = (value: string | null | undefined): string | undefined => {
          if (!value) return undefined;
          // If it contains typical plaintext chars, assume it's already decoded
          if (value.includes('/') || value.includes(' ') || value.includes('@')) {
            return value;
          }
          try {
            const decoded = Buffer.from(value, 'base64').toString('utf-8');
            // Verify it decoded to something reasonable (printable ASCII)
            if (/^[\x20-\x7E]+$/.test(decoded)) {
              return decoded;
            }
          } catch {
            // Decode failed, use original
          }
          return value;
        };

        const userId = decodeIfBase64(upload.metadata?.userId);
        const filename = decodeIfBase64(upload.metadata?.filename) || 'untitled';
        const mimeType = decodeIfBase64(upload.metadata?.filetype || upload.metadata?.mimeType) || 'application/octet-stream';
        const title = decodeIfBase64(upload.metadata?.title);
        const language = decodeIfBase64(upload.metadata?.language) || 'uz';
        const summarizationType = decodeIfBase64(upload.metadata?.summarizationType) as 'lecture' | 'custdev' | undefined;

        if (!userId) {
          logger.error({ uploadId: upload.id }, 'Upload missing userId in metadata');
          return res;
        }

        // The upload.id is just userId/timestamp-random, GCS stores it at that path
        const gcsUri = `gs://${config.gcp.bucketName}/${upload.id}`;

        // Get content hash from GCS for deduplication
        const contentHash = await getFileMd5Hash(upload.id);

        // Check for duplicate file
        if (contentHash) {
          const existingLecture = await lectureService.findLectureByContentHash(userId, contentHash);

          if (existingLecture) {
            logger.info(
              {
                uploadId: upload.id,
                existingLectureId: existingLecture.id,
                contentHash
              },
              'Duplicate file detected, returning existing lecture'
            );

            // Delete the duplicate file from GCS to save space
            try {
              await deleteFile(upload.id);
              logger.info({ uploadId: upload.id }, 'Deleted duplicate file from GCS');
            } catch (deleteError) {
              logger.warn({ error: deleteError, uploadId: upload.id }, 'Failed to delete duplicate file');
            }

            // Return the existing lecture ID
            res.setHeader('X-Lecture-Id', existingLecture.id);
            res.setHeader('X-Duplicate', 'true');
            return res;
          }
        }

        // Create new lecture record
        const lecture = await lectureService.createLecture({
          userId,
          title: title ?? undefined,
          originalFilename: filename,
          gcsUri,
          fileSizeBytes: upload.size || 0,
          mimeType,
          language,
          summarizationType: summarizationType || 'lecture',
          contentHash: contentHash ?? undefined,
        });

        logger.info(
          { uploadId: upload.id, lectureId: lecture.id, contentHash },
          'Lecture created from upload'
        );

        // Queue audio extraction job
        await addAudioExtractionJob({
          lectureId: lecture.id,
          gcsUri,
          mimeType,
        });

        // Set response header with lecture ID
        res.setHeader('X-Lecture-Id', lecture.id);
      } catch (error) {
        logger.error({ error, uploadId: upload.id }, 'Failed to process upload completion');
      }

      return res;
    },

    // Called when there's an error
    onIncomingRequest: async (req, _res, _uploadId) => {
      logger.debug(
        {
          method: req.method,
          path: req.url,
        },
        'Incoming tus request'
      );
    },
  });

  logger.info('Tus server initialized');

  return tusServer;
}

// ============================================
// EXPRESS HANDLER
// ============================================

// Cache the handler to avoid creating new ones on each route
let cachedHandler: ((req: Request, res: Response) => Promise<void>) | null = null;

/**
 * Patterns that indicate the upload session has expired or is corrupted
 * These errors should be converted to 404 responses to tell the client to restart
 * IMPORTANT: These patterns should be specific enough to avoid false positives
 */
const SESSION_EXPIRED_PATTERNS = [
  // GCS store metadata bug
  "Cannot destructure property 'size' of 'metadata.metadata'",
  "metadata.metadata",
  // GCS object errors
  "No such object",
  "does not exist in bucket",
  // Redis/store errors for existing uploads
  "Upload not found",
  "upload not found",
  // Session-specific
  "session expired",
  "upload expired",
  "upload corrupted",
  // File system errors (temp file deleted)
  "ENOENT",
];

/**
 * Check if error indicates the upload session has expired or is corrupted
 * This happens when Cloud Run restarts mid-upload and GCS object metadata is incomplete
 * See: https://github.com/tus/tus-node-server/issues/521
 */
function isSessionExpiredError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  return SESSION_EXPIRED_PATTERNS.some(pattern =>
    lowerMessage.includes(pattern.toLowerCase())
  );
}

/**
 * Send a standardized session expired response
 * This tells the client to restart the upload from scratch
 */
function sendSessionExpiredResponse(res: Response, message?: string): void {
  if (!res.headersSent) {
    res.status(404).json({
      success: false,
      error: {
        code: 'UPLOAD_NOT_FOUND',
        message: message || 'Upload session expired or corrupted. Please start a new upload.',
      },
    });
  }
}

/**
 * Safely handle TUS errors and send appropriate response
 * IMPORTANT: All session-related errors return 404 with UPLOAD_NOT_FOUND
 * This allows the client to detect and automatically restart the upload
 */
function handleTusError(error: unknown, req: Request, res: Response): void {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Check if this is a session expired/corrupted error
  // These should all return 404 to signal client to restart
  if (isSessionExpiredError(error)) {
    logger.warn(
      { method: req.method, url: req.url, error: errorMessage },
      'Upload session expired or corrupted - client should restart upload'
    );
    sendSessionExpiredResponse(res);
    return;
  }

  // Check if the error object has a status code (TUS library errors)
  const errorWithStatus = error as { status_code?: number; body?: string };
  if (errorWithStatus.status_code === 404) {
    logger.warn(
      { method: req.method, url: req.url },
      'Upload not found (404 from TUS)'
    );
    sendSessionExpiredResponse(res);
    return;
  }

  // For any other 5xx errors during PATCH (chunk upload), treat as potentially recoverable
  // but still provide a clear error code for the client
  if (req.method === 'PATCH') {
    logger.error(
      { error: errorMessage, method: req.method, url: req.url },
      'Error during chunk upload'
    );
    if (!res.headersSent) {
      // Return 500 but with a clear error structure that client can parse
      res.status(500).json({
        success: false,
        error: {
          code: 'CHUNK_UPLOAD_ERROR',
          message: 'Something went wrong receiving the file. Please retry.',
          retryable: true,
        },
      });
    }
    return;
  }

  // Generic error handler for other cases
  logger.error({ error: errorMessage, method: req.method, url: req.url }, 'TUS handler error');
  if (!res.headersSent) {
    res.status(500).json({
      success: false,
      error: {
        code: 'UPLOAD_ERROR',
        message: 'Upload processing failed',
      },
    });
  }
}

/**
 * Express middleware handler for tus uploads
 */
export function getTusHandler() {
  if (cachedHandler) {
    return cachedHandler;
  }

  const server = createTusServer();

  const handler = async (req: Request, res: Response): Promise<void> => {
    try {
      logger.debug({ method: req.method, url: req.url }, 'TUS handler invoked');

      // Extract user ID from authenticated request and add to metadata
      const userId = (req as Request & { user?: { id: string } }).user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required for uploads',
          },
        });
        return;
      }

      // For POST requests (creating uploads), inject userId into metadata
      if (req.method === 'POST') {
        const uploadMetadata = req.headers['upload-metadata'];
        if (uploadMetadata && typeof uploadMetadata === 'string') {
          // Parse existing metadata
          const metadata = parseUploadMetadata(uploadMetadata);
          metadata.userId = userId;

          // Rebuild metadata header
          req.headers['upload-metadata'] = buildUploadMetadata(metadata);
        } else {
          req.headers['upload-metadata'] = buildUploadMetadata({ userId });
        }
      }

      // Handle the request with Promise wrapper to catch sync errors from TUS
      logger.debug({ method: req.method }, 'Passing to TUS server');

      await Promise.resolve(server.handle(req, res)).catch((error) => {
        handleTusError(error, req, res);
      });

      logger.debug({ method: req.method }, 'TUS server handled request');
    } catch (error) {
      handleTusError(error, req, res);
    }
  };

  cachedHandler = handler;
  return handler;
}

// ============================================
// HELPERS
// ============================================

/**
 * Parse tus Upload-Metadata header
 * Format: key1 base64value1,key2 base64value2
 */
function parseUploadMetadata(header: string): Record<string, string> {
  const metadata: Record<string, string> = {};

  if (!header) return metadata;

  const pairs = header.split(',');
  for (const pair of pairs) {
    const [key, value] = pair.trim().split(' ');
    if (key && value) {
      try {
        metadata[key] = Buffer.from(value, 'base64').toString('utf-8');
      } catch {
        metadata[key] = value;
      }
    } else if (key) {
      metadata[key] = '';
    }
  }

  return metadata;
}

/**
 * Build tus Upload-Metadata header
 */
function buildUploadMetadata(metadata: Record<string, string>): string {
  return Object.entries(metadata)
    .map(([key, value]) => `${key} ${Buffer.from(value).toString('base64')}`)
    .join(',');
}

/**
 * Get upload info by ID
 */
export async function getUploadInfo(uploadId: string): Promise<Upload | null> {
  try {
    const server = createTusServer();
    const upload = await server.datastore.getUpload(uploadId);
    return upload;
  } catch {
    return null;
  }
}

/**
 * Delete an upload
 */
export async function deleteUpload(uploadId: string): Promise<void> {
  try {
    const server = createTusServer();
    await server.datastore.remove(uploadId);
    logger.info({ uploadId }, 'Upload deleted');
  } catch (error) {
    logger.error({ error, uploadId }, 'Failed to delete upload');
  }
}
