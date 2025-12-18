import { Request, Response } from 'express';
import { createLogger } from '../../utils/logger.js';
import { config } from '../../config/index.js';
import { handlePaymeRequest } from '../../services/payme/payme.service.js';
import {
  PaymeErrorCodes,
  createPaymeErrorResponse,
  PAYME_IP_WHITELIST,
  PAYME_TEST_IPS,
} from '../../services/payme/payme.errors.js';
import { PaymeRequest } from '../../services/payme/payme.types.js';

const logger = createLogger('payme-controller');

/**
 * Verify Basic Auth credentials
 */
function verifyBasicAuth(authHeader: string | undefined): boolean {
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return false;
  }

  const secretKey = config.payme.secretKey;
  if (!secretKey) {
    logger.error('PAYME_SECRET_KEY not configured');
    return false;
  }

  try {
    // Decode Base64: "Basic base64(login:password)"
    const base64Credentials = authHeader.slice(6);
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [login, password] = credentials.split(':');

    // For Payme, login is "Paycom" and password is the merchant key
    if (login === 'Paycom' && password === secretKey) {
      return true;
    }

    logger.warn({ login }, 'Invalid Payme credentials');
    return false;
  } catch (error) {
    logger.error({ error }, 'Error parsing Basic Auth header');
    return false;
  }
}

/**
 * Check if request IP is in whitelist
 */
function isIpAllowed(ip: string | undefined): boolean {
  if (!ip) return false;

  // In development/test mode, allow test IPs
  if (config.server.isDev || config.payme.testMode) {
    if (PAYME_TEST_IPS.includes(ip)) {
      return true;
    }
  }

  // Check production whitelist
  // Handle IPv6 mapped IPv4 addresses (e.g., "::ffff:185.178.51.131")
  const cleanIp = ip.replace('::ffff:', '');
  return PAYME_IP_WHITELIST.includes(cleanIp);
}

/**
 * Main Payme Merchant API endpoint
 * Handles all JSON-RPC requests from Payme Business
 */
export async function handlePayme(req: Request, res: Response) {
  const requestId = req.body?.id || 0;

  // Get real client IP from X-Forwarded-For header (Cloud Run sets this)
  // Format: "client, proxy1, proxy2" - take the first one
  const forwardedFor = req.headers['x-forwarded-for'];
  const clientIp = forwardedFor
    ? (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor.split(',')[0].trim())
    : req.ip || req.socket.remoteAddress;

  logger.info({
    method: req.body?.method,
    ip: clientIp,
    forwardedFor: forwardedFor,
    hasAuth: !!req.headers.authorization,
  }, 'Received Payme request');

  // 1. Verify IP whitelist (skip in test mode for easier development)
  if (!config.payme.testMode && !isIpAllowed(clientIp)) {
    logger.warn({ ip: clientIp }, 'Request from non-whitelisted IP');
    return res.status(200).json(
      createPaymeErrorResponse(requestId, PaymeErrorCodes.INSUFFICIENT_PRIVILEGE)
    );
  }

  // 2. Verify Basic Auth
  if (!verifyBasicAuth(req.headers.authorization)) {
    logger.warn('Invalid or missing authorization');
    return res.status(200).json(
      createPaymeErrorResponse(requestId, PaymeErrorCodes.INSUFFICIENT_PRIVILEGE)
    );
  }

  // 3. Validate request format
  const body = req.body as PaymeRequest;

  if (!body || !body.method || !body.params) {
    logger.warn({ body }, 'Invalid request format');
    return res.status(200).json(
      createPaymeErrorResponse(requestId, PaymeErrorCodes.INVALID_REQUEST)
    );
  }

  // 4. Process request
  try {
    const response = await handlePaymeRequest(body, requestId);

    logger.info({
      method: body.method,
      hasError: 'error' in response,
    }, 'Payme request processed');

    // Always return HTTP 200 with JSON-RPC response
    return res.status(200).json(response);

  } catch (error) {
    logger.error({ error, method: body.method }, 'Unhandled error in Payme request');
    return res.status(200).json(
      createPaymeErrorResponse(requestId, PaymeErrorCodes.INTERNAL_ERROR)
    );
  }
}
