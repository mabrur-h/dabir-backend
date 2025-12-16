import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  API_VERSION: z.string().default('v1'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis (supports redis:// and rediss:// schemes)
  REDIS_URL: z.string().refine(
    (url) => url.startsWith('redis://') || url.startsWith('rediss://'),
    { message: 'Must be a valid Redis URL (redis:// or rediss://)' }
  ),

  // Google Cloud
  GCP_PROJECT_ID: z.string(),
  GCP_REGION: z.string().default('us-central1'),
  GCS_BUCKET_NAME: z.string(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),

  // Gemini
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('60000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('100'),
  // Upload rate limiting (per user)
  UPLOAD_RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('3600000'), // 1 hour
  UPLOAD_RATE_LIMIT_MAX: z.string().transform(Number).default('10'), // 10 uploads per hour

  // File Upload
  MAX_FILE_SIZE_BYTES: z.string().transform(Number).default('5368709120'),
  ALLOWED_MIME_TYPES: z.string().default('audio/mpeg,audio/wav,audio/flac,video/mp4'),

  // FFmpeg
  FFMPEG_PATH: z.string().optional(),

  // Telegram Bot
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_WEBHOOK_URL: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Payment (Payme)
  PAYME_MERCHANT_ID: z.string().optional(),
  PAYME_SECRET_KEY: z.string().optional(),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
};

export const env = parseEnv();

export const config = {
  server: {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    apiVersion: env.API_VERSION,
    isDev: env.NODE_ENV === 'development',
    isProd: env.NODE_ENV === 'production',
  },

  database: {
    url: env.DATABASE_URL,
  },

  redis: {
    url: env.REDIS_URL,
  },

  gcp: {
    projectId: env.GCP_PROJECT_ID,
    region: env.GCP_REGION,
    bucketName: env.GCS_BUCKET_NAME,
    credentials: env.GOOGLE_APPLICATION_CREDENTIALS,
  },

  gemini: {
    model: env.GEMINI_MODEL,
  },

  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    refreshSecret: env.JWT_REFRESH_SECRET,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  },

  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
    upload: {
      windowMs: env.UPLOAD_RATE_LIMIT_WINDOW_MS,
      max: env.UPLOAD_RATE_LIMIT_MAX,
    },
  },

  upload: {
    maxFileSizeBytes: env.MAX_FILE_SIZE_BYTES,
    allowedMimeTypes: env.ALLOWED_MIME_TYPES.split(','),
  },

  ffmpeg: {
    path: env.FFMPEG_PATH,
  },

  telegram: {
    botToken: env.TELEGRAM_BOT_TOKEN,
    botWebhookUrl: env.TELEGRAM_BOT_WEBHOOK_URL,
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
  },

  logging: {
    level: env.LOG_LEVEL,
  },

  payme: {
    merchantId: env.PAYME_MERCHANT_ID,
    secretKey: env.PAYME_SECRET_KEY,
  },
} as const;

export type Config = typeof config;
