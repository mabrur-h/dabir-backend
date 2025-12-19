import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { Storage } from '@google-cloud/storage';
import { config } from '../../config/index.js';
import { createLogger } from '../../utils/logger.js';
import * as lectureService from '../../services/lecture/lecture.service.js';
import { addAudioExtractionJob } from '../../services/queue/queue.service.js';
import type { AuthenticatedRequest } from '../../types/index.js';

const logger = createLogger('simple-upload-controller');

// Validation schema
const uploadMetadataSchema = z.object({
  language: z.enum(['uz', 'ru', 'en']).optional().default('uz'),
  summarizationType: z.enum(['lecture', 'custdev']).optional().default('lecture'),
  title: z.string().max(500).optional(),
});

/**
 * Check if a MIME type is allowed, handling codec parameters like "audio/ogg; codecs=opus"
 */
function isAllowedMimeType(mimeType: string): boolean {
  // Extract base MIME type (before any semicolon for codec params)
  const baseMimeType = (mimeType.split(';')[0] ?? mimeType).trim();
  return config.upload.allowedMimeTypes.includes(baseMimeType);
}

// Multer configuration for memory storage
const storage = multer.memoryStorage();
export const upload = multer({
  storage,
  limits: {
    fileSize: config.upload.maxFileSizeBytes,
  },
  fileFilter: (_req, file, cb) => {
    if (isAllowedMimeType(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type ' + file.mimetype + ' is not allowed'));
    }
  },
});

/**
 * POST /api/v1/lectures/upload
 * Simple multipart file upload (alternative to TUS for smaller files)
 */
export async function uploadFile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const file = req.file;

    if (!file) {
      res.status(400).json({
        success: false,
        error: {
          code: 'NO_FILE',
          message: 'No file uploaded',
        },
      });
      return;
    }

    logger.info({
      userId: user.id,
      filename: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
    }, 'Processing simple upload');

    // Parse metadata from form fields
    const metadata = uploadMetadataSchema.parse(req.body);

    // Upload to GCS
    const gcsStorage = new Storage({
      projectId: config.gcp.projectId,
      keyFilename: config.gcp.credentials,
    });
    const bucket = gcsStorage.bucket(config.gcp.bucketName);

    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 10);
    const gcsPath = user.id + '/' + timestamp + '-' + randomId;

    const gcsFile = bucket.file(gcsPath);
    await gcsFile.save(file.buffer, {
      contentType: file.mimetype,
      metadata: {
        originalFilename: file.originalname,
      },
    });

    const gcsUri = 'gs://' + config.gcp.bucketName + '/' + gcsPath;
    logger.info({ gcsUri }, 'File uploaded to GCS');

    // Create lecture record
    const lecture = await lectureService.createLecture({
      userId: user.id,
      title: metadata.title,
      originalFilename: file.originalname,
      gcsUri,
      fileSizeBytes: file.size,
      mimeType: file.mimetype,
      language: metadata.language,
      summarizationType: metadata.summarizationType,
    });

    logger.info({ lectureId: lecture.id }, 'Lecture created');

    // Queue audio extraction job
    await addAudioExtractionJob({
      lectureId: lecture.id,
      gcsUri,
      mimeType: file.mimetype,
    });

    res.status(201).json({
      success: true,
      data: {
        lecture: {
          id: lecture.id,
          title: lecture.title,
          status: lecture.status,
          createdAt: lecture.createdAt,
        },
      },
    });
  } catch (error) {
    logger.error({ error }, 'Simple upload failed');
    next(error);
  }
}
