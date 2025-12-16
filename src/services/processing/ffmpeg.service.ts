import ffmpeg from 'fluent-ffmpeg';
import { createReadStream, existsSync, mkdirSync, unlinkSync } from 'fs';
import path from 'path';
import os from 'os';
import { config } from '../../config/index.js';
import { createLogger } from '../../utils/logger.js';
import * as gcsService from '../upload/gcs.service.js';

const logger = createLogger('ffmpeg-service');

// Set FFmpeg path if configured
if (config.ffmpeg.path) {
  ffmpeg.setFfmpegPath(config.ffmpeg.path);
}

// ============================================
// TYPES
// ============================================

export interface AudioExtractionResult {
  audioGcsUri: string;
  durationSeconds: number;
  format: string;
  sampleRate: number;
  channels: number;
  bitrate: number;
}

export interface MediaInfo {
  durationSeconds: number;
  format: string;
  audioCodec?: string;
  videoCodec?: string;
  sampleRate?: number;
  channels?: number;
  bitrate?: number;
}

// ============================================
// TEMP FILE MANAGEMENT
// ============================================

const TEMP_DIR = path.join(os.tmpdir(), 'uznotes-processing');

function ensureTempDir(): void {
  if (!existsSync(TEMP_DIR)) {
    mkdirSync(TEMP_DIR, { recursive: true });
  }
}

function getTempFilePath(id: string, ext: string): string {
  ensureTempDir();
  return path.join(TEMP_DIR, `${id}.${ext}`);
}

function cleanupTempFile(filePath: string): void {
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      logger.debug({ filePath }, 'Temp file cleaned up');
    }
  } catch (error) {
    logger.warn({ error, filePath }, 'Failed to cleanup temp file');
  }
}

// ============================================
// MEDIA INFO
// ============================================

/**
 * Get media file information using ffprobe
 */
export function getMediaInfo(inputPath: string): Promise<MediaInfo> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        // FFmpeg errors don't serialize well to JSON, extract the message
        const errorMessage = err.message || String(err) || 'FFprobe failed';
        logger.error({ errorMessage, inputPath }, 'FFprobe error');
        reject(new Error(`FFprobe failed: ${errorMessage}`));
        return;
      }

      const format = metadata.format;
      const audioStream = metadata.streams.find((s) => s.codec_type === 'audio');
      const videoStream = metadata.streams.find((s) => s.codec_type === 'video');

      resolve({
        durationSeconds: format.duration || 0,
        format: format.format_name || 'unknown',
        audioCodec: audioStream?.codec_name,
        videoCodec: videoStream?.codec_name,
        sampleRate: audioStream?.sample_rate ? Number(audioStream.sample_rate) : undefined,
        channels: audioStream?.channels,
        bitrate: format.bit_rate ? Number(format.bit_rate) : undefined,
      });
    });
  });
}

// ============================================
// AUDIO EXTRACTION
// ============================================

/**
 * Extract audio from video/audio file and convert to MP3
 */
export function extractAudio(
  inputPath: string,
  outputPath: string,
  options: {
    format?: 'mp3' | 'flac' | 'wav';
    sampleRate?: number;
    channels?: number;
    bitrate?: string;
  } = {}
): Promise<void> {
  const {
    format = 'mp3',
    sampleRate = 16000, // 16kHz is good for speech recognition
    channels = 1, // Mono for speech
    bitrate = '128k',
  } = options;

  return new Promise((resolve, reject) => {
    let command = ffmpeg(inputPath)
      .noVideo()
      .audioChannels(channels)
      .audioFrequency(sampleRate);

    if (format === 'mp3') {
      command = command.audioCodec('libmp3lame').audioBitrate(bitrate);
    } else if (format === 'flac') {
      command = command.audioCodec('flac');
    } else if (format === 'wav') {
      command = command.audioCodec('pcm_s16le');
    }

    command
      .output(outputPath)
      .on('start', (commandLine) => {
        logger.debug({ commandLine }, 'FFmpeg started');
      })
      .on('progress', (progress) => {
        logger.debug({ percent: progress.percent }, 'FFmpeg progress');
      })
      .on('end', () => {
        logger.info({ inputPath, outputPath }, 'Audio extraction completed');
        resolve();
      })
      .on('error', (err) => {
        const errorMessage = err.message || String(err) || 'FFmpeg conversion failed';
        logger.error({ errorMessage, inputPath }, 'FFmpeg error');
        reject(new Error(`FFmpeg failed: ${errorMessage}`));
      })
      .run();
  });
}

// ============================================
// MAIN EXTRACTION FUNCTION
// ============================================

/**
 * Extract audio from a GCS file and upload the result back to GCS
 * For pure audio files that already meet specs, skips re-encoding
 */
export async function extractAudioFromGcs(
  lectureId: string,
  gcsUri: string,
  mimeType: string
): Promise<AudioExtractionResult> {
  const { path: gcsPath } = gcsService.parseGcsUri(gcsUri);

  // Determine file extension from mime type
  const inputExt = getExtensionFromMimeType(mimeType);
  const outputFormat = 'mp3';

  // Create temp file paths
  const tempInputPath = getTempFilePath(`${lectureId}-input`, inputExt);
  const tempOutputPath = getTempFilePath(`${lectureId}-output`, outputFormat);

  try {
    // Download file from GCS
    logger.info({ lectureId, gcsUri }, 'Downloading file from GCS');
    await gcsService.downloadToFile(gcsPath, tempInputPath);

    // Get media info
    const mediaInfo = await getMediaInfo(tempInputPath);
    logger.info({ lectureId, mediaInfo }, 'Media info retrieved');

    // Check if this is a pure audio file that can skip re-encoding
    const isPureAudio = isAudioFile(mimeType);
    const needsReencoding = !isPureAudio || audioNeedsReencoding(mediaInfo);

    if (!needsReencoding) {
      // Audio file already meets specs - use as-is (passthrough)
      logger.info(
        { lectureId, mimeType, mediaInfo },
        'Audio file meets specs, skipping re-encoding (passthrough)'
      );

      // Upload original file directly to audio path
      const audioGcsPath = gcsService.generateAudioPath(lectureId, outputFormat);
      logger.info({ lectureId, audioGcsPath }, 'Uploading audio to GCS (passthrough)');

      const readStream = createReadStream(tempInputPath);
      const audioGcsUri = await gcsService.uploadStream(
        audioGcsPath,
        readStream,
        'audio/mpeg'
      );

      return {
        audioGcsUri,
        durationSeconds: Math.round(mediaInfo.durationSeconds),
        format: outputFormat,
        sampleRate: mediaInfo.sampleRate || 16000,
        channels: mediaInfo.channels || 1,
        bitrate: mediaInfo.bitrate || 128000,
      };
    }

    // Extract/convert audio (video files or audio needing re-encoding)
    logger.info(
      { lectureId, isPureAudio, needsReencoding },
      isPureAudio ? 'Audio file needs re-encoding to meet specs' : 'Extracting audio from video'
    );
    await extractAudio(tempInputPath, tempOutputPath, {
      format: outputFormat,
      sampleRate: 16000,
      channels: 1,
      bitrate: '128k',
    });

    // Upload to GCS
    const audioGcsPath = gcsService.generateAudioPath(lectureId, outputFormat);
    logger.info({ lectureId, audioGcsPath }, 'Uploading audio to GCS');

    const readStream = createReadStream(tempOutputPath);
    const audioGcsUri = await gcsService.uploadStream(
      audioGcsPath,
      readStream,
      'audio/mpeg'
    );

    // Get output file info
    const outputInfo = await getMediaInfo(tempOutputPath);

    return {
      audioGcsUri,
      durationSeconds: Math.round(outputInfo.durationSeconds),
      format: outputFormat,
      sampleRate: outputInfo.sampleRate || 16000,
      channels: outputInfo.channels || 1,
      bitrate: outputInfo.bitrate || 128000,
    };
  } finally {
    // Cleanup temp files
    cleanupTempFile(tempInputPath);
    cleanupTempFile(tempOutputPath);
  }
}

// ============================================
// AUDIO OPTIMIZATION HELPERS
// ============================================

/**
 * Check if the file is a pure audio file (not video)
 */
export function isAudioFile(mimeType: string): boolean {
  return mimeType.startsWith('audio/');
}

/**
 * Check if audio file already meets the target specs and can skip re-encoding
 * Target specs: MP3, 16kHz, mono, ~128kbps
 */
export function audioNeedsReencoding(mediaInfo: MediaInfo): boolean {
  // If not MP3 format, needs re-encoding
  const isMp3 = mediaInfo.format?.includes('mp3') || mediaInfo.audioCodec === 'mp3';
  if (!isMp3) {
    return true;
  }

  // Check sample rate - we want 16kHz for optimal speech recognition
  // Allow some tolerance (accept 16kHz or close to it)
  if (mediaInfo.sampleRate && mediaInfo.sampleRate > 24000) {
    return true;
  }

  // Check channels - we want mono
  if (mediaInfo.channels && mediaInfo.channels > 1) {
    return true;
  }

  // Audio is compatible, no re-encoding needed
  return false;
}

// ============================================
// HELPERS
// ============================================

function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/flac': 'flac',
    'audio/x-flac': 'flac',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/aac': 'aac',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'video/x-msvideo': 'avi',
    'video/x-matroska': 'mkv',
  };

  return mimeToExt[mimeType] || 'bin';
}

/**
 * Check if FFmpeg is available
 */
export function checkFfmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    ffmpeg.getAvailableFormats((err, formats) => {
      if (err) {
        logger.error({ error: err }, 'FFmpeg not available');
        resolve(false);
      } else {
        logger.info({ formatCount: Object.keys(formats).length }, 'FFmpeg available');
        resolve(true);
      }
    });
  });
}
