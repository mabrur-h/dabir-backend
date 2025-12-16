import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../../config/index.js';
import { UnauthorizedError, BadRequestError } from '../../utils/errors.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('telegram-auth-middleware');

// Init data expires in 1 hour (in seconds)
const INIT_DATA_EXPIRY = 3600;

// Telegram User type based on Telegram Mini Apps documentation
export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
  added_to_attachment_menu?: boolean;
  allows_write_to_pm?: boolean;
}

// Telegram Chat type
export interface TelegramChat {
  id: number;
  type: 'group' | 'supergroup' | 'channel' | string;
  title: string;
  username?: string;
  photo_url?: string;
}

// Parsed Telegram Init Data
export interface TelegramInitData {
  query_id?: string;
  user?: TelegramUser;
  receiver?: TelegramUser;
  chat?: TelegramChat;
  chat_type?: string;
  chat_instance?: string;
  start_param?: string;
  can_send_after?: number;
  auth_date: number;
  hash: string;
}

// Extended request type with Telegram init data
export interface TelegramWebAppRequest extends Request {
  telegramInitData: TelegramInitData;
  telegramUser: TelegramUser;
}

/**
 * Parse URL-encoded init data string into an object
 */
function parseInitData(initDataRaw: string): Record<string, string> {
  // URLSearchParams is a global in Node.js
  const params = new globalThis.URLSearchParams(initDataRaw);
  const result: Record<string, string> = {};

  for (const [key, value] of params.entries()) {
    result[key] = value;
  }

  return result;
}

/**
 * Validate Telegram init data signature using HMAC-SHA256
 * Based on: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Telegram uses two different validation methods:
 * 1. Old method (hash field): HMAC_SHA256(HMAC_SHA256("WebAppData", bot_token), data_check_string)
 * 2. New method (signature field): Ed25519 signature (not implemented here)
 */
function validateInitDataSignature(
  initDataRaw: string,
  botToken: string
): { isValid: boolean; data: Record<string, string> } {
  logger.debug({ initDataRaw: initDataRaw.substring(0, 200) + '...' }, 'Raw init data received');
  const data = parseInitData(initDataRaw);

  // Log all received data for debugging
  logger.debug(
    {
      receivedKeys: Object.keys(data),
      hasHash: !!data.hash,
      hasSignature: !!data.signature,
      authDate: data.auth_date,
    },
    'Received init data fields'
  );

  const { hash, signature, ...dataWithoutHashAndSignature } = data;

  // Check if we have hash (old method) or signature (new method)
  if (!hash && !signature) {
    logger.debug({ hasHash: false, hasSignature: false }, 'No hash or signature in init data');
    return { isValid: false, data };
  }

  // Validate using hash method
  if (hash) {
    // Create data check string (sorted alphabetically, excluding only 'hash')
    // IMPORTANT: 'signature' field MUST be included in data check string!
    const dataCheckString = Object.keys(data)
      .filter(key => key !== 'hash')
      .sort()
      .map((key) => `${key}=${data[key]}`)
      .join('\n');

    // Create secret key: HMAC_SHA256(<bot_token>, "WebAppData")
    // Per Telegram docs: "WebAppData" is the key, bot_token is the data
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    // Calculate hash
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // Debug logging for signature validation
    logger.debug(
      {
        providedHash: hash,
        calculatedHash: calculatedHash,
        hashMatch: calculatedHash === hash,
        botTokenLength: botToken.length,
        botTokenPrefix: botToken.substring(0, 10) + '...',
        fullDataCheckString: dataCheckString,
        userValue: data.user,
        dataKeys: Object.keys(data).filter(k => k !== 'hash').sort(),
      },
      'Signature validation debug (hash method)'
    );

    if (calculatedHash === hash) {
      return { isValid: true, data };
    }
  }

  return { isValid: false, data };
}

/**
 * Parse the validated init data into a structured object
 */
function parseValidatedInitData(data: Record<string, string>): TelegramInitData {
  const result: TelegramInitData = {
    auth_date: parseInt(data.auth_date || '0', 10),
    hash: data.hash || '',
  };

  if (data.query_id) {
    result.query_id = data.query_id;
  }

  if (data.user) {
    try {
      result.user = JSON.parse(data.user) as TelegramUser;
    } catch {
      logger.warn('Failed to parse user data from init data');
    }
  }

  if (data.receiver) {
    try {
      result.receiver = JSON.parse(data.receiver) as TelegramUser;
    } catch {
      logger.warn('Failed to parse receiver data from init data');
    }
  }

  if (data.chat) {
    try {
      result.chat = JSON.parse(data.chat) as TelegramChat;
    } catch {
      logger.warn('Failed to parse chat data from init data');
    }
  }

  if (data.chat_type) {
    result.chat_type = data.chat_type;
  }

  if (data.chat_instance) {
    result.chat_instance = data.chat_instance;
  }

  if (data.start_param) {
    result.start_param = data.start_param;
  }

  if (data.can_send_after) {
    result.can_send_after = parseInt(data.can_send_after, 10);
  }

  return result;
}

/**
 * Check if the init data has expired
 */
function isInitDataExpired(authDate: number, expiresIn: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  return now - authDate > expiresIn;
}

/**
 * Middleware to validate Telegram Mini App init data
 *
 * Expects Authorization header in format: `tma <initDataRaw>`
 *
 * This middleware:
 * 1. Extracts init data from the Authorization header
 * 2. Validates the cryptographic signature using the bot token
 * 3. Checks that the data hasn't expired
 * 4. Attaches parsed init data and user to the request
 */
export const validateTelegramInitData = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  try {
    const botToken = config.telegram.botToken;

    // Debug: log the actual token being used (first 15 chars only for security)
    logger.debug({
      tokenPrefix: botToken?.substring(0, 15) + '...',
      tokenLength: botToken?.length
    }, 'Bot token info');

    if (!botToken) {
      logger.error('TELEGRAM_BOT_TOKEN not configured');
      throw new BadRequestError(
        'Telegram authentication not configured',
        'TELEGRAM_NOT_CONFIGURED'
      );
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedError(
        'Missing authorization header',
        'MISSING_AUTH_HEADER'
      );
    }

    // Check for 'tma ' prefix (Telegram Mini App)
    if (!authHeader.startsWith('tma ')) {
      throw new UnauthorizedError(
        'Invalid authorization format. Expected: tma <initData>',
        'INVALID_AUTH_FORMAT'
      );
    }

    const initDataRaw = authHeader.slice(4); // Remove 'tma ' prefix

    if (!initDataRaw) {
      throw new UnauthorizedError(
        'Missing Telegram init data',
        'MISSING_INIT_DATA'
      );
    }

    // Validate signature
    const { isValid, data } = validateInitDataSignature(initDataRaw, botToken);

    if (!isValid) {
      throw new UnauthorizedError(
        'Invalid Telegram init data signature',
        'INVALID_SIGNATURE'
      );
    }

    // Parse the validated data
    const initData = parseValidatedInitData(data);

    // Check expiration
    if (isInitDataExpired(initData.auth_date, INIT_DATA_EXPIRY)) {
      throw new UnauthorizedError(
        'Telegram init data expired',
        'INIT_DATA_EXPIRED'
      );
    }

    // Ensure user data exists
    if (!initData.user) {
      throw new UnauthorizedError(
        'No user data in init data',
        'NO_USER_DATA'
      );
    }

    // Attach to request for use in route handlers
    (req as TelegramWebAppRequest).telegramInitData = initData;
    (req as TelegramWebAppRequest).telegramUser = initData.user;

    logger.debug(
      { telegramUserId: initData.user.id, username: initData.user.username },
      'Telegram init data validated successfully'
    );

    next();
  } catch (error) {
    // Re-throw our custom errors
    if (error instanceof UnauthorizedError || error instanceof BadRequestError) {
      next(error);
      return;
    }

    // Log unexpected errors
    if (error instanceof Error) {
      logger.error({ error: error.message }, 'Telegram init data validation failed');
    }

    next(new UnauthorizedError('Telegram authentication failed', 'TELEGRAM_AUTH_FAILED'));
  }
};

/**
 * Optional middleware to validate Telegram init data
 * Similar to validateTelegramInitData but doesn't fail if no auth header
 * Useful for endpoints that work with or without Telegram auth
 */
export const optionalTelegramInitData = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  // If no auth header or not a tma auth, just continue
  if (!authHeader || !authHeader.startsWith('tma ')) {
    next();
    return;
  }

  // Delegate to the main validator
  validateTelegramInitData(req, res, next);
};
