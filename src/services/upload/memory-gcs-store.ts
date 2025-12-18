/**
 * TUS DataStore that buffers chunks in memory/temp files, then uploads to GCS on completion
 *
 * Why this approach:
 * - @tus/gcs-store has bugs with metadata corruption on Cloud Run
 * - This store collects all chunks first, then does a single GCS upload
 * - Uses Redis to track upload state across Cloud Run instance changes
 * - Much simpler than trying to compose GCS files
 *
 * Limitations:
 * - Requires enough memory/disk for the file during upload
 * - Not truly resumable after server restart (but client can restart the whole upload)
 *
 * For your use case (200-300 MB files, 1000 users/day), this is optimal because:
 * - Files are uploaded in ~1 minute (not hours), so instance changes are rare
 * - Cloud Run instances have enough memory (512MB+) for buffering
 * - If upload fails, client simply restarts (your bot already handles this)
 */

import { DataStore, Upload } from '@tus/server';
import { Storage, Bucket } from '@google-cloud/storage';
import { Redis } from 'ioredis';
import { Readable } from 'stream';
import { createWriteStream, createReadStream, promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { config } from '../../config/index.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('memory-gcs-store');

// Upload metadata TTL in Redis (1 hour - uploads should complete within this time)
const UPLOAD_TTL_SECONDS = 60 * 60;

// Redis key prefix for upload metadata
const UPLOAD_KEY_PREFIX = 'tus:upload:';

// Temp directory for upload chunks
const TEMP_DIR = join(tmpdir(), 'tus-uploads');

interface UploadState {
  id: string;
  size: number;
  offset: number;
  metadata: Record<string, string>;
  creation_date: string;
  temp_file: string;
  completed: boolean;
}

/**
 * TUS DataStore using temp files + Redis state + GCS final storage
 */
export class MemoryGCSStore extends DataStore {
  private redis: Redis;
  private bucket: Bucket;
  private initialized: boolean = false;

  constructor(options: { redis: Redis; bucket: Bucket }) {
    super();
    this.redis = options.redis;
    this.bucket = options.bucket;
  }

  /**
   * Ensure temp directory exists
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.mkdir(TEMP_DIR, { recursive: true });
      this.initialized = true;
      logger.info({ tempDir: TEMP_DIR }, 'TUS temp directory initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to create temp directory');
      throw error;
    }
  }

  /**
   * Sanitize upload ID for use as filename (replace / with _)
   */
  private sanitizeIdForFilename(id: string): string {
    return id.replace(/[/\\]/g, '_');
  }

  /**
   * Create a new upload
   */
  override async create(upload: Upload): Promise<Upload> {
    logger.debug({ uploadId: upload.id, size: upload.size }, 'Creating upload...');

    try {
      await this.ensureInitialized();
    } catch (initError) {
      logger.error({ error: initError }, 'Failed to initialize temp directory');
      throw { status_code: 500, body: 'Failed to initialize upload storage' };
    }

    // Sanitize upload ID for filename (IDs can contain / which would create subdirs)
    const safeFilename = this.sanitizeIdForFilename(upload.id);
    const tempFile = join(TEMP_DIR, `${safeFilename}.tmp`);

    const state: UploadState = {
      id: upload.id,
      size: upload.size || 0,
      offset: 0,
      metadata: (upload.metadata || {}) as Record<string, string>,
      creation_date: new Date().toISOString(),
      temp_file: tempFile,
      completed: false,
    };

    // Create empty temp file
    try {
      await fs.writeFile(tempFile, Buffer.alloc(0));
      logger.debug({ tempFile }, 'Temp file created');
    } catch (fileError) {
      logger.error({ error: fileError, tempFile }, 'Failed to create temp file');
      throw { status_code: 500, body: 'Failed to create upload temp file' };
    }

    // Store state in Redis
    try {
      const key = UPLOAD_KEY_PREFIX + upload.id;
      await this.redis.setex(key, UPLOAD_TTL_SECONDS, JSON.stringify(state));
      logger.debug({ key }, 'Upload state saved to Redis');
    } catch (redisError) {
      logger.error({ error: redisError }, 'Failed to save upload state to Redis');
      // Clean up temp file
      await fs.unlink(tempFile).catch(() => {});
      throw { status_code: 500, body: 'Failed to save upload state' };
    }

    logger.info({ uploadId: upload.id, size: upload.size }, 'Upload created successfully');

    return new Upload({
      id: upload.id,
      size: upload.size,
      offset: 0,
      metadata: upload.metadata,
    });
  }

  /**
   * Get upload info from Redis
   */
  override async getUpload(id: string): Promise<Upload> {
    const state = await this.getState(id);

    return new Upload({
      id: state.id,
      size: state.size,
      offset: state.offset,
      metadata: state.metadata,
    });
  }

  /**
   * Get upload state from Redis
   */
  private async getState(id: string): Promise<UploadState> {
    const key = UPLOAD_KEY_PREFIX + id;
    const data = await this.redis.get(key);

    if (!data) {
      logger.warn({ uploadId: id }, 'Upload not found in Redis');
      throw { status_code: 404, body: 'Upload not found or expired' };
    }

    try {
      return JSON.parse(data) as UploadState;
    } catch (error) {
      logger.error({ uploadId: id, error }, 'Failed to parse upload state');
      throw { status_code: 404, body: 'Upload state corrupted' };
    }
  }

  /**
   * Save upload state to Redis
   */
  private async saveState(state: UploadState): Promise<void> {
    const key = UPLOAD_KEY_PREFIX + state.id;
    await this.redis.setex(key, UPLOAD_TTL_SECONDS, JSON.stringify(state));
  }

  /**
   * Write chunk data to temp file
   */
  override async write(
    readableStream: Readable,
    id: string,
    offset: number
  ): Promise<number> {
    await this.ensureInitialized();

    const state = await this.getState(id);

    // Verify offset matches
    if (offset !== state.offset) {
      logger.warn(
        { uploadId: id, expectedOffset: state.offset, providedOffset: offset },
        'Offset mismatch'
      );
      throw { status_code: 409, body: `Offset mismatch. Expected ${state.offset}` };
    }

    // Verify temp file exists and has correct size
    try {
      const stats = await fs.stat(state.temp_file);
      if (stats.size !== offset) {
        logger.warn(
          { uploadId: id, fileSize: stats.size, expectedOffset: offset },
          'Temp file size mismatch - upload may be corrupted'
        );
        // Try to recover by truncating to expected size
        if (stats.size > offset) {
          await fs.truncate(state.temp_file, offset);
        } else {
          // File is smaller than expected - can't recover
          throw { status_code: 409, body: 'Upload state inconsistent. Please restart upload.' };
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.warn({ uploadId: id }, 'Temp file not found - upload lost');
        // Delete from Redis and signal client to restart
        await this.remove(id);
        throw { status_code: 404, body: 'Upload not found. Please start a new upload.' };
      }
      throw error;
    }

    // Append chunk to temp file
    const writeStream = createWriteStream(state.temp_file, { flags: 'a' });
    let bytesWritten = 0;

    return new Promise((resolve, reject) => {
      readableStream.on('data', (chunk: Buffer) => {
        bytesWritten += chunk.length;
        writeStream.write(chunk);
      });

      readableStream.on('end', async () => {
        writeStream.end();

        // Update state
        state.offset = offset + bytesWritten;

        // Check if upload is complete
        if (state.offset === state.size) {
          logger.info({ uploadId: id, size: state.size }, 'Upload complete, transferring to GCS');

          try {
            // Upload to GCS
            await this.transferToGCS(state);
            state.completed = true;
          } catch (error) {
            logger.error({ uploadId: id, error }, 'Failed to transfer to GCS');
            reject({ status_code: 500, body: 'Failed to finalize upload' });
            return;
          }
        }

        await this.saveState(state);

        logger.debug(
          { uploadId: id, bytesWritten, newOffset: state.offset, totalSize: state.size },
          'Chunk written'
        );

        resolve(state.offset);
      });

      readableStream.on('error', (error) => {
        writeStream.destroy();
        logger.error({ uploadId: id, error }, 'Stream error during write');
        reject({ status_code: 500, body: 'Failed to receive chunk' });
      });

      writeStream.on('error', (error) => {
        logger.error({ uploadId: id, error }, 'Write stream error');
        reject({ status_code: 500, body: 'Failed to write chunk to temp file' });
      });
    });
  }

  /**
   * Transfer completed upload from temp file to GCS
   */
  private async transferToGCS(state: UploadState): Promise<void> {
    const gcsPath = state.id;
    const file = this.bucket.file(gcsPath);

    // Stream the temp file to GCS
    const readStream = createReadStream(state.temp_file);

    await new Promise<void>((resolve, reject) => {
      const writeStream = file.createWriteStream({
        resumable: true,
        contentType: state.metadata.filetype || 'application/octet-stream',
        metadata: {
          metadata: {
            uploadId: state.id,
            originalFilename: state.metadata.filename,
          },
        },
      });

      readStream.pipe(writeStream);

      writeStream.on('finish', () => {
        logger.info({ uploadId: state.id, gcsPath }, 'File transferred to GCS');
        resolve();
      });

      writeStream.on('error', (error) => {
        logger.error({ uploadId: state.id, error }, 'GCS upload failed');
        reject(error);
      });
    });

    // Clean up temp file
    try {
      await fs.unlink(state.temp_file);
      logger.debug({ uploadId: state.id }, 'Temp file cleaned up');
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Remove an upload (cleanup)
   */
  override async remove(id: string): Promise<void> {
    const key = UPLOAD_KEY_PREFIX + id;

    // Get state to find temp file
    try {
      const state = await this.getState(id);

      // Delete temp file
      try {
        await fs.unlink(state.temp_file);
      } catch {
        // Ignore if doesn't exist
      }

      // Delete from GCS (if it was uploaded)
      if (state.completed) {
        try {
          await this.bucket.file(id).delete();
        } catch {
          // Ignore if doesn't exist
        }
      }
    } catch {
      // State not found, try to clean up anyway
    }

    // Delete from Redis
    await this.redis.del(key);

    logger.info({ uploadId: id }, 'Upload removed');
  }

  /**
   * Declare extensions supported by this store
   */
  getUploadLength(): Promise<number> {
    return Promise.resolve(0);
  }

  /**
   * Check if upload is complete
   */
  async isComplete(id: string): Promise<boolean> {
    try {
      const state = await this.getState(id);
      return state.completed;
    } catch {
      return false;
    }
  }

  /**
   * Get the GCS URI for a completed upload
   */
  async getGcsUri(id: string): Promise<string | null> {
    try {
      const state = await this.getState(id);
      if (state.completed) {
        return `gs://${this.bucket.name}/${id}`;
      }
      return null;
    } catch {
      return null;
    }
  }
}

/**
 * Create a Redis client for the TUS store
 */
export function createRedisClient(): Redis {
  const redis = new Redis(config.redis.url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
    retryStrategy: (times) => {
      if (times > 10) {
        logger.error('Redis connection failed after 10 retries');
        return null;
      }
      return Math.min(times * 100, 3000);
    },
  });

  redis.on('error', (err) => {
    logger.error({ error: err.message }, 'Redis connection error');
  });

  redis.on('connect', () => {
    logger.info('Redis connected for TUS store');
  });

  return redis;
}
