import rateLimit, { type Options } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import type { Request, Response } from 'express';
import { redisConnection } from '../../services/queue/queue.service.js';
import { config } from '../../config/index.js';
import type { AuthenticatedRequest } from '../../types/index.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('rate-limit');

/**
 * Key generator that uses user ID for authenticated requests
 * Falls back to IP address for unauthenticated requests
 */
const getUserKeyGenerator = (req: Request): string => {
  const authReq = req as AuthenticatedRequest;
  if (authReq.user?.id) {
    return `user:${authReq.user.id}`;
  }
  // Fallback to IP - validation is disabled since we use user ID when available
  return req.ip || req.socket.remoteAddress || 'unknown';
};

/**
 * IP-only key generator for unauthenticated routes
 * Uses X-Forwarded-For header when behind a proxy (Cloud Run)
 */
const getIpKeyGenerator = (req: Request): string => {
  // Get real IP from X-Forwarded-For if behind proxy
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor.split(',')[0];
    if (ips) return ips.trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
};

/**
 * Auth key generator that tries to extract Telegram ID from request body
 * Falls back to IP if no Telegram ID is found
 * This allows per-user rate limiting even for unauthenticated auth requests
 */
const getAuthKeyGenerator = (req: Request): string => {
  // Try to extract telegram ID from various auth request formats
  const body = req.body as Record<string, unknown>;

  // For Telegram auth: check initData or telegramId in body
  if (body?.telegramId) {
    return `tg:${body.telegramId}`;
  }

  // For initData-based auth, try to extract user ID
  if (body?.initData && typeof body.initData === 'string') {
    try {
      const params = new URLSearchParams(body.initData);
      const userParam = params.get('user');
      if (userParam) {
        const user = JSON.parse(decodeURIComponent(userParam));
        if (user?.id) {
          return `tg:${user.id}`;
        }
      }
    } catch {
      // Failed to parse, fall back to IP
    }
  }

  // Fall back to IP-based limiting
  return getIpKeyGenerator(req);
};

/**
 * Standard error response handler for rate limit exceeded
 */
const standardHandler = (req: Request, res: Response): void => {
  logger.warn({
    key: getUserKeyGenerator(req),
    path: req.path,
    method: req.method
  }, 'Rate limit exceeded');

  res.status(429).json({
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
    },
  });
};

/**
 * Create a Redis-backed rate limiter with custom prefix
 */
const createRedisRateLimiter = (
  prefix: string,
  options: Partial<Options>
) => {
  return rateLimit({
    store: new RedisStore({
      sendCommand: (...args: string[]) => redisConnection.call(...args),
      prefix,
    }),
    standardHeaders: true, // Return rate limit info in headers
    legacyHeaders: false, // Disable X-RateLimit-* headers
    keyGenerator: getUserKeyGenerator,
    handler: standardHandler,
    // Disable all validation - we handle IP normalization via Express trust proxy setting
    validate: false,
    ...options,
  });
};

/**
 * General API rate limiter
 * Applies to all API routes
 * Default: 100 requests per minute per user
 */
export const generalApiLimiter = createRedisRateLimiter('rl:api:', {
  windowMs: config.rateLimit.windowMs, // Default 1 minute
  max: config.rateLimit.maxRequests, // Default 100 requests
  message: 'Too many requests, please try again later.',
});

/**
 * Upload rate limiter (stricter)
 * Applies to video/audio upload endpoints
 * Default: 10 uploads per hour per user (configurable via env)
 */
export const uploadRateLimiter = createRedisRateLimiter('rl:upload:', {
  windowMs: config.rateLimit.upload.windowMs,
  max: config.rateLimit.upload.max,
  message: 'Too many uploads. Please wait before uploading more files.',
  handler: (req: Request, res: Response) => {
    logger.warn({
      key: getUserKeyGenerator(req),
      path: req.path
    }, 'Upload rate limit exceeded');

    res.status(429).json({
      success: false,
      error: {
        code: 'UPLOAD_RATE_LIMIT_EXCEEDED',
        message: `You have reached the upload limit. Maximum ${config.rateLimit.upload.max} uploads per hour.`,
      },
    });
  },
});

/**
 * Auth rate limiter (stricter for security)
 * Applies to login/register endpoints
 * Uses Telegram ID from request body when available, falls back to IP
 * Development: 100 attempts per 15 minutes per user/IP
 * Production: 30 attempts per 15 minutes per user/IP
 */
export const authRateLimiter = createRedisRateLimiter('rl:auth:', {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.server.isDev ? 100 : 30, // Increased from 10 since it's now per-user
  message: 'Too many authentication attempts. Please try again later.',
  keyGenerator: getAuthKeyGenerator,
  handler: (req: Request, res: Response) => {
    logger.warn({
      ip: getIpKeyGenerator(req),
      key: getAuthKeyGenerator(req),
      path: req.path
    }, 'Auth rate limit exceeded');

    res.status(429).json({
      success: false,
      error: {
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
        message: 'Too many authentication attempts. Please try again in 15 minutes.',
      },
    });
  },
});

/**
 * Burst protection limiter (very short window)
 * Prevents rapid-fire requests
 * 5 requests per second per user
 */
export const burstLimiter = createRedisRateLimiter('rl:burst:', {
  windowMs: 1000, // 1 second
  max: 5, // 5 requests per second
  message: 'Request rate too high. Please slow down.',
});
