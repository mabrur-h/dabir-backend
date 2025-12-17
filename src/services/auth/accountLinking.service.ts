import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { redisConnection } from '../queue/queue.service.js';
import { createLogger } from '../../utils/logger.js';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from '../../utils/errors.js';
import { formatUserResponse, type UserResponse } from './auth.service.js';

const logger = createLogger('account-linking');

// Redis key prefixes
const LINK_TOKEN_PREFIX = 'account_link:';
const LINK_TOKEN_TTL = 300; // 5 minutes

// Link token types
export type LinkType = 'telegram_to_google' | 'google_to_telegram';

interface LinkTokenData {
  userId: string;
  linkType: LinkType;
  createdAt: number;
}

// ============================================
// TOKEN MANAGEMENT
// ============================================

/**
 * Generate a secure link token for account linking
 */
function generateLinkToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Create a link token for initiating account linking
 * @param userId - The user's ID who wants to link their account
 * @param linkType - The type of linking operation
 * @returns The generated token
 */
export async function createLinkToken(
  userId: string,
  linkType: LinkType
): Promise<string> {
  const token = generateLinkToken();
  const data: LinkTokenData = {
    userId,
    linkType,
    createdAt: Date.now(),
  };

  const key = `${LINK_TOKEN_PREFIX}${token}`;
  await redisConnection.setex(key, LINK_TOKEN_TTL, JSON.stringify(data));

  logger.info({ userId, linkType }, 'Link token created');

  return token;
}

/**
 * Verify and consume a link token
 * @param token - The link token to verify
 * @returns The token data if valid
 */
export async function verifyLinkToken(token: string): Promise<LinkTokenData> {
  const key = `${LINK_TOKEN_PREFIX}${token}`;
  const data = await redisConnection.get(key);

  if (!data) {
    throw new UnauthorizedError('Invalid or expired link token', 'INVALID_LINK_TOKEN');
  }

  // Delete the token after use (one-time use)
  await redisConnection.del(key);

  const tokenData = JSON.parse(data) as LinkTokenData;
  logger.info({ userId: tokenData.userId, linkType: tokenData.linkType }, 'Link token verified');

  return tokenData;
}

/**
 * Invalidate a link token without using it
 */
export async function invalidateLinkToken(token: string): Promise<void> {
  const key = `${LINK_TOKEN_PREFIX}${token}`;
  await redisConnection.del(key);
}

// ============================================
// ACCOUNT LINKING OPERATIONS
// ============================================

/**
 * Initialize Telegram linking for a Google-authenticated user
 * Returns a deep link URL for the Telegram bot
 */
export async function initTelegramLink(
  userId: string,
  botUsername: string
): Promise<{ token: string; deepLink: string }> {
  // Verify user exists and has Google auth
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });

  if (!user) {
    throw new NotFoundError('User not found', 'USER_NOT_FOUND');
  }

  if (!user.googleId) {
    throw new BadRequestError(
      'User must be authenticated with Google to link Telegram',
      'GOOGLE_AUTH_REQUIRED'
    );
  }

  if (user.telegramId) {
    throw new ConflictError(
      'Telegram account already linked',
      'TELEGRAM_ALREADY_LINKED'
    );
  }

  const token = await createLinkToken(userId, 'google_to_telegram');
  const deepLink = `https://t.me/${botUsername}?start=link_${token}`;

  return { token, deepLink };
}

/**
 * Initialize Google linking for a Telegram-authenticated user
 * Returns a token that should be passed through Google OAuth callback
 */
export async function initGoogleLink(userId: string): Promise<{ token: string }> {
  // Verify user exists and has Telegram auth
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });

  if (!user) {
    throw new NotFoundError('User not found', 'USER_NOT_FOUND');
  }

  if (!user.telegramId) {
    throw new BadRequestError(
      'User must be authenticated with Telegram to link Google',
      'TELEGRAM_AUTH_REQUIRED'
    );
  }

  if (user.googleId) {
    throw new ConflictError(
      'Google account already linked',
      'GOOGLE_ALREADY_LINKED'
    );
  }

  const token = await createLinkToken(userId, 'telegram_to_google');

  return { token };
}

/**
 * Complete Telegram linking via bot
 * Called when user clicks the deep link in Telegram
 */
export async function completeTelegramLink(
  token: string,
  telegramUser: {
    telegramId: number;
    username?: string;
    firstName?: string;
    lastName?: string;
    languageCode?: string;
    isPremium?: boolean;
    photoUrl?: string;
  }
): Promise<{ user: UserResponse; merged: boolean }> {
  // Verify the token
  const tokenData = await verifyLinkToken(token);

  if (tokenData.linkType !== 'google_to_telegram') {
    throw new BadRequestError('Invalid link token type', 'INVALID_LINK_TYPE');
  }

  // Check if this Telegram account is already linked to another user
  const existingTelegramUser = await db.query.users.findFirst({
    where: eq(schema.users.telegramId, telegramUser.telegramId),
  });

  if (existingTelegramUser) {
    if (existingTelegramUser.id === tokenData.userId) {
      throw new ConflictError(
        'This Telegram account is already linked to your account',
        'TELEGRAM_ALREADY_LINKED'
      );
    }

    // Telegram account exists on different user - offer merge
    // For now, we'll merge the accounts (Telegram user data into Google user)
    const mergeResult = await mergeAccounts(
      tokenData.userId, // target (Google account)
      existingTelegramUser.id, // source (Telegram account)
      telegramUser
    );

    return { user: mergeResult, merged: true };
  }

  // Link Telegram to the Google user
  const [updatedUser] = await db
    .update(schema.users)
    .set({
      telegramId: telegramUser.telegramId,
      telegramUsername: telegramUser.username,
      telegramFirstName: telegramUser.firstName,
      telegramLastName: telegramUser.lastName,
      telegramLanguageCode: telegramUser.languageCode,
      telegramIsPremium: telegramUser.isPremium ?? false,
      telegramPhotoUrl: telegramUser.photoUrl,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, tokenData.userId))
    .returning();

  if (!updatedUser) {
    throw new NotFoundError('User not found', 'USER_NOT_FOUND');
  }

  logger.info(
    { userId: tokenData.userId, telegramId: telegramUser.telegramId },
    'Telegram account linked successfully'
  );

  return { user: formatUserResponse(updatedUser), merged: false };
}

/**
 * Complete Google linking
 * Called after Google OAuth when a link token is present
 */
export async function completeGoogleLink(
  token: string,
  googleData: {
    googleId: string;
    email?: string;
    name?: string;
    picture?: string;
  }
): Promise<{ user: UserResponse; merged: boolean }> {
  // Verify the token
  const tokenData = await verifyLinkToken(token);

  if (tokenData.linkType !== 'telegram_to_google') {
    throw new BadRequestError('Invalid link token type', 'INVALID_LINK_TYPE');
  }

  // Check if this Google account is already linked to another user
  const existingGoogleUser = await db.query.users.findFirst({
    where: eq(schema.users.googleId, googleData.googleId),
  });

  if (existingGoogleUser) {
    if (existingGoogleUser.id === tokenData.userId) {
      throw new ConflictError(
        'This Google account is already linked to your account',
        'GOOGLE_ALREADY_LINKED'
      );
    }

    // Google account exists on different user - merge accounts
    const mergeResult = await mergeAccounts(
      existingGoogleUser.id, // target (Google account - keep this one)
      tokenData.userId, // source (Telegram account)
      undefined,
      googleData
    );

    return { user: mergeResult, merged: true };
  }

  // Link Google to the Telegram user
  const [updatedUser] = await db
    .update(schema.users)
    .set({
      googleId: googleData.googleId,
      email: googleData.email?.toLowerCase(),
      name: googleData.name,
      profilePhotoUrl: googleData.picture,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, tokenData.userId))
    .returning();

  if (!updatedUser) {
    throw new NotFoundError('User not found', 'USER_NOT_FOUND');
  }

  logger.info(
    { userId: tokenData.userId, googleId: googleData.googleId },
    'Google account linked successfully'
  );

  return { user: formatUserResponse(updatedUser), merged: false };
}

// ============================================
// ACCOUNT UNLINKING
// ============================================

/**
 * Unlink Google account from user
 */
export async function unlinkGoogle(userId: string): Promise<UserResponse> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });

  if (!user) {
    throw new NotFoundError('User not found', 'USER_NOT_FOUND');
  }

  if (!user.googleId) {
    throw new BadRequestError('Google account not linked', 'GOOGLE_NOT_LINKED');
  }

  // Ensure user has another auth method
  if (!user.telegramId) {
    throw new BadRequestError(
      'Cannot unlink Google - it is your only authentication method. Link Telegram first.',
      'CANNOT_UNLINK_ONLY_AUTH'
    );
  }

  const [updatedUser] = await db
    .update(schema.users)
    .set({
      googleId: null,
      email: null, // Also clear email as it came from Google
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, userId))
    .returning();

  if (!updatedUser) {
    throw new NotFoundError('User not found', 'USER_NOT_FOUND');
  }

  logger.info({ userId }, 'Google account unlinked');

  return formatUserResponse(updatedUser);
}

/**
 * Unlink Telegram account from user
 */
export async function unlinkTelegram(userId: string): Promise<UserResponse> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });

  if (!user) {
    throw new NotFoundError('User not found', 'USER_NOT_FOUND');
  }

  if (!user.telegramId) {
    throw new BadRequestError('Telegram account not linked', 'TELEGRAM_NOT_LINKED');
  }

  // Ensure user has another auth method
  if (!user.googleId) {
    throw new BadRequestError(
      'Cannot unlink Telegram - it is your only authentication method. Link Google first.',
      'CANNOT_UNLINK_ONLY_AUTH'
    );
  }

  const [updatedUser] = await db
    .update(schema.users)
    .set({
      telegramId: null,
      telegramUsername: null,
      telegramFirstName: null,
      telegramLastName: null,
      telegramLanguageCode: null,
      telegramIsPremium: false,
      telegramPhotoUrl: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, userId))
    .returning();

  if (!updatedUser) {
    throw new NotFoundError('User not found', 'USER_NOT_FOUND');
  }

  logger.info({ userId }, 'Telegram account unlinked');

  return formatUserResponse(updatedUser);
}

// ============================================
// ACCOUNT MERGING
// ============================================

/**
 * Merge two accounts into one
 * All data from sourceUserId is moved to targetUserId
 * The source account is then deleted
 */
async function mergeAccounts(
  targetUserId: string,
  sourceUserId: string,
  telegramData?: {
    telegramId: number;
    username?: string;
    firstName?: string;
    lastName?: string;
    languageCode?: string;
    isPremium?: boolean;
    photoUrl?: string;
  },
  googleData?: {
    googleId: string;
    email?: string;
    name?: string;
    picture?: string;
  }
): Promise<UserResponse> {
  logger.info({ targetUserId, sourceUserId }, 'Starting account merge');

  // Get both users
  const [targetUser, sourceUser] = await Promise.all([
    db.query.users.findFirst({ where: eq(schema.users.id, targetUserId) }),
    db.query.users.findFirst({ where: eq(schema.users.id, sourceUserId) }),
  ]);

  if (!targetUser || !sourceUser) {
    throw new NotFoundError('One or both users not found', 'USER_NOT_FOUND');
  }

  // Move all related data from source to target
  await db.transaction(async (tx) => {
    // Move lectures
    await tx
      .update(schema.lectures)
      .set({ userId: targetUserId })
      .where(eq(schema.lectures.userId, sourceUserId));

    // Move folders
    await tx
      .update(schema.folders)
      .set({ userId: targetUserId })
      .where(eq(schema.folders.userId, sourceUserId));

    // Move tags
    await tx
      .update(schema.tags)
      .set({ userId: targetUserId })
      .where(eq(schema.tags.userId, sourceUserId));

    // Move subscription (if source has one and target doesn't, or merge minutes)
    const [targetSub, sourceSub] = await Promise.all([
      tx.query.userSubscriptions.findFirst({
        where: eq(schema.userSubscriptions.userId, targetUserId),
      }),
      tx.query.userSubscriptions.findFirst({
        where: eq(schema.userSubscriptions.userId, sourceUserId),
      }),
    ]);

    if (sourceSub) {
      if (targetSub) {
        // Merge bonus minutes from source to target
        await tx
          .update(schema.userSubscriptions)
          .set({
            bonusMinutes: targetSub.bonusMinutes + sourceSub.bonusMinutes,
            updatedAt: new Date(),
          })
          .where(eq(schema.userSubscriptions.id, targetSub.id));

        // Update minute transactions that reference source subscription to point to target subscription
        // This must be done BEFORE deleting source subscription due to foreign key constraint
        await tx
          .update(schema.minuteTransactions)
          .set({ subscriptionId: targetSub.id })
          .where(eq(schema.minuteTransactions.subscriptionId, sourceSub.id));

        // Delete source subscription (now safe since no transactions reference it)
        await tx
          .delete(schema.userSubscriptions)
          .where(eq(schema.userSubscriptions.id, sourceSub.id));
      } else {
        // Move source subscription to target
        await tx
          .update(schema.userSubscriptions)
          .set({ userId: targetUserId })
          .where(eq(schema.userSubscriptions.id, sourceSub.id));
      }
    }

    // Move minute transactions (update userId for all remaining transactions)
    await tx
      .update(schema.minuteTransactions)
      .set({ userId: targetUserId })
      .where(eq(schema.minuteTransactions.userId, sourceUserId));

    // Move payments
    await tx
      .update(schema.payments)
      .set({ userId: targetUserId })
      .where(eq(schema.payments.userId, sourceUserId));

    // Revoke source user's refresh tokens
    await tx
      .update(schema.refreshTokens)
      .set({ revoked: true })
      .where(eq(schema.refreshTokens.userId, sourceUserId));

    // Update target user with linked account info
    const updateData: Partial<typeof schema.users.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (telegramData) {
      updateData.telegramId = telegramData.telegramId;
      updateData.telegramUsername = telegramData.username;
      updateData.telegramFirstName = telegramData.firstName;
      updateData.telegramLastName = telegramData.lastName;
      updateData.telegramLanguageCode = telegramData.languageCode;
      updateData.telegramIsPremium = telegramData.isPremium ?? false;
      updateData.telegramPhotoUrl = telegramData.photoUrl;
    }

    if (googleData) {
      updateData.googleId = googleData.googleId;
      updateData.email = googleData.email?.toLowerCase();
      if (googleData.name && !targetUser.name) {
        updateData.name = googleData.name;
      }
      if (googleData.picture && !targetUser.profilePhotoUrl) {
        updateData.profilePhotoUrl = googleData.picture;
      }
    }

    // Delete source user FIRST to free up unique constraints (telegramId, googleId, email)
    // This must happen before updating target user to avoid unique constraint violations
    await tx.delete(schema.users).where(eq(schema.users.id, sourceUserId));

    // Now update target user with linked account info (unique fields are now free)
    await tx
      .update(schema.users)
      .set(updateData)
      .where(eq(schema.users.id, targetUserId));
  });

  // Get updated target user
  const updatedUser = await db.query.users.findFirst({
    where: eq(schema.users.id, targetUserId),
  });

  if (!updatedUser) {
    throw new Error('Failed to retrieve merged user');
  }

  logger.info(
    { targetUserId, sourceUserId, mergedTelegramId: telegramData?.telegramId, mergedGoogleId: googleData?.googleId },
    'Accounts merged successfully'
  );

  return formatUserResponse(updatedUser);
}

// ============================================
// QUERY HELPERS
// ============================================

/**
 * Get linked accounts status for a user
 */
export async function getLinkedAccountsStatus(userId: string): Promise<{
  google: { linked: boolean; email?: string };
  telegram: { linked: boolean; username?: string };
}> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });

  if (!user) {
    throw new NotFoundError('User not found', 'USER_NOT_FOUND');
  }

  return {
    google: {
      linked: !!user.googleId,
      email: user.email ?? undefined,
    },
    telegram: {
      linked: !!user.telegramId,
      username: user.telegramUsername ?? undefined,
    },
  };
}
