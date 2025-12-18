import { eq, and, gte, lte } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { createLogger } from '../../utils/logger.js';
import { config } from '../../config/index.js';
import * as paymentService from '../payment/payment.service.js';
import * as subscriptionService from '../subscription/subscription.service.js';
import { sendPaymentNotification } from '../notification/notification.service.js';
import {
  PaymeRequest,
  PaymeAccount,
  PaymeTransactionState,
  PaymeCancelReason,
  CheckPerformTransactionParams,
  CheckPerformTransactionResult,
  CreateTransactionParams,
  CreateTransactionResult,
  PerformTransactionParams,
  PerformTransactionResult,
  CancelTransactionParams,
  CancelTransactionResult,
  CheckTransactionParams,
  CheckTransactionResult,
  GetStatementParams,
  GetStatementResult,
  StatementTransaction,
  ParsedOrderId,
} from './payme.types.js';
import {
  PaymeErrorCodes,
  createPaymeErrorResponse,
  createPaymeSuccessResponse,
  PAYME_TRANSACTION_TIMEOUT_MS,
} from './payme.errors.js';

const logger = createLogger('payme-service');

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Parse account to extract order type and name
 * Supports Payme dashboard fields: { plan_id: "starter" } or { package_id: "1hr" }
 */
function parseAccount(account: PaymeAccount): ParsedOrderId | null {
  if (account.plan_id) {
    return { type: 'plan', name: account.plan_id };
  }
  if (account.package_id) {
    return { type: 'package', name: account.package_id };
  }
  return null;
}

/**
 * Find user by accountId
 */
async function findUserByAccountId(accountId: string) {
  const numericId = parseInt(accountId, 10);
  if (isNaN(numericId)) return null;

  return db.query.users.findFirst({
    where: eq(schema.users.accountId, numericId),
  });
}

/**
 * Find payment by ID with user info
 */
async function findPaymentWithUser(paymentId: string) {
  return db.query.payments.findFirst({
    where: eq(schema.payments.id, paymentId),
    with: {
      user: true,
      plan: true,
      package: true,
    },
  });
}

/**
 * Find Payme transaction by Payme ID
 */
async function findPaymeTransaction(paymeId: string) {
  return db.query.paymeTransactions.findFirst({
    where: eq(schema.paymeTransactions.paymeId, paymeId),
    with: {
      payment: {
        with: {
          user: true,
          plan: true,
          package: true,
        },
      },
    },
  });
}

/**
 * Check if transaction has timed out (12 hours)
 */
function isTransactionTimedOut(createTime: number): boolean {
  return Date.now() - createTime > PAYME_TRANSACTION_TIMEOUT_MS;
}

// ============================================
// MAIN HANDLER
// ============================================

export async function handlePaymeRequest(request: PaymeRequest, requestId: number) {
  const { method, params } = request;

  logger.info({ method, params }, 'Processing Payme request');

  try {
    switch (method) {
      case 'CheckPerformTransaction':
        return await checkPerformTransaction(params as CheckPerformTransactionParams, requestId);

      case 'CreateTransaction':
        return await createTransaction(params as CreateTransactionParams, requestId);

      case 'PerformTransaction':
        return await performTransaction(params as PerformTransactionParams, requestId);

      case 'CancelTransaction':
        return await cancelTransaction(params as CancelTransactionParams, requestId);

      case 'CheckTransaction':
        return await checkTransaction(params as CheckTransactionParams, requestId);

      case 'GetStatement':
        return await getStatement(params as GetStatementParams, requestId);

      default:
        return createPaymeErrorResponse(requestId, PaymeErrorCodes.METHOD_NOT_FOUND);
    }
  } catch (error) {
    logger.error({ error, method }, 'Error processing Payme request');
    return createPaymeErrorResponse(requestId, PaymeErrorCodes.INTERNAL_ERROR);
  }
}

// ============================================
// CheckPerformTransaction
// Validates if transaction can be performed
// ============================================

async function checkPerformTransaction(
  params: CheckPerformTransactionParams,
  requestId: number
) {
  const { amount, account } = params;

  logger.info({ amount, account }, 'CheckPerformTransaction');

  // 1. Validate account.user_id
  const user = await findUserByAccountId(account.user_id);
  if (!user) {
    return createPaymeErrorResponse(requestId, PaymeErrorCodes.USER_NOT_FOUND, 'user_id');
  }

  // 2. Parse and validate account (plan_id or package_id)
  const orderInfo = parseAccount(account);
  if (!orderInfo) {
    return createPaymeErrorResponse(requestId, PaymeErrorCodes.INVALID_ORDER_TYPE, 'plan_id');
  }

  // 3. Validate plan/package exists and get price
  let expectedAmountTiyin: number;

  if (orderInfo.type === 'plan') {
    const plan = await subscriptionService.getPlanByName(orderInfo.name).catch(() => null);
    if (!plan) {
      return createPaymeErrorResponse(requestId, PaymeErrorCodes.PLAN_NOT_FOUND, 'plan_id');
    }
    expectedAmountTiyin = plan.priceUzs * 100;
  } else {
    const pkg = await subscriptionService.getPackageByName(orderInfo.name).catch(() => null);
    if (!pkg) {
      return createPaymeErrorResponse(requestId, PaymeErrorCodes.PACKAGE_NOT_FOUND, 'package_id');
    }
    expectedAmountTiyin = pkg.priceUzs * 100;
  }

  // 4. Validate amount
  if (amount !== expectedAmountTiyin) {
    return createPaymeErrorResponse(requestId, PaymeErrorCodes.INVALID_AMOUNT);
  }

  // 5. All checks passed
  const result: CheckPerformTransactionResult = {
    allow: true,
    additional: {
      user_id: user.accountId,
    },
  };

  return createPaymeSuccessResponse(requestId, result);
}

// ============================================
// CreateTransaction
// Creates a new transaction and reserves the order
// ============================================

async function createTransaction(
  params: CreateTransactionParams,
  requestId: number
) {
  const { id: paymeId, time, amount, account } = params;

  logger.info({ paymeId, time, amount, account }, 'CreateTransaction');

  // 1. Check if transaction already exists
  const existingTx = await findPaymeTransaction(paymeId);

  if (existingTx) {
    // Transaction exists - check state
    if (existingTx.state === PaymeTransactionState.CREATED) {
      // Check timeout
      if (isTransactionTimedOut(existingTx.createTime!)) {
        // Cancel timed out transaction
        await db
          .update(schema.paymeTransactions)
          .set({
            state: PaymeTransactionState.CANCELLED,
            reason: PaymeCancelReason.TRANSACTION_TIMEOUT,
            cancelTime: Date.now(),
            updatedAt: new Date(),
          })
          .where(eq(schema.paymeTransactions.id, existingTx.id));

        return createPaymeErrorResponse(requestId, PaymeErrorCodes.UNABLE_TO_PERFORM);
      }

      // Return existing transaction
      const result: CreateTransactionResult = {
        create_time: existingTx.createTime!,
        transaction: existingTx.paymentId,
        state: existingTx.state,
      };
      return createPaymeSuccessResponse(requestId, result);
    }

    // Transaction not in CREATED state
    return createPaymeErrorResponse(requestId, PaymeErrorCodes.UNABLE_TO_PERFORM);
  }

  // 2. Validate account
  const user = await findUserByAccountId(account.user_id);
  if (!user) {
    return createPaymeErrorResponse(requestId, PaymeErrorCodes.USER_NOT_FOUND, 'user_id');
  }

  const orderInfo = parseAccount(account);
  if (!orderInfo) {
    return createPaymeErrorResponse(requestId, PaymeErrorCodes.INVALID_ORDER_TYPE, 'plan_id');
  }

  // 3. Validate plan/package exists and check amount BEFORE creating payment
  let expectedAmountTiyin: number;

  if (orderInfo.type === 'plan') {
    const plan = await subscriptionService.getPlanByName(orderInfo.name).catch(() => null);
    if (!plan) {
      return createPaymeErrorResponse(requestId, PaymeErrorCodes.PLAN_NOT_FOUND, 'plan_id');
    }
    expectedAmountTiyin = plan.priceUzs * 100;
  } else {
    const pkg = await subscriptionService.getPackageByName(orderInfo.name).catch(() => null);
    if (!pkg) {
      return createPaymeErrorResponse(requestId, PaymeErrorCodes.PACKAGE_NOT_FOUND, 'package_id');
    }
    expectedAmountTiyin = pkg.priceUzs * 100;
  }

  // 4. Validate amount BEFORE creating payment
  // This catches wrong amounts and free plans (amount = 0) early
  if (amount !== expectedAmountTiyin) {
    return createPaymeErrorResponse(requestId, PaymeErrorCodes.INVALID_AMOUNT);
  }

  // 5. Create or get pending payment
  let payment;
  try {
    if (orderInfo.type === 'plan') {
      payment = await paymentService.createPlanPaymentByName(user.id, orderInfo.name);
    } else {
      payment = await paymentService.createPackagePaymentByName(user.id, orderInfo.name);
    }
  } catch (error: any) {
    logger.error({ error, account }, 'Failed to create payment');

    if (error.code === 'PLAN_ALREADY_ACTIVE') {
      return createPaymeErrorResponse(requestId, PaymeErrorCodes.ORDER_ALREADY_PAID, 'order_id');
    }
    if (error.code === 'FREE_PLAN_NO_PAYMENT') {
      // Free plan - should have been caught by amount validation, but return proper error
      return createPaymeErrorResponse(requestId, PaymeErrorCodes.INVALID_AMOUNT);
    }
    return createPaymeErrorResponse(requestId, PaymeErrorCodes.INTERNAL_ERROR);
  }

  // 6. Check if there's already a pending Payme transaction for this payment
  // This handles the case when a new Payme transaction tries to claim an already reserved order
  const existingPaymeForPayment = await db.query.paymeTransactions.findFirst({
    where: and(
      eq(schema.paymeTransactions.paymentId, payment.id),
      eq(schema.paymeTransactions.state, PaymeTransactionState.CREATED)
    ),
  });

  if (existingPaymeForPayment) {
    // Another transaction is already processing this order
    logger.info(
      { paymeId, existingPaymeId: existingPaymeForPayment.paymeId, paymentId: payment.id },
      'Order already has a pending transaction'
    );
    return createPaymeErrorResponse(requestId, PaymeErrorCodes.ORDER_IN_PROGRESS, 'order_id');
  }

  // 7. Create Payme transaction record
  const createTime = Date.now();

  await db.insert(schema.paymeTransactions).values({
    paymentId: payment.id,
    paymeId,
    time,
    amount,
    state: PaymeTransactionState.CREATED,
    createTime,
  });

  // 6. Return success
  const result: CreateTransactionResult = {
    create_time: createTime,
    transaction: payment.id,
    state: PaymeTransactionState.CREATED,
  };

  logger.info({ paymeId, paymentId: payment.id }, 'Transaction created');

  return createPaymeSuccessResponse(requestId, result);
}

// ============================================
// PerformTransaction
// Completes the transaction and activates subscription
// ============================================

async function performTransaction(
  params: PerformTransactionParams,
  requestId: number
) {
  const { id: paymeId } = params;

  logger.info({ paymeId }, 'PerformTransaction');

  // 1. Find transaction
  const tx = await findPaymeTransaction(paymeId);

  if (!tx) {
    return createPaymeErrorResponse(requestId, PaymeErrorCodes.TRANSACTION_NOT_FOUND);
  }

  // 2. Check state
  if (tx.state === PaymeTransactionState.COMPLETED) {
    // Already completed - return success with existing data
    const result: PerformTransactionResult = {
      transaction: tx.paymentId,
      perform_time: tx.performTime!,
      state: tx.state,
    };
    return createPaymeSuccessResponse(requestId, result);
  }

  if (tx.state !== PaymeTransactionState.CREATED) {
    // Transaction cancelled or invalid state
    return createPaymeErrorResponse(requestId, PaymeErrorCodes.UNABLE_TO_PERFORM);
  }

  // 3. Check timeout
  if (isTransactionTimedOut(tx.createTime!)) {
    await db
      .update(schema.paymeTransactions)
      .set({
        state: PaymeTransactionState.CANCELLED,
        reason: PaymeCancelReason.TRANSACTION_TIMEOUT,
        cancelTime: Date.now(),
        updatedAt: new Date(),
      })
      .where(eq(schema.paymeTransactions.id, tx.id));

    return createPaymeErrorResponse(requestId, PaymeErrorCodes.UNABLE_TO_PERFORM);
  }

  // 4. Perform transaction - activate subscription/package
  const performTime = Date.now();

  try {
    // Confirm payment (this activates the plan/package)
    await paymentService.confirmPayment(tx.paymentId, paymeId, { payme_id: paymeId });

    // Update Payme transaction
    await db
      .update(schema.paymeTransactions)
      .set({
        state: PaymeTransactionState.COMPLETED,
        performTime,
        updatedAt: new Date(),
      })
      .where(eq(schema.paymeTransactions.id, tx.id));

    // 5. Send notification to user via Telegram
    const payment = tx.payment;
    if (payment?.user?.telegramId) {
      try {
        await sendPaymentNotification({
          userId: payment.userId,
          telegramId: payment.user.telegramId,
          status: 'success',
          amount: payment.amountUzs,
          paymentType: payment.paymentType as 'plan' | 'package',
          itemName: payment.plan?.displayName || payment.package?.displayName || '',
        });
      } catch (notifyError) {
        logger.error({ notifyError }, 'Failed to send payment notification');
      }
    }

    logger.info({ paymeId, paymentId: tx.paymentId }, 'Transaction performed successfully');

  } catch (error) {
    logger.error({ error, paymeId }, 'Failed to perform transaction');
    return createPaymeErrorResponse(requestId, PaymeErrorCodes.INTERNAL_ERROR);
  }

  // 6. Return success
  const result: PerformTransactionResult = {
    transaction: tx.paymentId,
    perform_time: performTime,
    state: PaymeTransactionState.COMPLETED,
  };

  return createPaymeSuccessResponse(requestId, result);
}

// ============================================
// CancelTransaction
// Cancels a transaction
// ============================================

async function cancelTransaction(
  params: CancelTransactionParams,
  requestId: number
) {
  const { id: paymeId, reason } = params;

  logger.info({ paymeId, reason }, 'CancelTransaction');

  // 1. Find transaction
  const tx = await findPaymeTransaction(paymeId);

  if (!tx) {
    return createPaymeErrorResponse(requestId, PaymeErrorCodes.TRANSACTION_NOT_FOUND);
  }

  // 2. Check if already cancelled
  if (tx.state === PaymeTransactionState.CANCELLED || tx.state === PaymeTransactionState.CANCELLED_AFTER_COMPLETE) {
    const result: CancelTransactionResult = {
      transaction: tx.paymentId,
      cancel_time: tx.cancelTime!,
      state: tx.state,
    };
    return createPaymeSuccessResponse(requestId, result);
  }

  // 3. Determine new state based on current state
  let newState: PaymeTransactionState;
  const cancelTime = Date.now();

  if (tx.state === PaymeTransactionState.CREATED) {
    // Cancel before perform
    newState = PaymeTransactionState.CANCELLED;
  } else if (tx.state === PaymeTransactionState.COMPLETED) {
    // Cancel after perform (refund)
    // For digital services, we might not allow this
    // But Payme requires it, so we mark it as cancelled_after_complete
    newState = PaymeTransactionState.CANCELLED_AFTER_COMPLETE;

    // TODO: Handle refund logic if needed
    // For now, we just mark it and would manually handle refunds
    logger.warn({ paymeId, paymentId: tx.paymentId }, 'Transaction cancelled after completion - manual refund may be needed');
  } else {
    return createPaymeErrorResponse(requestId, PaymeErrorCodes.UNABLE_TO_CANCEL);
  }

  // 4. Update transaction
  await db
    .update(schema.paymeTransactions)
    .set({
      state: newState,
      reason,
      cancelTime,
      updatedAt: new Date(),
    })
    .where(eq(schema.paymeTransactions.id, tx.id));

  // 5. Update payment status if not yet completed
  if (tx.state === PaymeTransactionState.CREATED) {
    await paymentService.failPayment(tx.paymentId, `Cancelled by Payme. Reason: ${reason}`);
  }

  // 6. Send notification about cancellation
  const payment = tx.payment;
  if (payment?.user?.telegramId) {
    try {
      await sendPaymentNotification({
        userId: payment.userId,
        telegramId: payment.user.telegramId,
        status: 'cancelled',
        amount: payment.amountUzs,
        paymentType: payment.paymentType as 'plan' | 'package',
        itemName: payment.plan?.displayName || payment.package?.displayName || '',
      });
    } catch (notifyError) {
      logger.error({ notifyError }, 'Failed to send cancellation notification');
    }
  }

  logger.info({ paymeId, paymentId: tx.paymentId, newState }, 'Transaction cancelled');

  // 7. Return success
  const result: CancelTransactionResult = {
    transaction: tx.paymentId,
    cancel_time: cancelTime,
    state: newState,
  };

  return createPaymeSuccessResponse(requestId, result);
}

// ============================================
// CheckTransaction
// Returns transaction status
// ============================================

async function checkTransaction(
  params: CheckTransactionParams,
  requestId: number
) {
  const { id: paymeId } = params;

  logger.info({ paymeId }, 'CheckTransaction');

  // 1. Find transaction
  const tx = await findPaymeTransaction(paymeId);

  if (!tx) {
    return createPaymeErrorResponse(requestId, PaymeErrorCodes.TRANSACTION_NOT_FOUND);
  }

  // 2. Return transaction status
  const result: CheckTransactionResult = {
    create_time: tx.createTime || 0,
    perform_time: tx.performTime || 0,
    cancel_time: tx.cancelTime || 0,
    transaction: tx.paymentId,
    state: tx.state,
    reason: tx.reason as PaymeCancelReason | null,
  };

  return createPaymeSuccessResponse(requestId, result);
}

// ============================================
// GetStatement
// Returns transactions for reconciliation
// ============================================

async function getStatement(
  params: GetStatementParams,
  requestId: number
) {
  const { from, to } = params;

  logger.info({ from, to }, 'GetStatement');

  // Find all transactions in the time range
  const transactions = await db.query.paymeTransactions.findMany({
    where: and(
      gte(schema.paymeTransactions.time, from),
      lte(schema.paymeTransactions.time, to)
    ),
    with: {
      payment: {
        with: {
          user: true,
          plan: true,
          package: true,
        },
      },
    },
    orderBy: (t, { asc }) => [asc(t.time)],
  });

  // Format transactions for response
  const statementTransactions: StatementTransaction[] = transactions.map((tx) => {
    const account: PaymeAccount = {
      user_id: tx.payment.user.accountId.toString(),
    };
    // Add plan_id or package_id based on payment type
    if (tx.payment.paymentType === 'plan' && tx.payment.plan) {
      account.plan_id = tx.payment.plan.name;
    } else if (tx.payment.package) {
      account.package_id = tx.payment.package.name;
    }

    return {
      id: tx.paymeId,
      time: tx.time,
      amount: tx.amount,
      account,
      create_time: tx.createTime || 0,
      perform_time: tx.performTime || 0,
      cancel_time: tx.cancelTime || 0,
      transaction: tx.paymentId,
      state: tx.state,
      reason: tx.reason as PaymeCancelReason | null,
    };
  });

  const result: GetStatementResult = {
    transactions: statementTransactions,
  };

  return createPaymeSuccessResponse(requestId, result);
}

// ============================================
// URL GENERATION (Updated for new account format)
// ============================================

/**
 * Generate Payme checkout URL with account format
 * Uses plan_id or package_id field based on order type
 */
export function generatePaymeCheckoutUrl(
  accountId: number,
  orderType: 'plan' | 'package',
  orderName: string,
  amountUzs: number
): string {
  const merchantId = config.payme.merchantId;
  if (!merchantId) {
    throw new Error('PAYME_MERCHANT_ID not configured');
  }

  // Amount in tiyin
  const amountTiyin = amountUzs * 100;

  // Build params string with correct field name (plan_id or package_id)
  // Format: m=MERCHANT_ID;ac.user_id=ACCOUNT_ID;ac.plan_id=NAME;a=AMOUNT
  const fieldName = orderType === 'plan' ? 'plan_id' : 'package_id';
  const params = `m=${merchantId};ac.user_id=${accountId};ac.${fieldName}=${orderName};a=${amountTiyin}`;

  // Base64 encode
  const encodedParams = Buffer.from(params).toString('base64');

  // Return checkout URL
  const baseUrl = config.payme.testMode
    ? 'https://checkout.test.paycom.uz'
    : 'https://checkout.paycom.uz';

  return `${baseUrl}/${encodedParams}`;
}
