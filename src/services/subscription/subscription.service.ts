import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { createLogger } from '../../utils/logger.js';
import { NotFoundError, BadRequestError } from '../../utils/errors.js';

const logger = createLogger('subscription-service');

// ============================================
// TYPES
// ============================================

export interface MinutesBalance {
  planMinutesRemaining: number;
  planMinutesTotal: number;
  planMinutesUsed: number;
  bonusMinutes: number;
  totalAvailable: number;
  billingCycleStart: Date;
  billingCycleEnd: Date;
  planName: string;
  planDisplayName: string;
  status: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  displayName: string;
  displayNameUz: string | null;
  priceUzs: number;
  minutesPerMonth: number;
  description: string | null;
  descriptionUz: string | null;
  features: string[] | null;
  featuresUz: string[] | null;
  isActive: boolean;
  sortOrder: number;
}

export interface MinutePackage {
  id: string;
  name: string;
  displayName: string;
  displayNameUz: string | null;
  priceUzs: number;
  minutes: number;
  description: string | null;
  descriptionUz: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface UserSubscription {
  id: string;
  userId: string;
  planId: string;
  billingCycleStart: Date;
  billingCycleEnd: Date;
  minutesIncluded: number;
  minutesUsed: number;
  bonusMinutes: number;
  status: string;
  plan?: SubscriptionPlan;
}

export interface MinuteTransaction {
  id: string;
  userId: string;
  subscriptionId: string | null;
  lectureId: string | null;
  packageId: string | null;
  type: string;
  minutes: number;
  videoDurationSeconds: number | null;
  planMinutesAfter: number | null;
  bonusMinutesAfter: number | null;
  description: string | null;
  createdAt: Date;
}

type TransactionType =
  | 'plan_activation'
  | 'plan_renewal'
  | 'package_purchase'
  | 'video_processing'
  | 'refund'
  | 'admin_adjustment'
  | 'promo_credit';

// ============================================
// PLAN MANAGEMENT
// ============================================

export async function getAllPlans(): Promise<SubscriptionPlan[]> {
  const plans = await db.query.subscriptionPlans.findMany({
    where: eq(schema.subscriptionPlans.isActive, true),
    orderBy: schema.subscriptionPlans.sortOrder,
  });

  return plans.map(formatPlan);
}

export async function getPlanById(planId: string): Promise<SubscriptionPlan> {
  const plan = await db.query.subscriptionPlans.findFirst({
    where: eq(schema.subscriptionPlans.id, planId),
  });

  if (!plan) {
    throw new NotFoundError('Plan not found', 'PLAN_NOT_FOUND');
  }

  return formatPlan(plan);
}

export async function getPlanByName(name: string): Promise<SubscriptionPlan> {
  const plan = await db.query.subscriptionPlans.findFirst({
    where: eq(schema.subscriptionPlans.name, name),
  });

  if (!plan) {
    throw new NotFoundError('Plan not found', 'PLAN_NOT_FOUND');
  }

  return formatPlan(plan);
}

function formatPlan(plan: typeof schema.subscriptionPlans.$inferSelect): SubscriptionPlan {
  return {
    id: plan.id,
    name: plan.name,
    displayName: plan.displayName,
    displayNameUz: plan.displayNameUz,
    priceUzs: plan.priceUzs,
    minutesPerMonth: plan.minutesPerMonth,
    description: plan.description,
    descriptionUz: plan.descriptionUz,
    features: plan.features,
    featuresUz: plan.featuresUz,
    isActive: plan.isActive,
    sortOrder: plan.sortOrder,
  };
}

// ============================================
// PACKAGE MANAGEMENT
// ============================================

export async function getAllPackages(): Promise<MinutePackage[]> {
  const packages = await db.query.minutePackages.findMany({
    where: eq(schema.minutePackages.isActive, true),
    orderBy: schema.minutePackages.sortOrder,
  });

  return packages.map(formatPackage);
}

export async function getPackageById(packageId: string): Promise<MinutePackage> {
  const pkg = await db.query.minutePackages.findFirst({
    where: eq(schema.minutePackages.id, packageId),
  });

  if (!pkg) {
    throw new NotFoundError('Package not found', 'PACKAGE_NOT_FOUND');
  }

  return formatPackage(pkg);
}

export async function getPackageByName(name: string): Promise<MinutePackage> {
  const pkg = await db.query.minutePackages.findFirst({
    where: eq(schema.minutePackages.name, name),
  });

  if (!pkg) {
    throw new NotFoundError('Package not found', 'PACKAGE_NOT_FOUND');
  }

  return formatPackage(pkg);
}

function formatPackage(pkg: typeof schema.minutePackages.$inferSelect): MinutePackage {
  return {
    id: pkg.id,
    name: pkg.name,
    displayName: pkg.displayName,
    displayNameUz: pkg.displayNameUz,
    priceUzs: pkg.priceUzs,
    minutes: pkg.minutes,
    description: pkg.description,
    descriptionUz: pkg.descriptionUz,
    isActive: pkg.isActive,
    sortOrder: pkg.sortOrder,
  };
}

// ============================================
// USER SUBSCRIPTION
// ============================================

export async function getUserSubscription(userId: string): Promise<UserSubscription | null> {
  const subscription = await db.query.userSubscriptions.findFirst({
    where: eq(schema.userSubscriptions.userId, userId),
    with: {
      plan: true,
    },
  });

  if (!subscription) {
    return null;
  }

  // Check if billing cycle needs reset
  await checkAndResetBillingCycle(userId);

  // Fetch fresh data after potential reset
  const freshSubscription = await db.query.userSubscriptions.findFirst({
    where: eq(schema.userSubscriptions.userId, userId),
    with: {
      plan: true,
    },
  });

  if (!freshSubscription) {
    return null;
  }

  return formatSubscription(freshSubscription);
}

export async function createFreeSubscription(userId: string): Promise<UserSubscription> {
  // Get the free plan
  const freePlan = await getPlanByName('free');

  // Check if user already has a subscription
  const existing = await db.query.userSubscriptions.findFirst({
    where: eq(schema.userSubscriptions.userId, userId),
  });

  if (existing) {
    logger.warn({ userId }, 'User already has a subscription');
    return formatSubscription(existing);
  }

  const now = new Date();
  const cycleEnd = new Date(now);
  cycleEnd.setMonth(cycleEnd.getMonth() + 1);

  const [subscription] = await db
    .insert(schema.userSubscriptions)
    .values({
      userId,
      planId: freePlan.id,
      billingCycleStart: now,
      billingCycleEnd: cycleEnd,
      minutesIncluded: freePlan.minutesPerMonth,
      minutesUsed: 0,
      bonusMinutes: 0,
      status: 'active',
    })
    .returning();

  if (!subscription) {
    throw new Error('Failed to create subscription');
  }

  // Record transaction
  await recordTransaction({
    userId,
    subscriptionId: subscription.id,
    type: 'plan_activation',
    minutes: freePlan.minutesPerMonth,
    description: `Free plan activated - ${freePlan.minutesPerMonth} minutes`,
    planMinutesAfter: freePlan.minutesPerMonth,
    bonusMinutesAfter: 0,
  });

  logger.info({ userId, planName: freePlan.name }, 'Free subscription created');

  return formatSubscription(subscription);
}

export async function activatePlan(
  userId: string,
  planId: string
): Promise<UserSubscription> {
  const plan = await getPlanById(planId);

  // Get existing subscription
  let subscription = await db.query.userSubscriptions.findFirst({
    where: eq(schema.userSubscriptions.userId, userId),
  });

  const now = new Date();
  const cycleEnd = new Date(now);
  cycleEnd.setMonth(cycleEnd.getMonth() + 1);

  if (subscription) {
    // Update existing subscription
    const [updated] = await db
      .update(schema.userSubscriptions)
      .set({
        planId: plan.id,
        billingCycleStart: now,
        billingCycleEnd: cycleEnd,
        minutesIncluded: plan.minutesPerMonth,
        minutesUsed: 0,
        status: 'active',
        updatedAt: now,
      })
      .where(eq(schema.userSubscriptions.id, subscription.id))
      .returning();

    if (!updated) {
      throw new Error('Failed to update subscription');
    }

    subscription = updated;

    // Record transaction
    await recordTransaction({
      userId,
      subscriptionId: subscription.id,
      type: 'plan_activation',
      minutes: plan.minutesPerMonth,
      description: `${plan.displayName} plan activated - ${plan.minutesPerMonth} minutes`,
      planMinutesAfter: plan.minutesPerMonth,
      bonusMinutesAfter: subscription.bonusMinutes,
    });

    logger.info({ userId, planName: plan.name }, 'Plan upgraded');
  } else {
    // Create new subscription
    const [newSub] = await db
      .insert(schema.userSubscriptions)
      .values({
        userId,
        planId: plan.id,
        billingCycleStart: now,
        billingCycleEnd: cycleEnd,
        minutesIncluded: plan.minutesPerMonth,
        minutesUsed: 0,
        bonusMinutes: 0,
        status: 'active',
      })
      .returning();

    if (!newSub) {
      throw new Error('Failed to create subscription');
    }

    subscription = newSub;

    // Record transaction
    await recordTransaction({
      userId,
      subscriptionId: subscription.id,
      type: 'plan_activation',
      minutes: plan.minutesPerMonth,
      description: `${plan.displayName} plan activated - ${plan.minutesPerMonth} minutes`,
      planMinutesAfter: plan.minutesPerMonth,
      bonusMinutesAfter: 0,
    });

    logger.info({ userId, planName: plan.name }, 'New subscription created');
  }

  return formatSubscription(subscription);
}

export async function purchasePackage(
  userId: string,
  packageId: string
): Promise<MinuteTransaction> {
  const pkg = await getPackageById(packageId);

  // Get or create subscription
  let subscription = await db.query.userSubscriptions.findFirst({
    where: eq(schema.userSubscriptions.userId, userId),
  });

  if (!subscription) {
    // Create free subscription first
    const freeSub = await createFreeSubscription(userId);
    subscription = await db.query.userSubscriptions.findFirst({
      where: eq(schema.userSubscriptions.id, freeSub.id),
    });
  }

  if (!subscription) {
    throw new Error('Failed to get subscription');
  }

  // Add minutes to bonus balance
  const newBonusMinutes = subscription.bonusMinutes + pkg.minutes;

  await db
    .update(schema.userSubscriptions)
    .set({
      bonusMinutes: newBonusMinutes,
      updatedAt: new Date(),
    })
    .where(eq(schema.userSubscriptions.id, subscription.id));

  // Calculate plan minutes remaining
  const planMinutesRemaining = subscription.minutesIncluded - subscription.minutesUsed;

  // Record transaction
  const transaction = await recordTransaction({
    userId,
    subscriptionId: subscription.id,
    packageId: pkg.id,
    type: 'package_purchase',
    minutes: pkg.minutes,
    description: `${pkg.displayName} package purchased - ${pkg.minutes} minutes added`,
    planMinutesAfter: planMinutesRemaining,
    bonusMinutesAfter: newBonusMinutes,
  });

  logger.info({ userId, packageName: pkg.name, minutes: pkg.minutes }, 'Package purchased');

  return transaction;
}

function formatSubscription(
  subscription: typeof schema.userSubscriptions.$inferSelect & {
    plan?: typeof schema.subscriptionPlans.$inferSelect;
  }
): UserSubscription {
  return {
    id: subscription.id,
    userId: subscription.userId,
    planId: subscription.planId,
    billingCycleStart: subscription.billingCycleStart,
    billingCycleEnd: subscription.billingCycleEnd,
    minutesIncluded: subscription.minutesIncluded,
    minutesUsed: subscription.minutesUsed,
    bonusMinutes: subscription.bonusMinutes,
    status: subscription.status,
    plan: subscription.plan ? formatPlan(subscription.plan) : undefined,
  };
}

// ============================================
// MINUTES MANAGEMENT
// ============================================

export async function getMinutesBalance(userId: string): Promise<MinutesBalance> {
  // Get subscription with plan
  const subscription = await db.query.userSubscriptions.findFirst({
    where: eq(schema.userSubscriptions.userId, userId),
    with: {
      plan: true,
    },
  });

  if (!subscription || !subscription.plan) {
    // Return zero balance for users without subscription
    return {
      planMinutesRemaining: 0,
      planMinutesTotal: 0,
      planMinutesUsed: 0,
      bonusMinutes: 0,
      totalAvailable: 0,
      billingCycleStart: new Date(),
      billingCycleEnd: new Date(),
      planName: 'none',
      planDisplayName: 'No Plan',
      status: 'inactive',
    };
  }

  // Check if billing cycle needs reset
  await checkAndResetBillingCycle(userId);

  // Fetch fresh data
  const freshSubscription = await db.query.userSubscriptions.findFirst({
    where: eq(schema.userSubscriptions.userId, userId),
    with: {
      plan: true,
    },
  });

  if (!freshSubscription || !freshSubscription.plan) {
    throw new Error('Subscription not found after reset');
  }

  const planMinutesRemaining = Math.max(
    0,
    freshSubscription.minutesIncluded - freshSubscription.minutesUsed
  );

  return {
    planMinutesRemaining,
    planMinutesTotal: freshSubscription.minutesIncluded,
    planMinutesUsed: freshSubscription.minutesUsed,
    bonusMinutes: freshSubscription.bonusMinutes,
    totalAvailable: planMinutesRemaining + freshSubscription.bonusMinutes,
    billingCycleStart: freshSubscription.billingCycleStart,
    billingCycleEnd: freshSubscription.billingCycleEnd,
    planName: freshSubscription.plan.name,
    planDisplayName: freshSubscription.plan.displayName,
    status: freshSubscription.status,
  };
}

export async function hasEnoughMinutes(
  userId: string,
  durationSeconds: number
): Promise<boolean> {
  const balance = await getMinutesBalance(userId);
  const requiredMinutes = Math.ceil(durationSeconds / 60);
  return balance.totalAvailable >= requiredMinutes;
}

export async function deductMinutes(
  userId: string,
  lectureId: string,
  durationSeconds: number
): Promise<boolean> {
  const subscription = await db.query.userSubscriptions.findFirst({
    where: eq(schema.userSubscriptions.userId, userId),
  });

  if (!subscription) {
    logger.error({ userId }, 'No subscription found for minute deduction');
    return false;
  }

  const requiredMinutes = Math.ceil(durationSeconds / 60);
  const balance = await getMinutesBalance(userId);

  if (balance.totalAvailable < requiredMinutes) {
    logger.warn(
      { userId, required: requiredMinutes, available: balance.totalAvailable },
      'Insufficient minutes'
    );
    return false;
  }

  // Deduct from bonus minutes first, then plan minutes
  let remainingToDeduct = requiredMinutes;
  let bonusDeducted = 0;
  let planDeducted = 0;

  if (subscription.bonusMinutes > 0) {
    bonusDeducted = Math.min(subscription.bonusMinutes, remainingToDeduct);
    remainingToDeduct -= bonusDeducted;
  }

  if (remainingToDeduct > 0) {
    planDeducted = remainingToDeduct;
  }

  // Update subscription
  const newBonusMinutes = subscription.bonusMinutes - bonusDeducted;
  const newMinutesUsed = subscription.minutesUsed + planDeducted;

  await db
    .update(schema.userSubscriptions)
    .set({
      minutesUsed: newMinutesUsed,
      bonusMinutes: newBonusMinutes,
      updatedAt: new Date(),
    })
    .where(eq(schema.userSubscriptions.id, subscription.id));

  // Update lecture with minutes charged
  await db
    .update(schema.lectures)
    .set({
      minutesCharged: requiredMinutes,
      updatedAt: new Date(),
    })
    .where(eq(schema.lectures.id, lectureId));

  // Calculate new balances
  const planMinutesAfter = subscription.minutesIncluded - newMinutesUsed;

  // Record transaction
  await recordTransaction({
    userId,
    subscriptionId: subscription.id,
    lectureId,
    type: 'video_processing',
    minutes: -requiredMinutes,
    videoDurationSeconds: durationSeconds,
    description: `Video processing: ${requiredMinutes} minutes (${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, '0')})`,
    planMinutesAfter,
    bonusMinutesAfter: newBonusMinutes,
  });

  logger.info(
    {
      userId,
      lectureId,
      minutesDeducted: requiredMinutes,
      bonusDeducted,
      planDeducted,
    },
    'Minutes deducted'
  );

  return true;
}

export async function refundMinutes(userId: string, lectureId: string): Promise<boolean> {
  const lecture = await db.query.lectures.findFirst({
    where: eq(schema.lectures.id, lectureId),
  });

  if (!lecture || !lecture.minutesCharged || lecture.minutesRefunded) {
    logger.warn({ userId, lectureId }, 'Cannot refund: no charge or already refunded');
    return false;
  }

  const subscription = await db.query.userSubscriptions.findFirst({
    where: eq(schema.userSubscriptions.userId, userId),
  });

  if (!subscription) {
    logger.error({ userId }, 'No subscription found for refund');
    return false;
  }

  // Add back to bonus minutes (safer than plan minutes which might overflow)
  const newBonusMinutes = subscription.bonusMinutes + lecture.minutesCharged;

  await db
    .update(schema.userSubscriptions)
    .set({
      bonusMinutes: newBonusMinutes,
      updatedAt: new Date(),
    })
    .where(eq(schema.userSubscriptions.id, subscription.id));

  // Mark lecture as refunded
  await db
    .update(schema.lectures)
    .set({
      minutesRefunded: true,
      updatedAt: new Date(),
    })
    .where(eq(schema.lectures.id, lectureId));

  // Calculate plan minutes remaining
  const planMinutesAfter = subscription.minutesIncluded - subscription.minutesUsed;

  // Record refund transaction
  await recordTransaction({
    userId,
    subscriptionId: subscription.id,
    lectureId,
    type: 'refund',
    minutes: lecture.minutesCharged,
    description: `Refund for failed processing: ${lecture.minutesCharged} minutes`,
    planMinutesAfter,
    bonusMinutesAfter: newBonusMinutes,
  });

  logger.info(
    { userId, lectureId, minutesRefunded: lecture.minutesCharged },
    'Minutes refunded'
  );

  return true;
}

// ============================================
// BILLING CYCLE
// ============================================

export async function checkAndResetBillingCycle(userId: string): Promise<boolean> {
  const subscription = await db.query.userSubscriptions.findFirst({
    where: eq(schema.userSubscriptions.userId, userId),
    with: {
      plan: true,
    },
  });

  if (!subscription || !subscription.plan) {
    return false;
  }

  const now = new Date();

  // Check if billing cycle has ended
  if (now < subscription.billingCycleEnd) {
    return false;
  }

  // Reset billing cycle
  const newCycleStart = new Date(subscription.billingCycleEnd);
  const newCycleEnd = new Date(newCycleStart);
  newCycleEnd.setMonth(newCycleEnd.getMonth() + 1);

  await db
    .update(schema.userSubscriptions)
    .set({
      billingCycleStart: newCycleStart,
      billingCycleEnd: newCycleEnd,
      minutesUsed: 0, // Reset usage
      // bonusMinutes are NOT reset
      updatedAt: now,
    })
    .where(eq(schema.userSubscriptions.id, subscription.id));

  // Record renewal transaction
  await recordTransaction({
    userId,
    subscriptionId: subscription.id,
    type: 'plan_renewal',
    minutes: subscription.plan.minutesPerMonth,
    description: `${subscription.plan.displayName} plan renewed - ${subscription.plan.minutesPerMonth} minutes reset`,
    planMinutesAfter: subscription.plan.minutesPerMonth,
    bonusMinutesAfter: subscription.bonusMinutes,
  });

  logger.info(
    { userId, planName: subscription.plan.name, newCycleEnd },
    'Billing cycle reset'
  );

  return true;
}

// ============================================
// TRANSACTIONS
// ============================================

async function recordTransaction(data: {
  userId: string;
  subscriptionId?: string;
  lectureId?: string;
  packageId?: string;
  type: TransactionType;
  minutes: number;
  videoDurationSeconds?: number;
  description?: string;
  planMinutesAfter?: number;
  bonusMinutesAfter?: number;
  metadata?: Record<string, unknown>;
}): Promise<MinuteTransaction> {
  const [transaction] = await db
    .insert(schema.minuteTransactions)
    .values({
      userId: data.userId,
      subscriptionId: data.subscriptionId,
      lectureId: data.lectureId,
      packageId: data.packageId,
      type: data.type,
      minutes: data.minutes,
      videoDurationSeconds: data.videoDurationSeconds,
      description: data.description,
      planMinutesAfter: data.planMinutesAfter,
      bonusMinutesAfter: data.bonusMinutesAfter,
      metadata: data.metadata,
    })
    .returning();

  if (!transaction) {
    throw new Error('Failed to record transaction');
  }

  return {
    id: transaction.id,
    userId: transaction.userId,
    subscriptionId: transaction.subscriptionId,
    lectureId: transaction.lectureId,
    packageId: transaction.packageId,
    type: transaction.type,
    minutes: transaction.minutes,
    videoDurationSeconds: transaction.videoDurationSeconds,
    planMinutesAfter: transaction.planMinutesAfter,
    bonusMinutesAfter: transaction.bonusMinutesAfter,
    description: transaction.description,
    createdAt: transaction.createdAt,
  };
}

export async function getTransactions(
  userId: string,
  limit: number = 20,
  offset: number = 0
): Promise<{ transactions: MinuteTransaction[]; total: number }> {
  const transactions = await db.query.minuteTransactions.findMany({
    where: eq(schema.minuteTransactions.userId, userId),
    orderBy: desc(schema.minuteTransactions.createdAt),
    limit,
    offset,
  });

  // Get total count
  const allTransactions = await db.query.minuteTransactions.findMany({
    where: eq(schema.minuteTransactions.userId, userId),
  });

  return {
    transactions: transactions.map((t) => ({
      id: t.id,
      userId: t.userId,
      subscriptionId: t.subscriptionId,
      lectureId: t.lectureId,
      packageId: t.packageId,
      type: t.type,
      minutes: t.minutes,
      videoDurationSeconds: t.videoDurationSeconds,
      planMinutesAfter: t.planMinutesAfter,
      bonusMinutesAfter: t.bonusMinutesAfter,
      description: t.description,
      createdAt: t.createdAt,
    })),
    total: allTransactions.length,
  };
}
