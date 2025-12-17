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
 * POST /api/v1/auth/google
 * Authenticate with Google Sign-In
 * Creates account if user doesn't exist
 * Rate limited: 10 attempts per 15 minutes per IP
 *
 * Body: { idToken: string }
 * Response: { user, tokens, isNewUser: boolean }
 */
router.post('/google', authRateLimiter, authController.googleAuth);

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
 * Link Telegram account to current user (legacy endpoint)
 *
 * Headers: Authorization: Bearer <token>
 * Body: { telegramId: number, username?: string }
 * Response: { user }
 */
router.post('/link-telegram', authenticate, authController.linkTelegram);

// ============================================
// ACCOUNT LINKING ROUTES
// ============================================

/**
 * GET /api/v1/auth/link/status
 * Get linked accounts status for current user
 *
 * Headers: Authorization: Bearer <token>
 * Response: { google: { linked, email? }, telegram: { linked, username? } }
 */
router.get('/link/status', authenticate, authController.getLinkedAccountsStatus);

/**
 * POST /api/v1/auth/link/telegram/init
 * Initialize Telegram linking (for Google-authenticated users)
 * Returns a deep link URL to open in Telegram
 *
 * Headers: Authorization: Bearer <token>
 * Response: { token, deepLink, expiresIn }
 */
router.post('/link/telegram/init', authenticate, authController.initTelegramLink);

/**
 * POST /api/v1/auth/link/telegram/complete
 * Complete Telegram linking (called by bot)
 * Server-to-server endpoint - should be called with bot's internal auth
 *
 * Body: { token, telegramId, username?, firstName?, lastName?, languageCode?, isPremium?, photoUrl? }
 * Response: { user, merged, message }
 */
router.post('/link/telegram/complete', authRateLimiter, authController.completeTelegramLink);

/**
 * POST /api/v1/auth/link/google/init
 * Initialize Google linking (for Telegram-authenticated users)
 * Returns a token to pass through Google OAuth flow
 *
 * Headers: Authorization: Bearer <token>
 * Response: { token, expiresIn }
 */
router.post('/link/google/init', authenticate, authController.initGoogleLink);

/**
 * POST /api/v1/auth/link/google/complete
 * Complete Google linking after OAuth
 *
 * Body: { token, idToken }
 * Response: { user, merged, message }
 */
router.post('/link/google/complete', authRateLimiter, authController.completeGoogleLink);

/**
 * POST /api/v1/auth/unlink/google
 * Unlink Google account from current user
 * Requires Telegram to be linked (can't unlink only auth method)
 *
 * Headers: Authorization: Bearer <token>
 * Response: { user, message }
 */
router.post('/unlink/google', authenticate, authController.unlinkGoogle);

/**
 * POST /api/v1/auth/unlink/telegram
 * Unlink Telegram account from current user
 * Requires Google to be linked (can't unlink only auth method)
 *
 * Headers: Authorization: Bearer <token>
 * Response: { user, message }
 */
router.post('/unlink/telegram', authenticate, authController.unlinkTelegram);

export default router;
