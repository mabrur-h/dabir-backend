import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as authService from '../../services/auth/auth.service.js';
import * as accountLinkingService from '../../services/auth/accountLinking.service.js';
import type { AuthenticatedRequest } from '../../types/index.js';
import type { TelegramWebAppRequest } from '../middleware/telegramAuth.middleware.js';
import { config } from '../../config/index.js';

// ============================================
// VALIDATION SCHEMAS
// ============================================

export const registerEmailSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1).max(255).optional(),
});

export const loginEmailSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const telegramAuthSchema = z.object({
  telegramId: z.number().int().positive('Invalid Telegram ID'),
  username: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  languageCode: z.string().optional(),
  isPremium: z.boolean().optional(),
  photoUrl: z.string().url().optional(),
  // For Telegram Login Widget verification
  authDate: z.number().optional(),
  hash: z.string().optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const linkTelegramSchema = z.object({
  telegramId: z.number().int().positive('Invalid Telegram ID'),
  username: z.string().optional(),
});

export const googleAuthSchema = z.object({
  idToken: z.string().min(1, 'Google ID token is required'),
});

// ============================================
// CONTROLLERS
// ============================================

/**
 * POST /auth/register
 * Register a new user with email and password
 */
export async function register(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = registerEmailSchema.parse(req.body);
    const result = await authService.registerWithEmail(input);

    res.status(201).json({
      success: true,
      data: {
        user: result.user,
        tokens: result.tokens,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /auth/login
 * Login with email and password
 */
export async function login(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = loginEmailSchema.parse(req.body);
    const result = await authService.loginWithEmail(input);

    res.json({
      success: true,
      data: {
        user: result.user,
        tokens: result.tokens,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /auth/telegram
 * Authenticate with Telegram (for Telegram bot integration)
 * Creates a new account if user doesn't exist
 */
export async function telegramAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = telegramAuthSchema.parse(req.body);
    const result = await authService.authenticateWithTelegram(input);

    res.status(result.isNewUser ? 201 : 200).json({
      success: true,
      data: {
        user: result.user,
        tokens: result.tokens,
        isNewUser: result.isNewUser,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /auth/google
 * Authenticate with Google Sign-In
 * Creates a new account if user doesn't exist
 */
export async function googleAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = googleAuthSchema.parse(req.body);
    const result = await authService.authenticateWithGoogle(input);

    res.status(result.isNewUser ? 201 : 200).json({
      success: true,
      data: {
        user: result.user,
        tokens: result.tokens,
        isNewUser: result.isNewUser,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /auth/refresh
 * Refresh access token using refresh token
 */
export async function refresh(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { refreshToken } = refreshTokenSchema.parse(req.body);
    const tokens = await authService.refreshTokens(refreshToken);

    res.json({
      success: true,
      data: { tokens },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /auth/logout
 * Revoke the refresh token
 */
export async function logout(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { refreshToken } = refreshTokenSchema.parse(req.body);
    await authService.revokeRefreshToken(refreshToken);

    res.json({
      success: true,
      data: { message: 'Logged out successfully' },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /auth/logout-all
 * Revoke all refresh tokens for the user (logout from all devices)
 * Requires authentication
 */
export async function logoutAll(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    await authService.revokeAllUserTokens(user.id);

    res.json({
      success: true,
      data: { message: 'Logged out from all devices' },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /auth/me
 * Get current authenticated user
 * Requires authentication
 */
export async function me(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const userData = await authService.getUserById(user.id);

    if (!userData) {
      res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
      return;
    }

    res.json({
      success: true,
      data: { user: userData },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /auth/link-telegram
 * Link Telegram account to existing user
 * Requires authentication
 */
export async function linkTelegram(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const input = linkTelegramSchema.parse(req.body);

    const updatedUser = await authService.linkTelegramToAccount(user.id, {
      telegramId: input.telegramId,
      username: input.username,
    });

    res.json({
      success: true,
      data: { user: updatedUser },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /auth/telegram/webapp
 * Authenticate with Telegram Mini App (WebApp)
 * This endpoint validates the cryptographic init data from Telegram
 * and creates/authenticates the user
 *
 * Headers: Authorization: tma <initDataRaw>
 * Response: { user, tokens, isNewUser: boolean }
 */
export async function telegramWebAppAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // The middleware has already validated the init data and attached it to the request
    const { telegramUser } = req as TelegramWebAppRequest;

    const result = await authService.authenticateWithTelegramWebApp({
      telegramId: telegramUser.id,
      telegramUsername: telegramUser.username,
      firstName: telegramUser.first_name,
      lastName: telegramUser.last_name,
      languageCode: telegramUser.language_code,
      isPremium: telegramUser.is_premium,
      photoUrl: telegramUser.photo_url,
    });

    res.status(result.isNewUser ? 201 : 200).json({
      success: true,
      data: {
        user: result.user,
        tokens: result.tokens,
        isNewUser: result.isNewUser,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ============================================
// ACCOUNT LINKING VALIDATION SCHEMAS
// ============================================

export const completeTelegramLinkSchema = z.object({
  token: z.string().min(1, 'Link token is required'),
  telegramId: z.number().int().positive('Invalid Telegram ID'),
  username: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  languageCode: z.string().optional(),
  isPremium: z.boolean().optional(),
  photoUrl: z.string().url().optional().nullable(),
});

export const completeGoogleLinkSchema = z.object({
  token: z.string().min(1, 'Link token is required'),
  idToken: z.string().min(1, 'Google ID token is required'),
});

// ============================================
// ACCOUNT LINKING CONTROLLERS
// ============================================

/**
 * GET /auth/link/status
 * Get linked accounts status for current user
 * Requires authentication
 */
export async function getLinkedAccountsStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const status = await accountLinkingService.getLinkedAccountsStatus(user.id);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /auth/link/telegram/init
 * Initialize Telegram linking for Google-authenticated user
 * Returns a deep link URL to open Telegram bot
 * Requires authentication
 */
export async function initTelegramLink(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;

    // Get bot username from config or use default
    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'dabirbot';

    const result = await accountLinkingService.initTelegramLink(user.id, botUsername);

    res.json({
      success: true,
      data: {
        token: result.token,
        deepLink: result.deepLink,
        expiresIn: 300, // 5 minutes
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /auth/link/telegram/complete
 * Complete Telegram linking (called by bot)
 * This is a server-to-server endpoint called by the Telegram bot
 */
export async function completeTelegramLink(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = completeTelegramLinkSchema.parse(req.body);

    const result = await accountLinkingService.completeTelegramLink(input.token, {
      telegramId: input.telegramId,
      username: input.username,
      firstName: input.firstName,
      lastName: input.lastName,
      languageCode: input.languageCode,
      isPremium: input.isPremium,
      photoUrl: input.photoUrl ?? undefined,
    });

    res.json({
      success: true,
      data: {
        user: result.user,
        merged: result.merged,
        message: result.merged
          ? 'Accounts merged successfully. All your data has been combined.'
          : 'Telegram account linked successfully.',
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /auth/link/google/init
 * Initialize Google linking for Telegram-authenticated user
 * Returns a token to pass through Google OAuth flow
 * Requires authentication
 */
export async function initGoogleLink(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const result = await accountLinkingService.initGoogleLink(user.id);

    res.json({
      success: true,
      data: {
        token: result.token,
        expiresIn: 300, // 5 minutes
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /auth/link/google/complete
 * Complete Google linking after OAuth
 * Requires the link token and Google ID token
 */
export async function completeGoogleLink(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = completeGoogleLinkSchema.parse(req.body);

    // Verify Google ID token
    const { OAuth2Client } = await import('google-auth-library');
    const googleClient = new OAuth2Client(config.google.clientId);

    let googlePayload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: input.idToken,
        audience: config.google.clientId,
      });
      googlePayload = ticket.getPayload();
    } catch {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_GOOGLE_TOKEN',
          message: 'Invalid Google ID token',
        },
      });
      return;
    }

    if (!googlePayload?.sub) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_GOOGLE_TOKEN',
          message: 'Invalid Google ID token payload',
        },
      });
      return;
    }

    const result = await accountLinkingService.completeGoogleLink(input.token, {
      googleId: googlePayload.sub,
      email: googlePayload.email,
      name: googlePayload.name,
      picture: googlePayload.picture,
    });

    res.json({
      success: true,
      data: {
        user: result.user,
        merged: result.merged,
        message: result.merged
          ? 'Accounts merged successfully. All your data has been combined.'
          : 'Google account linked successfully.',
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /auth/unlink/google
 * Unlink Google account from current user
 * Requires authentication and Telegram to be linked
 */
export async function unlinkGoogle(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const updatedUser = await accountLinkingService.unlinkGoogle(user.id);

    res.json({
      success: true,
      data: {
        user: updatedUser,
        message: 'Google account unlinked successfully.',
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /auth/unlink/telegram
 * Unlink Telegram account from current user
 * Requires authentication and Google to be linked
 */
export async function unlinkTelegram(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const updatedUser = await accountLinkingService.unlinkTelegram(user.id);

    res.json({
      success: true,
      data: {
        user: updatedUser,
        message: 'Telegram account unlinked successfully.',
      },
    });
  } catch (error) {
    next(error);
  }
}
