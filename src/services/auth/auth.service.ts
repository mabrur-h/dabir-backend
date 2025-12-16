import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { config } from '../../config/index.js';
import { createLogger } from '../../utils/logger.js';
import {
  BadRequestError,
  UnauthorizedError,
  ConflictError,
  NotFoundError,
} from '../../utils/errors.js';
import * as subscriptionService from '../subscription/subscription.service.js';

const logger = createLogger('auth-service');

const SALT_ROUNDS = 12;

// Types
export interface JwtPayload {
  userId: string;
  email?: string;
  telegramId?: number;
  authProvider: 'email' | 'telegram';
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface RegisterEmailInput {
  email: string;
  password: string;
  name?: string;
}

export interface LoginEmailInput {
  email: string;
  password: string;
}

export interface TelegramAuthInput {
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
  isPremium?: boolean;
  photoUrl?: string;
  // For Telegram Login Widget verification
  authDate?: number;
  hash?: string;
}

// Input for Telegram Mini App (WebApp) authentication
export interface TelegramWebAppAuthInput {
  telegramId: number;
  telegramUsername?: string;
  firstName: string;
  lastName?: string;
  languageCode?: string;
  isPremium?: boolean;
  photoUrl?: string;
}

export interface UserResponse {
  id: string;
  email: string | null;
  telegramId: number | null;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  telegramLastName: string | null;
  telegramLanguageCode: string | null;
  telegramIsPremium: boolean | null;
  telegramPhotoUrl: string | null;
  name: string | null;
  authProvider: string;
  createdAt: Date;
}

// ============================================
// PASSWORD HELPERS
// ============================================

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ============================================
// TOKEN HELPERS
// ============================================

function generateAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as string,
  } as jwt.SignOptions);
}

function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex');
}

async function saveRefreshToken(userId: string, token: string): Promise<void> {
  const expiresAt = new Date();
  // Parse expiresIn (e.g., "30d" -> 30 days)
  const match = config.jwt.refreshExpiresIn.match(/^(\d+)([dhms])$/);
  if (match) {
    const value = parseInt(match[1] ?? '30', 10);
    const unit = match[2];
    switch (unit) {
      case 'd':
        expiresAt.setDate(expiresAt.getDate() + value);
        break;
      case 'h':
        expiresAt.setHours(expiresAt.getHours() + value);
        break;
      case 'm':
        expiresAt.setMinutes(expiresAt.getMinutes() + value);
        break;
      case 's':
        expiresAt.setSeconds(expiresAt.getSeconds() + value);
        break;
    }
  } else {
    // Default to 30 days
    expiresAt.setDate(expiresAt.getDate() + 30);
  }

  await db.insert(schema.refreshTokens).values({
    userId,
    token,
    expiresAt,
  });
}

async function createTokens(user: {
  id: string;
  email: string | null;
  telegramId: number | null;
  authProvider: string;
}): Promise<AuthTokens> {
  const payload: JwtPayload = {
    userId: user.id,
    email: user.email ?? undefined,
    telegramId: user.telegramId ?? undefined,
    authProvider: user.authProvider as 'email' | 'telegram',
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken();

  await saveRefreshToken(user.id, refreshToken);

  return {
    accessToken,
    refreshToken,
    expiresIn: config.jwt.expiresIn,
  };
}

function formatUserResponse(user: typeof schema.users.$inferSelect): UserResponse {
  return {
    id: user.id,
    email: user.email,
    telegramId: user.telegramId,
    telegramUsername: user.telegramUsername,
    telegramFirstName: user.telegramFirstName,
    telegramLastName: user.telegramLastName,
    telegramLanguageCode: user.telegramLanguageCode,
    telegramIsPremium: user.telegramIsPremium,
    telegramPhotoUrl: user.telegramPhotoUrl,
    name: user.name,
    authProvider: user.authProvider,
    createdAt: user.createdAt,
  };
}

// ============================================
// EMAIL AUTH
// ============================================

export async function registerWithEmail(input: RegisterEmailInput): Promise<{
  user: UserResponse;
  tokens: AuthTokens;
}> {
  const { email, password, name } = input;

  // Check if user already exists
  const existingUser = await db.query.users.findFirst({
    where: eq(schema.users.email, email.toLowerCase()),
  });

  if (existingUser) {
    throw new ConflictError('User with this email already exists', 'EMAIL_EXISTS');
  }

  // Validate password strength
  if (password.length < 8) {
    throw new BadRequestError('Password must be at least 8 characters', 'WEAK_PASSWORD');
  }

  // Hash password and create user
  const passwordHash = await hashPassword(password);

  const [user] = await db
    .insert(schema.users)
    .values({
      email: email.toLowerCase(),
      passwordHash,
      name,
      authProvider: 'email',
    })
    .returning();

  if (!user) {
    throw new Error('Failed to create user');
  }

  logger.info({ userId: user.id, email: user.email }, 'User registered with email');

  // Create free subscription for new user
  try {
    await subscriptionService.createFreeSubscription(user.id);
    logger.info({ userId: user.id }, 'Free subscription created for new user');
  } catch (error) {
    logger.error({ userId: user.id, error }, 'Failed to create free subscription');
    // Don't fail registration if subscription creation fails
  }

  const tokens = await createTokens(user);

  return {
    user: formatUserResponse(user),
    tokens,
  };
}

export async function loginWithEmail(input: LoginEmailInput): Promise<{
  user: UserResponse;
  tokens: AuthTokens;
}> {
  const { email, password } = input;

  // Find user
  const user = await db.query.users.findFirst({
    where: eq(schema.users.email, email.toLowerCase()),
  });

  if (!user || !user.passwordHash) {
    throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  // Verify password
  const isValid = await verifyPassword(password, user.passwordHash);

  if (!isValid) {
    throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  logger.info({ userId: user.id, email: user.email }, 'User logged in with email');

  const tokens = await createTokens(user);

  return {
    user: formatUserResponse(user),
    tokens,
  };
}

// ============================================
// TELEGRAM AUTH
// ============================================

export async function authenticateWithTelegram(input: TelegramAuthInput): Promise<{
  user: UserResponse;
  tokens: AuthTokens;
  isNewUser: boolean;
}> {
  const { telegramId, username, firstName, lastName, languageCode, isPremium, photoUrl } = input;

  // Build name from Telegram data
  const name = [firstName, lastName].filter(Boolean).join(' ') || username || null;

  // Check if user exists
  let user = await db.query.users.findFirst({
    where: eq(schema.users.telegramId, telegramId),
  });

  let isNewUser = false;

  if (!user) {
    // Create new user with all available Telegram data
    const [newUser] = await db
      .insert(schema.users)
      .values({
        telegramId,
        telegramUsername: username,
        telegramFirstName: firstName,
        telegramLastName: lastName,
        telegramLanguageCode: languageCode,
        telegramIsPremium: isPremium ?? false,
        telegramPhotoUrl: photoUrl,
        name,
        authProvider: 'telegram',
      })
      .returning();

    if (!newUser) {
      throw new Error('Failed to create user');
    }

    user = newUser;
    isNewUser = true;

    logger.info({ userId: user.id, telegramId }, 'User registered with Telegram');

    // Create free subscription for new user
    try {
      await subscriptionService.createFreeSubscription(user.id);
      logger.info({ userId: user.id }, 'Free subscription created for new Telegram user');
    } catch (error) {
      logger.error({ userId: user.id, error }, 'Failed to create free subscription');
    }
  } else {
    // Update Telegram info if changed
    const updates: Partial<typeof schema.users.$inferInsert> = {
      updatedAt: new Date(),
    };

    let hasChanges = false;

    if (username !== undefined && user.telegramUsername !== username) {
      updates.telegramUsername = username;
      hasChanges = true;
    }
    if (firstName !== undefined && user.telegramFirstName !== firstName) {
      updates.telegramFirstName = firstName;
      hasChanges = true;
    }
    if (lastName !== undefined && user.telegramLastName !== lastName) {
      updates.telegramLastName = lastName;
      hasChanges = true;
    }
    if (languageCode !== undefined && user.telegramLanguageCode !== languageCode) {
      updates.telegramLanguageCode = languageCode;
      hasChanges = true;
    }
    if (isPremium !== undefined && user.telegramIsPremium !== isPremium) {
      updates.telegramIsPremium = isPremium;
      hasChanges = true;
    }
    if (photoUrl !== undefined && user.telegramPhotoUrl !== photoUrl) {
      updates.telegramPhotoUrl = photoUrl;
      hasChanges = true;
    }

    if (hasChanges) {
      const [updatedUser] = await db
        .update(schema.users)
        .set(updates)
        .where(eq(schema.users.id, user.id))
        .returning();

      if (updatedUser) {
        user = updatedUser;
      }
    }

    logger.info({ userId: user.id, telegramId }, 'User logged in with Telegram');
  }

  const tokens = await createTokens(user);

  return {
    user: formatUserResponse(user),
    tokens,
    isNewUser,
  };
}

/**
 * Authenticate user from Telegram Mini App (WebApp)
 * This is the secure authentication method that validates cryptographic signatures
 * from Telegram's init data. Creates a new user if one doesn't exist.
 */
export async function authenticateWithTelegramWebApp(input: TelegramWebAppAuthInput): Promise<{
  user: UserResponse;
  tokens: AuthTokens;
  isNewUser: boolean;
}> {
  const {
    telegramId,
    telegramUsername,
    firstName,
    lastName,
    languageCode,
    isPremium,
    photoUrl,
  } = input;

  // Build display name from Telegram data
  const name = [firstName, lastName].filter(Boolean).join(' ') || telegramUsername || null;

  // Check if user exists
  let user = await db.query.users.findFirst({
    where: eq(schema.users.telegramId, telegramId),
  });

  let isNewUser = false;

  if (!user) {
    // Create new user with all Telegram data
    const [newUser] = await db
      .insert(schema.users)
      .values({
        telegramId,
        telegramUsername,
        telegramFirstName: firstName,
        telegramLastName: lastName,
        telegramLanguageCode: languageCode,
        telegramIsPremium: isPremium ?? false,
        telegramPhotoUrl: photoUrl,
        name,
        authProvider: 'telegram',
      })
      .returning();

    if (!newUser) {
      throw new Error('Failed to create user');
    }

    user = newUser;
    isNewUser = true;

    logger.info(
      { userId: user.id, telegramId, username: telegramUsername },
      'User registered via Telegram Mini App'
    );

    // Create free subscription for new user
    try {
      await subscriptionService.createFreeSubscription(user.id);
      logger.info({ userId: user.id }, 'Free subscription created for new Mini App user');
    } catch (error) {
      logger.error({ userId: user.id, error }, 'Failed to create free subscription');
    }
  } else {
    // Update user's Telegram info if changed
    const updates: Partial<typeof schema.users.$inferInsert> = {
      updatedAt: new Date(),
    };

    let hasChanges = false;

    if (telegramUsername !== undefined && user.telegramUsername !== telegramUsername) {
      updates.telegramUsername = telegramUsername;
      hasChanges = true;
    }
    if (firstName && user.telegramFirstName !== firstName) {
      updates.telegramFirstName = firstName;
      hasChanges = true;
    }
    if (lastName !== undefined && user.telegramLastName !== lastName) {
      updates.telegramLastName = lastName;
      hasChanges = true;
    }
    if (languageCode !== undefined && user.telegramLanguageCode !== languageCode) {
      updates.telegramLanguageCode = languageCode;
      hasChanges = true;
    }
    if (isPremium !== undefined && user.telegramIsPremium !== isPremium) {
      updates.telegramIsPremium = isPremium;
      hasChanges = true;
    }
    if (photoUrl !== undefined && user.telegramPhotoUrl !== photoUrl) {
      updates.telegramPhotoUrl = photoUrl;
      hasChanges = true;
    }

    if (hasChanges) {
      const [updatedUser] = await db
        .update(schema.users)
        .set(updates)
        .where(eq(schema.users.id, user.id))
        .returning();

      if (updatedUser) {
        user = updatedUser;
      }
    }

    logger.info(
      { userId: user.id, telegramId, username: telegramUsername },
      'User logged in via Telegram Mini App'
    );
  }

  const tokens = await createTokens(user);

  return {
    user: formatUserResponse(user),
    tokens,
    isNewUser,
  };
}

// Verify Telegram Login Widget data (for web authentication)
export function verifyTelegramAuth(
  data: Record<string, string>,
  botToken: string
): boolean {
  const { hash, ...authData } = data;

  if (!hash) {
    return false;
  }

  // Create data check string
  const dataCheckString = Object.keys(authData)
    .sort()
    .map((key) => `${key}=${authData[key]}`)
    .join('\n');

  // Create secret key from bot token
  const secretKey = crypto.createHash('sha256').update(botToken).digest();

  // Calculate hash
  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  return calculatedHash === hash;
}

// ============================================
// TOKEN MANAGEMENT
// ============================================

export async function refreshTokens(refreshToken: string): Promise<AuthTokens> {
  // Find refresh token
  const tokenRecord = await db.query.refreshTokens.findFirst({
    where: and(
      eq(schema.refreshTokens.token, refreshToken),
      eq(schema.refreshTokens.revoked, false)
    ),
  });

  if (!tokenRecord) {
    throw new UnauthorizedError('Invalid refresh token', 'INVALID_REFRESH_TOKEN');
  }

  // Check if expired
  if (new Date() > tokenRecord.expiresAt) {
    // Revoke the expired token
    await db
      .update(schema.refreshTokens)
      .set({ revoked: true })
      .where(eq(schema.refreshTokens.id, tokenRecord.id));

    throw new UnauthorizedError('Refresh token expired', 'REFRESH_TOKEN_EXPIRED');
  }

  // Get user
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, tokenRecord.userId),
  });

  if (!user) {
    throw new UnauthorizedError('User not found', 'USER_NOT_FOUND');
  }

  // Revoke old refresh token
  await db
    .update(schema.refreshTokens)
    .set({ revoked: true })
    .where(eq(schema.refreshTokens.id, tokenRecord.id));

  // Create new tokens
  const tokens = await createTokens(user);

  logger.debug({ userId: user.id }, 'Tokens refreshed');

  return tokens;
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await db
    .update(schema.refreshTokens)
    .set({ revoked: true })
    .where(eq(schema.refreshTokens.token, refreshToken));
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await db
    .update(schema.refreshTokens)
    .set({ revoked: true })
    .where(eq(schema.refreshTokens.userId, userId));

  logger.info({ userId }, 'All refresh tokens revoked');
}

// ============================================
// USER MANAGEMENT
// ============================================

export async function getUserById(userId: string): Promise<UserResponse | null> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });

  if (!user) {
    return null;
  }

  return formatUserResponse(user);
}

export async function getUserByEmail(email: string): Promise<UserResponse | null> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.email, email.toLowerCase()),
  });

  if (!user) {
    return null;
  }

  return formatUserResponse(user);
}

export async function getUserByTelegramId(telegramId: number): Promise<UserResponse | null> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.telegramId, telegramId),
  });

  if (!user) {
    return null;
  }

  return formatUserResponse(user);
}

// Link Telegram to existing email account
export async function linkTelegramToAccount(
  userId: string,
  telegramInput: TelegramAuthInput
): Promise<UserResponse> {
  const { telegramId, username } = telegramInput;

  // Check if Telegram ID is already linked to another account
  const existingTelegramUser = await db.query.users.findFirst({
    where: eq(schema.users.telegramId, telegramId),
  });

  if (existingTelegramUser && existingTelegramUser.id !== userId) {
    throw new ConflictError(
      'This Telegram account is already linked to another user',
      'TELEGRAM_ALREADY_LINKED'
    );
  }

  // Update user with Telegram info
  const [updatedUser] = await db
    .update(schema.users)
    .set({
      telegramId,
      telegramUsername: username,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, userId))
    .returning();

  if (!updatedUser) {
    throw new NotFoundError('User not found', 'USER_NOT_FOUND');
  }

  logger.info({ userId, telegramId }, 'Telegram account linked');

  return formatUserResponse(updatedUser);
}
