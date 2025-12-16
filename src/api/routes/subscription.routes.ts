import { Router } from 'express';
import * as subscriptionController from '../controllers/subscription.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

// ============================================
// PUBLIC ROUTES (No auth required)
// ============================================

/**
 * GET /api/v1/subscription/plans
 * Get all available subscription plans
 *
 * Response: { plans: SubscriptionPlan[] }
 */
router.get('/plans', subscriptionController.getPlans);

/**
 * GET /api/v1/subscription/packages
 * Get all available minute packages
 *
 * Response: { packages: MinutePackage[] }
 */
router.get('/packages', subscriptionController.getPackages);

// ============================================
// PROTECTED ROUTES (Auth required)
// ============================================

/**
 * GET /api/v1/subscription/me
 * Get current user's subscription details
 *
 * Headers: Authorization: Bearer <token>
 * Response: { subscription: UserSubscription | null }
 */
router.get('/me', authenticate, subscriptionController.getMySubscription);

/**
 * GET /api/v1/subscription/balance
 * Get current user's minutes balance
 *
 * Headers: Authorization: Bearer <token>
 * Response: { balance: MinutesBalance }
 */
router.get('/balance', authenticate, subscriptionController.getBalance);

/**
 * POST /api/v1/subscription/activate-plan
 * Activate a subscription plan by ID
 *
 * Headers: Authorization: Bearer <token>
 * Body: { planId: string }
 * Response: { subscription, message }
 */
router.post('/activate-plan', authenticate, subscriptionController.activatePlan);

/**
 * POST /api/v1/subscription/activate-plan-by-name
 * Activate a subscription plan by name (free, starter, pro, business)
 *
 * Headers: Authorization: Bearer <token>
 * Body: { planName: string }
 * Response: { subscription, message }
 */
router.post('/activate-plan-by-name', authenticate, subscriptionController.activatePlanByName);

/**
 * POST /api/v1/subscription/purchase-package
 * Purchase a minute package by ID
 *
 * Headers: Authorization: Bearer <token>
 * Body: { packageId: string }
 * Response: { transaction, message }
 */
router.post('/purchase-package', authenticate, subscriptionController.purchasePackage);

/**
 * POST /api/v1/subscription/purchase-package-by-name
 * Purchase a minute package by name (1hr, 5hr, 10hr)
 *
 * Headers: Authorization: Bearer <token>
 * Body: { packageName: string }
 * Response: { transaction, message }
 */
router.post('/purchase-package-by-name', authenticate, subscriptionController.purchasePackageByName);

/**
 * GET /api/v1/subscription/transactions
 * Get user's transaction history
 *
 * Headers: Authorization: Bearer <token>
 * Query: { limit?: number, offset?: number }
 * Response: { transactions, pagination }
 */
router.get('/transactions', authenticate, subscriptionController.getTransactions);

/**
 * GET /api/v1/subscription/check-minutes
 * Check if user has enough minutes for a given duration
 *
 * Headers: Authorization: Bearer <token>
 * Query: { duration: number } (in seconds)
 * Response: { hasEnoughMinutes, requiredMinutes, availableMinutes, balance }
 */
router.get('/check-minutes', authenticate, subscriptionController.checkMinutes);

// ============================================
// PAYMENT ROUTES
// ============================================

/**
 * GET /api/v1/subscription/payments
 * Get user's payment history
 *
 * Headers: Authorization: Bearer <token>
 * Query: { limit?: number, offset?: number }
 * Response: { payments, pagination }
 */
router.get('/payments', authenticate, subscriptionController.getPayments);

/**
 * GET /api/v1/subscription/payments/pending
 * Get user's pending payments
 *
 * Headers: Authorization: Bearer <token>
 * Response: { payments }
 */
router.get('/payments/pending', authenticate, subscriptionController.getPendingPayments);

/**
 * POST /api/v1/subscription/confirm-payment
 * Manually confirm a payment (for testing/admin)
 * In production, payment provider webhook calls this
 *
 * Body: { paymentId: string, providerTransactionId?: string }
 * Response: { payment, message }
 */
router.post('/confirm-payment', subscriptionController.confirmPayment);

export default router;
