import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as authService from '../../services/auth/auth.service.js';
import type { AuthenticatedRequest } from '../../types/index.js';

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
