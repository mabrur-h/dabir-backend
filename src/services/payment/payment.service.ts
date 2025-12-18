import { eq, and } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { createLogger } from '../../utils/logger.js';
import { BadRequestError, NotFoundError } from '../../utils/errors.js';
import * as subscriptionService from '../subscription/subscription.service.js';
import { config } from '../../config/index.js';

const logger = createLogger('payment-service');

// ============================================
// TYPES
// ============================================

export interface Payment {
  id: string;
  userId: string;
  paymentType: 'plan' | 'package';
  planId: string | null;
  packageId: string | null;
  amountUzs: number;
  provider: string;
  providerTransactionId: string | null;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  createdAt: Date;
  completedAt: Date | null;
}

export interface CreatePaymentInput {
  userId: string;
  paymentType: 'plan' | 'package';
  planId?: string;
  packageId?: string;
}

export interface PaymentWithDetails extends Payment {
  planName?: string;
  planDisplayName?: string;
  packageName?: string;
  packageDisplayName?: string;
}

// ============================================
// PAYMENT CREATION
// ============================================

/**
 * Create a pending payment for a plan or package
 * Returns payment details including amount
 */
export async function createPayment(input: CreatePaymentInput): Promise<PaymentWithDetails> {
  const { userId, paymentType, planId, packageId } = input;

  let amountUzs = 0;
  let planName: string | undefined;
  let planDisplayName: string | undefined;
  let packageName: string | undefined;
  let packageDisplayName: string | undefined;

  if (paymentType === 'plan') {
    if (!planId) {
      throw new BadRequestError('Plan ID is required for plan payment', 'PLAN_ID_REQUIRED');
    }

    const plan = await subscriptionService.getPlanById(planId);

    // Free plan doesn't need payment
    if (plan.name === 'free' || plan.priceUzs === 0) {
      throw new BadRequestError('Free plan does not require payment', 'FREE_PLAN_NO_PAYMENT');
    }

    // Check if user already has an active paid plan
    const currentSub = await subscriptionService.getUserSubscription(userId);

    if (currentSub && currentSub.status === 'active') {
      // Check if same plan
      if (currentSub.planId === planId) {
        throw new BadRequestError(
          'Siz allaqachon bu tarifni ishlatmoqdasiz',
          'PLAN_ALREADY_ACTIVE'
        );
      }

      // Check if current plan is a paid plan (not free)
      const currentPlan = currentSub.plan;
      if (currentPlan && currentPlan.name !== 'free' && currentPlan.priceUzs > 0) {
        // User has an active paid plan - don't allow changes until cycle ends
        const cycleEnd = new Date(currentSub.billingCycleEnd);
        const daysRemaining = Math.ceil((cycleEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

        throw new BadRequestError(
          `Sizning "${currentPlan.displayName}" tarifingiz hali faol. ` +
          `${daysRemaining} kundan keyin tarifni o'zgartirishingiz mumkin (${cycleEnd.toLocaleDateString('uz-UZ')}).`,
          'ACTIVE_PAID_PLAN_EXISTS'
        );
      }
    }

    amountUzs = plan.priceUzs;
    planName = plan.name;
    planDisplayName = plan.displayName;

  } else if (paymentType === 'package') {
    if (!packageId) {
      throw new BadRequestError('Package ID is required for package payment', 'PACKAGE_ID_REQUIRED');
    }

    const pkg = await subscriptionService.getPackageById(packageId);
    amountUzs = pkg.priceUzs;
    packageName = pkg.name;
    packageDisplayName = pkg.displayName;
  }

  // Check for existing pending payment for same item
  const existingPending = await db.query.payments.findFirst({
    where: and(
      eq(schema.payments.userId, userId),
      eq(schema.payments.status, 'pending'),
      paymentType === 'plan'
        ? eq(schema.payments.planId, planId!)
        : eq(schema.payments.packageId, packageId!)
    ),
  });

  if (existingPending) {
    // Return existing pending payment
    logger.info({ paymentId: existingPending.id }, 'Returning existing pending payment');
    return {
      ...formatPayment(existingPending),
      planName,
      planDisplayName,
      packageName,
      packageDisplayName,
    };
  }

  // Create new payment record
  const [payment] = await db
    .insert(schema.payments)
    .values({
      userId,
      paymentType,
      planId: planId || null,
      packageId: packageId || null,
      amountUzs,
      provider: 'payme',
      status: 'pending',
    })
    .returning();

  if (!payment) {
    throw new Error('Failed to create payment');
  }

  logger.info(
    { paymentId: payment.id, userId, paymentType, amountUzs },
    'Payment created'
  );

  return {
    ...formatPayment(payment),
    planName,
    planDisplayName,
    packageName,
    packageDisplayName,
  };
}

/**
 * Create payment for plan by name
 */
export async function createPlanPaymentByName(
  userId: string,
  planName: string
): Promise<PaymentWithDetails> {
  const plan = await subscriptionService.getPlanByName(planName);
  return createPayment({
    userId,
    paymentType: 'plan',
    planId: plan.id,
  });
}

/**
 * Create payment for package by name
 */
export async function createPackagePaymentByName(
  userId: string,
  packageName: string
): Promise<PaymentWithDetails> {
  const pkg = await subscriptionService.getPackageByName(packageName);
  return createPayment({
    userId,
    paymentType: 'package',
    packageId: pkg.id,
  });
}

// ============================================
// PAYMENT CONFIRMATION
// ============================================

/**
 * Confirm a payment after successful payment
 * Called by payment provider webhook or manual confirmation
 */
export async function confirmPayment(
  paymentId: string,
  providerTransactionId?: string,
  providerResponse?: Record<string, unknown>
): Promise<Payment> {
  const payment = await db.query.payments.findFirst({
    where: eq(schema.payments.id, paymentId),
  });

  if (!payment) {
    throw new NotFoundError('Payment not found', 'PAYMENT_NOT_FOUND');
  }

  if (payment.status === 'completed') {
    logger.warn({ paymentId }, 'Payment already completed');
    return formatPayment(payment);
  }

  if (payment.status !== 'pending') {
    throw new BadRequestError(
      `Cannot confirm payment with status: ${payment.status}`,
      'INVALID_PAYMENT_STATUS'
    );
  }

  const now = new Date();

  // Update payment to completed
  const [updatedPayment] = await db
    .update(schema.payments)
    .set({
      status: 'completed',
      providerTransactionId: providerTransactionId || null,
      providerResponse: providerResponse || null,
      completedAt: now,
    })
    .where(eq(schema.payments.id, paymentId))
    .returning();

  if (!updatedPayment) {
    throw new Error('Failed to update payment');
  }

  // Activate the plan or package
  if (payment.paymentType === 'plan' && payment.planId) {
    await subscriptionService.activatePlan(payment.userId, payment.planId);
    logger.info(
      { paymentId, userId: payment.userId, planId: payment.planId },
      'Plan activated after payment confirmation'
    );
  } else if (payment.paymentType === 'package' && payment.packageId) {
    await subscriptionService.purchasePackage(payment.userId, payment.packageId);
    logger.info(
      { paymentId, userId: payment.userId, packageId: payment.packageId },
      'Package purchased after payment confirmation'
    );
  }

  return formatPayment(updatedPayment);
}

/**
 * Mark payment as failed
 */
export async function failPayment(
  paymentId: string,
  reason?: string
): Promise<Payment> {
  const payment = await db.query.payments.findFirst({
    where: eq(schema.payments.id, paymentId),
  });

  if (!payment) {
    throw new NotFoundError('Payment not found', 'PAYMENT_NOT_FOUND');
  }

  if (payment.status !== 'pending') {
    throw new BadRequestError(
      `Cannot fail payment with status: ${payment.status}`,
      'INVALID_PAYMENT_STATUS'
    );
  }

  const [updatedPayment] = await db
    .update(schema.payments)
    .set({
      status: 'failed',
      providerResponse: reason ? { failureReason: reason } : null,
    })
    .where(eq(schema.payments.id, paymentId))
    .returning();

  if (!updatedPayment) {
    throw new Error('Failed to update payment');
  }

  logger.info({ paymentId, reason }, 'Payment marked as failed');

  return formatPayment(updatedPayment);
}

// ============================================
// PAYMENT QUERIES
// ============================================

/**
 * Get payment by ID
 */
export async function getPaymentById(paymentId: string): Promise<Payment> {
  const payment = await db.query.payments.findFirst({
    where: eq(schema.payments.id, paymentId),
  });

  if (!payment) {
    throw new NotFoundError('Payment not found', 'PAYMENT_NOT_FOUND');
  }

  return formatPayment(payment);
}

/**
 * Get user's pending payments
 */
export async function getUserPendingPayments(userId: string): Promise<Payment[]> {
  const payments = await db.query.payments.findMany({
    where: and(
      eq(schema.payments.userId, userId),
      eq(schema.payments.status, 'pending')
    ),
    orderBy: (payments, { desc }) => [desc(payments.createdAt)],
  });

  return payments.map(formatPayment);
}

/**
 * Get user's payment history
 */
export async function getUserPayments(
  userId: string,
  limit: number = 20,
  offset: number = 0
): Promise<{ payments: Payment[]; total: number }> {
  const payments = await db.query.payments.findMany({
    where: eq(schema.payments.userId, userId),
    orderBy: (payments, { desc }) => [desc(payments.createdAt)],
    limit,
    offset,
  });

  const allPayments = await db.query.payments.findMany({
    where: eq(schema.payments.userId, userId),
  });

  return {
    payments: payments.map(formatPayment),
    total: allPayments.length,
  };
}

/**
 * Cancel expired pending payments (older than 24 hours)
 */
export async function cancelExpiredPayments(): Promise<number> {
  const expiryTime = new Date();
  expiryTime.setHours(expiryTime.getHours() - 24);

  const result = await db
    .update(schema.payments)
    .set({ status: 'failed' })
    .where(
      and(
        eq(schema.payments.status, 'pending'),
        // Created more than 24 hours ago
      )
    )
    .returning();

  if (result.length > 0) {
    logger.info({ count: result.length }, 'Cancelled expired payments');
  }

  return result.length;
}

// ============================================
// HELPERS
// ============================================

function formatPayment(payment: typeof schema.payments.$inferSelect): Payment {
  return {
    id: payment.id,
    userId: payment.userId,
    paymentType: payment.paymentType as 'plan' | 'package',
    planId: payment.planId,
    packageId: payment.packageId,
    amountUzs: payment.amountUzs,
    provider: payment.provider ?? 'payme',
    providerTransactionId: payment.providerTransactionId,
    status: payment.status as Payment['status'],
    createdAt: payment.createdAt,
    completedAt: payment.completedAt,
  };
}

// ============================================
// PAYME URL GENERATION
// ============================================

/**
 * Generate Payme checkout URL with account-based format
 * Format: m=MERCHANT_ID;ac.user_id=ACCOUNT_ID;ac.plan_id=NAME;a=AMOUNT
 * or:    m=MERCHANT_ID;ac.user_id=ACCOUNT_ID;ac.package_id=NAME;a=AMOUNT
 */
export function generatePaymeUrl(
  accountId: number,
  orderType: 'plan' | 'package',
  orderName: string,
  amountUzs: number
): string {
  const merchantId = config.payme.merchantId;
  if (!merchantId) {
    throw new Error('PAYME_MERCHANT_ID not configured');
  }

  // Payme expects amount in tiyin (1 UZS = 100 tiyin)
  const amountTiyin = amountUzs * 100;

  // Build Payme URL params with correct field name (plan_id or package_id)
  const fieldName = orderType === 'plan' ? 'plan_id' : 'package_id';
  const params = `m=${merchantId};ac.user_id=${accountId};ac.${fieldName}=${orderName};a=${amountTiyin}`;
  const encodedParams = Buffer.from(params).toString('base64');

  // Use test URL in test mode
  const baseUrl = config.payme.testMode
    ? 'https://checkout.test.paycom.uz'
    : 'https://checkout.paycom.uz';

  return `${baseUrl}/${encodedParams}`;
}

/**
 * Generate Click checkout URL
 */
export function generateClickUrl(
  paymentId: string,
  amountUzs: number,
  merchantId: string,
  serviceId: string
): string {
  const params = new URLSearchParams({
    service_id: serviceId,
    merchant_id: merchantId,
    amount: amountUzs.toString(),
    transaction_param: paymentId,
  });

  return `https://my.click.uz/services/pay?${params.toString()}`;
}
