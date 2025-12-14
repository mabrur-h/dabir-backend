import { Server as TusServer, Upload } from '@tus/server';
import { GCSStore } from '@tus/gcs-store';
import type { Request, Response } from 'express';
import { config } from '../../config/index.js';
import { createLogger } from '../../utils/logger.js';
import { GCS_PATHS } from '../../config/constants.js';
import * as lectureService from '../lecture/lecture.service.js';
import { addAudioExtractionJob } from '../queue/queue.service.js';

const logger = createLogger('tus-service');

// ============================================
// TUS SERVER SETUP
// ============================================

let tusServer: TusServer;

export function createTusServer(): TusServer {
  if (tusServer) {
    return tusServer;
  }

  // Create GCS store for tus
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const store = new GCSStore({
    bucket: config.gcp.bucketName,
    projectId: config.gcp.projectId,
    keyFilename: config.gcp.credentials,
  } as any);

  tusServer = new TusServer({
    path: '/api/v1/uploads',
    datastore: store,
    maxSize: config.upload.maxFileSizeBytes,
    respectForwardedHeaders: true,

    // Generate URL for the upload
    generateUrl: (_req, { proto, host, path, id }) => {
      return `${proto}://${host}${path}/${id}`;
    },

    // Extract metadata from upload
    namingFunction: (_req, metadata) => {
      // Use user ID and timestamp for unique naming
      const userId = metadata?.userId || 'unknown';
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 10);
      return `${GCS_PATHS.UPLOADS}/${userId}/${timestamp}-${randomId}`;
    },

    // Called when upload is created
    onUploadCreate: async (_req, _res, upload) => {
      logger.info(
        {
          uploadId: upload.id,
          size: upload.size,
          metadata: upload.metadata,
        },
        'Upload created'
      );

      // Validate file type
      const mimeType = upload.metadata?.filetype || upload.metadata?.mimeType;
      if (mimeType && !config.upload.allowedMimeTypes.includes(mimeType)) {
        throw { status_code: 415, body: `File type ${mimeType} is not allowed` };
      }

      return _res;
    },

    // Called when upload is complete
    onUploadFinish: async (req, res, upload) => {
      logger.info(
        {
          uploadId: upload.id,
          size: upload.size,
          metadata: upload.metadata,
        },
        'Upload completed'
      );

      try {
        // Extract metadata
        const userId = upload.metadata?.userId;
        const filename = upload.metadata?.filename || 'untitled';
        const mimeType = upload.metadata?.filetype || upload.metadata?.mimeType || 'application/octet-stream';
        const title = upload.metadata?.title;
        const language = upload.metadata?.language || 'uz';

        if (!userId) {
          logger.error({ uploadId: upload.id }, 'Upload missing userId in metadata');
          return res;
        }

        // Create lecture record
        const gcsUri = `gs://${config.gcp.bucketName}/${upload.id}`;

        const lecture = await lectureService.createLecture({
          userId,
          title: title ?? undefined,
          originalFilename: filename,
          gcsUri,
          fileSizeBytes: upload.size || 0,
          mimeType,
          language,
        });

        logger.info(
          { uploadId: upload.id, lectureId: lecture.id },
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

/**
 * Express middleware handler for tus uploads
 */
export function getTusHandler() {
  const server = createTusServer();

  return async (req: Request, res: Response): Promise<void> => {
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

    // Handle the request
    await server.handle(req, res);
  };
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
