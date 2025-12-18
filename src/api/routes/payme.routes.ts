import { Router } from 'express';
import * as paymeController from '../controllers/payme.controller.js';

const router = Router();

/**
 * POST /api/v1/payme
 *
 * Payme Merchant API endpoint
 * Handles all JSON-RPC requests from Payme Business
 *
 * Authentication: Basic HTTP Auth (Paycom:SECRET_KEY)
 * Content-Type: application/json
 *
 * Supported methods:
 * - CheckPerformTransaction
 * - CreateTransaction
 * - PerformTransaction
 * - CancelTransaction
 * - CheckTransaction
 * - GetStatement
 */
router.post('/', paymeController.handlePayme);

export default router;
