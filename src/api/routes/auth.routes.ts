import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateTelegramInitData } from '../middleware/telegramAuth.middleware.js';
import { authRateLimiter } from '../middleware/rateLimit.middleware.js';

const router = Router();

// ============================================
// PUBLIC ROUTES (with auth rate limiting)
// ============================================

/**
 * POST /api/v1/auth/register
 * Register a new user with email and password
 * Rate limited: 10 attempts per 15 minutes per IP
 *
 * Body: { email: string, password: string, name?: string }
 * Response: { user, tokens: { accessToken, refreshToken, expiresIn } }
 */
router.post('/register', authRateLimiter, authController.register);

/**
 * POST /api/v1/auth/login
 * Login with email and password
 * Rate limited: 10 attempts per 15 minutes per IP
 *
 * Body: { email: string, password: string }
 * Response: { user, tokens: { accessToken, refreshToken, expiresIn } }
 */
router.post('/login', authRateLimiter, authController.login);

/**
 * POST /api/v1/auth/telegram
 * Authenticate with Telegram ID (for Telegram bot)
 * Creates account if user doesn't exist
 * Rate limited: 10 attempts per 15 minutes per IP
 *
 * Body: { telegramId: number, username?: string, firstName?: string, lastName?: string }
 * Response: { user, tokens, isNewUser: boolean }
 */
router.post('/telegram', authRateLimiter, authController.telegramAuth);

/**
 * POST /api/v1/auth/telegram/webapp
 * Authenticate with Telegram Mini App (WebApp)
 * Validates cryptographic init data signature from Telegram
 * Creates account if user doesn't exist
 * Rate limited: 10 attempts per 15 minutes per IP
 *
 * Headers: Authorization: tma <initDataRaw>
 * Response: { user, tokens, isNewUser: boolean }
 */
router.post('/telegram/webapp', authRateLimiter, validateTelegramInitData, authController.telegramWebAppAuth);

/**
 * POST /api/v1/auth/refresh
 * Refresh access token
 *
 * Body: { refreshToken: string }
 * Response: { tokens: { accessToken, refreshToken, expiresIn } }
 */
router.post('/refresh', authController.refresh);

/**
 * POST /api/v1/auth/logout
 * Logout (revoke refresh token)
 *
 * Body: { refreshToken: string }
 * Response: { message: "Logged out successfully" }
 */
router.post('/logout', authController.logout);

// ============================================
// PROTECTED ROUTES
// ============================================

/**
 * GET /api/v1/auth/me
 * Get current user info
 *
 * Headers: Authorization: Bearer <token>
 * Response: { user }
 */
router.get('/me', authenticate, authController.me);

/**
 * POST /api/v1/auth/logout-all
 * Logout from all devices (revoke all refresh tokens)
 *
 * Headers: Authorization: Bearer <token>
 * Response: { message: "Logged out from all devices" }
 */
router.post('/logout-all', authenticate, authController.logoutAll);

/**
 * POST /api/v1/auth/link-telegram
 * Link Telegram account to current user
 *
 * Headers: Authorization: Bearer <token>
 * Body: { telegramId: number, username?: string }
 * Response: { user }
 */
router.post('/link-telegram', authenticate, authController.linkTelegram);

export default router;
