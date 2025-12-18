import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as subscriptionService from '../../services/subscription/subscription.service.js';
import * as paymentService from '../../services/payment/payment.service.js';
import type { AuthenticatedRequest } from '../../types/index.js';
import { db, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';

// ============================================
// VALIDATION SCHEMAS
// ============================================

export const activatePlanSchema = z.object({
  planId: z.string().uuid('Invalid plan ID'),
});

export const activatePlanByNameSchema = z.object({
  planName: z.string().min(1, 'Plan name is required'),
});

export const purchasePackageSchema = z.object({
  packageId: z.string().uuid('Invalid package ID'),
});

export const purchasePackageByNameSchema = z.object({
  packageName: z.string().min(1, 'Package name is required'),
});

export const getTransactionsSchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// ============================================
// PUBLIC CONTROLLERS (No auth required)
// ============================================

/**
 * GET /api/v1/subscription/plans
 * Get all available subscription plans
 */
export async function getPlans(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const plans = await subscriptionService.getAllPlans();

    res.json({
      success: true,
      data: { plans },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/subscription/packages
 * Get all available minute packages
 */
export async function getPackages(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const packages = await subscriptionService.getAllPackages();

    res.json({
      success: true,
      data: { packages },
    });
  } catch (error) {
    next(error);
  }
}

// ============================================
// PROTECTED CONTROLLERS (Auth required)
// ============================================

/**
 * GET /api/v1/subscription/me
 * Get current user's subscription details
 */
export async function getMySubscription(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const subscription = await subscriptionService.getUserSubscription(user.id);

    res.json({
      success: true,
      data: { subscription },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/subscription/balance
 * Get current user's minutes balance
 */
export async function getBalance(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const balance = await subscriptionService.getMinutesBalance(user.id);

    res.json({
      success: true,
      data: { balance },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/subscription/activate-plan
 * Activate a subscription plan (by ID)
 * For now, always succeeds - payment integration later
 */
export async function activatePlan(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const { planId } = activatePlanSchema.parse(req.body);

    const subscription = await subscriptionService.activatePlan(user.id, planId);

    res.json({
      success: true,
      data: {
        subscription,
        message: 'Plan activated successfully',
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/subscription/activate-plan-by-name
 * Activate a subscription plan (by name: free, starter, pro, business)
 * Free plan: activates immediately
 * Paid plans: creates pending payment, returns payment URL
 */
export async function activatePlanByName(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const { planName } = activatePlanByNameSchema.parse(req.body);

    // Get plan by name
    const plan = await subscriptionService.getPlanByName(planName);

    // Check current subscription
    const currentSub = await subscriptionService.getUserSubscription(user.id);

    // If user has an active paid plan, prevent any plan changes
    if (currentSub && currentSub.status === 'active' && currentSub.plan) {
      const currentPlan = currentSub.plan;

      // Check if trying to activate the same plan
      if (currentSub.planId === plan.id) {
        res.status(400).json({
          success: false,
          error: {
            code: 'PLAN_ALREADY_ACTIVE',
            message: 'Siz allaqachon bu tarifni ishlatmoqdasiz',
          },
        });
        return;
      }

      // If current plan is paid, don't allow changes until cycle ends
      if (currentPlan.name !== 'free' && currentPlan.priceUzs > 0) {
        const cycleEnd = new Date(currentSub.billingCycleEnd);
        const daysRemaining = Math.ceil((cycleEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

        res.status(400).json({
          success: false,
          error: {
            code: 'ACTIVE_PAID_PLAN_EXISTS',
            message: `Sizning "${currentPlan.displayName}" tarifingiz hali faol. ` +
              `${daysRemaining} kundan keyin tarifni o'zgartirishingiz mumkin.`,
          },
        });
        return;
      }
    }

    // Free plan - activate immediately (only if user is on free plan or no plan)
    if (plan.name === 'free' || plan.priceUzs === 0) {
      const subscription = await subscriptionService.activatePlan(user.id, plan.id);
      res.json({
        success: true,
        data: {
          subscription,
          message: 'Free plan activated successfully',
          requiresPayment: false,
        },
      });
      return;
    }

    // Paid plan - create payment first
    const payment = await paymentService.createPlanPaymentByName(user.id, planName);

    // Get user's accountId for Payme URL
    const dbUser = await db.query.users.findFirst({
      where: eq(schema.users.id, user.id),
      columns: { accountId: true },
    });

    if (!dbUser) {
      res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
      return;
    }

    // Generate payment URL (using Payme with account format)
    const paymeUrl = paymentService.generatePaymeUrl(
      dbUser.accountId,
      'plan',
      planName,
      payment.amountUzs
    );

    res.json({
      success: true,
      data: {
        payment,
        paymentUrl: paymeUrl,
        message: `To'lovni amalga oshiring: ${payment.amountUzs.toLocaleString()} UZS`,
        requiresPayment: true,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/subscription/purchase-package
 * Purchase a minute package (by ID)
 * For now, always succeeds - payment integration later
 */
export async function purchasePackage(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const { packageId } = purchasePackageSchema.parse(req.body);

    const transaction = await subscriptionService.purchasePackage(user.id, packageId);

    res.json({
      success: true,
      data: {
        transaction,
        message: 'Package purchased successfully',
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/subscription/purchase-package-by-name
 * Purchase a minute package (by name: 1hr, 5hr, 10hr)
 * Creates pending payment, returns payment URL
 */
export async function purchasePackageByName(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const { packageName } = purchasePackageByNameSchema.parse(req.body);

    // Create payment for package
    const payment = await paymentService.createPackagePaymentByName(user.id, packageName);

    // Get user's accountId for Payme URL
    const dbUser = await db.query.users.findFirst({
      where: eq(schema.users.id, user.id),
      columns: { accountId: true },
    });

    if (!dbUser) {
      res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
      return;
    }

    // Generate payment URL (using Payme with account format)
    const paymeUrl = paymentService.generatePaymeUrl(
      dbUser.accountId,
      'package',
      packageName,
      payment.amountUzs
    );

    res.json({
      success: true,
      data: {
        payment,
        paymentUrl: paymeUrl,
        message: `To'lovni amalga oshiring: ${payment.amountUzs.toLocaleString()} UZS`,
        requiresPayment: true,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/subscription/transactions
 * Get user's transaction history
 */
export async function getTransactions(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const { limit, offset } = getTransactionsSchema.parse(req.query);

    const result = await subscriptionService.getTransactions(user.id, limit, offset);

    res.json({
      success: true,
      data: {
        transactions: result.transactions,
        pagination: {
          limit,
          offset,
          total: result.total,
          hasMore: offset + limit < result.total,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/subscription/check-minutes
 * Check if user has enough minutes for a given duration
 */
export async function checkMinutes(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const durationSeconds = z.coerce.number().int().positive().parse(req.query.duration);

    const hasEnough = await subscriptionService.hasEnoughMinutes(user.id, durationSeconds);
    const balance = await subscriptionService.getMinutesBalance(user.id);
    const requiredMinutes = Math.ceil(durationSeconds / 60);

    res.json({
      success: true,
      data: {
        hasEnoughMinutes: hasEnough,
        requiredMinutes,
        availableMinutes: balance.totalAvailable,
        balance,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ============================================
// PAYMENT CONTROLLERS
// ============================================

export const confirmPaymentSchema = z.object({
  paymentId: z.string().uuid('Invalid payment ID'),
  providerTransactionId: z.string().optional(),
});

/**
 * POST /api/v1/subscription/confirm-payment
 * Manually confirm a payment (for testing/admin use)
 * In production, this would be called by payment webhook
 */
export async function confirmPayment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { paymentId, providerTransactionId } = confirmPaymentSchema.parse(req.body);

    const payment = await paymentService.confirmPayment(paymentId, providerTransactionId);

    res.json({
      success: true,
      data: {
        payment,
        message: "To'lov tasdiqlandi va tarif/paket faollashtirildi",
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/subscription/payments
 * Get user's payment history
 */
export async function getPayments(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const { limit, offset } = getTransactionsSchema.parse(req.query);

    const result = await paymentService.getUserPayments(user.id, limit, offset);

    res.json({
      success: true,
      data: {
        payments: result.payments,
        pagination: {
          limit,
          offset,
          total: result.total,
          hasMore: offset + limit < result.total,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/subscription/payments/pending
 * Get user's pending payments
 */
export async function getPendingPayments(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;

    const payments = await paymentService.getUserPendingPayments(user.id);

    res.json({
      success: true,
      data: { payments },
    });
  } catch (error) {
    next(error);
  }
}
