import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { config } from '../../config/index.js';
import { UnauthorizedError } from '../../utils/errors.js';
import type { AuthenticatedRequest } from '../../types/index.js';
import type { JwtPayload } from '../../services/auth/auth.service.js';
import { db, schema } from '../../db/index.js';

/**
 * Middleware to authenticate requests using JWT
 * Extracts token from Authorization header (Bearer token)
 * Also verifies that the user still exists in the database
 */
export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedError('No authorization header provided', 'NO_AUTH_HEADER');
    }

    const parts = authHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new UnauthorizedError(
        'Invalid authorization header format. Use: Bearer <token>',
        'INVALID_AUTH_FORMAT'
      );
    }

    const token = parts[1];

    if (!token) {
      throw new UnauthorizedError('No token provided', 'NO_TOKEN');
    }

    // Verify token
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;

    // Verify user still exists in database (handles deleted users after account merge)
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, decoded.userId),
      columns: { id: true, email: true },
    });

    if (!user) {
      throw new UnauthorizedError('User no longer exists', 'USER_NOT_FOUND');
    }

    // Attach user to request
    (req as AuthenticatedRequest).user = {
      id: user.id,
      email: user.email ?? '',
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError('Invalid token', 'INVALID_TOKEN'));
      return;
    }

    if (error instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Token expired', 'TOKEN_EXPIRED'));
      return;
    }

    next(error);
  }
};

/**
 * Optional authentication middleware
 * Attaches user to request if token is valid, but doesn't fail if no token
 */
export const optionalAuthenticate = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      next();
      return;
    }

    const parts = authHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
      next();
      return;
    }

    const token = parts[1];

    // Verify token
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;

    // Attach user to request
    (req as AuthenticatedRequest).user = {
      id: decoded.userId,
      email: decoded.email ?? '',
    };

    next();
  } catch {
    // Silently continue without auth for optional authentication
    next();
  }
};

/**
 * Middleware to authenticate Telegram Bot API requests
 * Expects X-Telegram-Bot-Token header with the bot's secret token
 */
export const authenticateTelegramBot = (expectedToken: string) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const botToken = req.headers['x-telegram-bot-token'];

    if (!botToken || botToken !== expectedToken) {
      next(new UnauthorizedError('Invalid bot token', 'INVALID_BOT_TOKEN'));
      return;
    }

    next();
  };
};
