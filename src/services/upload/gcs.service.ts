import { Storage, Bucket, File } from '@google-cloud/storage';
import { Readable } from 'stream';
import path from 'path';
import { config } from '../../config/index.js';
import { createLogger } from '../../utils/logger.js';
import { GCS_PATHS } from '../../config/constants.js';

const logger = createLogger('gcs-service');

// ============================================
// INITIALIZATION
// ============================================

let storage: Storage;
let bucket: Bucket;

export function initializeGCS(): void {
  storage = new Storage({
    projectId: config.gcp.projectId,
    keyFilename: config.gcp.credentials,
  });

  bucket = storage.bucket(config.gcp.bucketName);

  logger.info({ bucket: config.gcp.bucketName }, 'GCS initialized');
}

export function getStorage(): Storage {
  if (!storage) {
    initializeGCS();
  }
  return storage;
}

export function getBucket(): Bucket {
  if (!bucket) {
    initializeGCS();
  }
  return bucket;
}

// ============================================
// FILE OPERATIONS
// ============================================

/**
 * Generate a GCS URI for a file
 */
export function generateGcsUri(filePath: string): string {
  return `gs://${config.gcp.bucketName}/${filePath}`;
}

/**
 * Parse a GCS URI to get bucket and path
 */
export function parseGcsUri(gcsUri: string): { bucket: string; path: string } {
  const match = gcsUri.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match) {
    throw new Error(`Invalid GCS URI: ${gcsUri}`);
  }
  return {
    bucket: match[1] as string,
    path: match[2] as string,
  };
}

/**
 * Generate a unique file path for uploads
 */
export function generateUploadPath(userId: string, filename: string): string {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 10);
  const ext = path.extname(filename);
  const baseName = path.basename(filename, ext);
  const safeName = baseName.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 50);

  return `${GCS_PATHS.UPLOADS}/${userId}/${timestamp}-${randomId}-${safeName}${ext}`;
}

/**
 * Generate audio file path
 */
export function generateAudioPath(lectureId: string, format: string = 'mp3'): string {
  return `${GCS_PATHS.AUDIO}/${lectureId}.${format}`;
}

/**
 * Get a file reference
 */
export function getFile(filePath: string): File {
  return getBucket().file(filePath);
}

/**
 * Check if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  const [exists] = await getFile(filePath).exists();
  return exists;
}

/**
 * Get file metadata
 */
export async function getFileMetadata(
  filePath: string
): Promise<{ size: number; contentType: string; created: Date }> {
  const [metadata] = await getFile(filePath).getMetadata();

  return {
    size: parseInt(metadata.size as string, 10),
    contentType: metadata.contentType as string,
    created: new Date(metadata.timeCreated as string),
  };
}

/**
 * Get file MD5 hash from GCS metadata
 * GCS automatically calculates and stores MD5 hash for each uploaded file
 * Returns hex-encoded MD5 hash (32 characters)
 */
export async function getFileMd5Hash(filePath: string): Promise<string | null> {
  try {
    const [metadata] = await getFile(filePath).getMetadata();

    // GCS stores MD5 as base64-encoded string
    const md5Base64 = metadata.md5Hash;
    if (!md5Base64) {
      return null;
    }

    // Convert base64 to hex
    const md5Hex = Buffer.from(md5Base64, 'base64').toString('hex');
    return md5Hex;
  } catch (error) {
    logger.error({ error, filePath }, 'Failed to get file MD5 hash');
    return null;
  }
}

/**
 * Upload a file from buffer
 */
export async function uploadBuffer(
  filePath: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const file = getFile(filePath);

  await file.save(buffer, {
    contentType,
    resumable: false,
  });

  logger.info({ filePath, size: buffer.length }, 'File uploaded');

  return generateGcsUri(filePath);
}

/**
 * Upload a file from stream
 */
export async function uploadStream(
  filePath: string,
  stream: Readable,
  contentType: string
): Promise<string> {
  const file = getFile(filePath);

  return new Promise((resolve, reject) => {
    const writeStream = file.createWriteStream({
      contentType,
      resumable: true,
    });

    stream
      .pipe(writeStream)
      .on('finish', () => {
        logger.info({ filePath }, 'File uploaded via stream');
        resolve(generateGcsUri(filePath));
      })
      .on('error', (error) => {
        logger.error({ error, filePath }, 'Stream upload failed');
        reject(error);
      });
  });
}

/**
 * Download a file to buffer
 */
export async function downloadBuffer(filePath: string): Promise<Buffer> {
  const [buffer] = await getFile(filePath).download();
  return buffer;
}

/**
 * Download a file as stream
 */
export function downloadStream(filePath: string): Readable {
  return getFile(filePath).createReadStream();
}

/**
 * Download to local file
 */
export async function downloadToFile(gcsPath: string, localPath: string): Promise<void> {
  await getFile(gcsPath).download({ destination: localPath });
  logger.info({ gcsPath, localPath }, 'File downloaded');
}

/**
 * Delete a file
 */
export async function deleteFile(filePath: string): Promise<void> {
  try {
    await getFile(filePath).delete();
    logger.info({ filePath }, 'File deleted');
  } catch (error) {
    // Ignore if file doesn't exist
    if ((error as { code?: number }).code !== 404) {
      throw error;
    }
  }
}

/**
 * Delete multiple files
 */
export async function deleteFiles(filePaths: string[]): Promise<void> {
  await Promise.all(filePaths.map((fp) => deleteFile(fp)));
}

/**
 * Copy a file
 */
export async function copyFile(sourcePath: string, destPath: string): Promise<string> {
  await getFile(sourcePath).copy(getFile(destPath));
  logger.info({ sourcePath, destPath }, 'File copied');
  return generateGcsUri(destPath);
}

/**
 * Move a file (copy + delete)
 */
export async function moveFile(sourcePath: string, destPath: string): Promise<string> {
  await getFile(sourcePath).move(getFile(destPath));
  logger.info({ sourcePath, destPath }, 'File moved');
  return generateGcsUri(destPath);
}

// ============================================
// SIGNED URLs
// ============================================

/**
 * Generate a signed URL for download
 */
export async function getSignedDownloadUrl(
  filePath: string,
  expiresInMinutes: number = 60
): Promise<string> {
  const [url] = await getFile(filePath).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + expiresInMinutes * 60 * 1000,
  });

  return url;
}

/**
 * Generate a signed URL for upload
 */
export async function getSignedUploadUrl(
  filePath: string,
  contentType: string,
  expiresInMinutes: number = 30
): Promise<string> {
  const [url] = await getFile(filePath).getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + expiresInMinutes * 60 * 1000,
    contentType,
  });

  return url;
}

// ============================================
// BUCKET OPERATIONS
// ============================================

/**
 * List files in a directory
 */
export async function listFiles(prefix: string): Promise<string[]> {
  const [files] = await getBucket().getFiles({ prefix });
  return files.map((f) => f.name);
}

/**
 * Delete all files in a directory
 */
export async function deleteDirectory(prefix: string): Promise<void> {
  const files = await listFiles(prefix);
  await deleteFiles(files);
  logger.info({ prefix, count: files.length }, 'Directory deleted');
}

/**
 * Check bucket health
 */
export async function checkGcsHealth(): Promise<boolean> {
  try {
    const [exists] = await getBucket().exists();
    return exists;
  } catch (error) {
    logger.error({ error }, 'GCS health check failed');
    return false;
  }
}
