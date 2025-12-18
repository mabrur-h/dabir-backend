// ============================================
// PAYME MERCHANT API TYPES
// Based on: https://developer.help.paycom.uz/
// ============================================

// ============================================
// JSON-RPC BASE TYPES
// ============================================

export interface PaymeRequest {
  jsonrpc?: '2.0';
  id: number;
  method: PaymeMethod;
  params: PaymeParams;
}

export type PaymeMethod =
  | 'CheckPerformTransaction'
  | 'CreateTransaction'
  | 'PerformTransaction'
  | 'CancelTransaction'
  | 'CheckTransaction'
  | 'GetStatement';

export type PaymeParams =
  | CheckPerformTransactionParams
  | CreateTransactionParams
  | PerformTransactionParams
  | CancelTransactionParams
  | CheckTransactionParams
  | GetStatementParams;

export interface PaymeSuccessResponse<T = unknown> {
  result: T;
  id: number;
}

export interface PaymeErrorResponse {
  error: PaymeError;
  id: number;
}

export type PaymeResponse<T = unknown> = PaymeSuccessResponse<T> | PaymeErrorResponse;

// ============================================
// ERROR TYPES
// ============================================

export interface PaymeError {
  code: number;
  message: {
    ru: string;
    uz: string;
    en: string;
  };
  data?: string;
}

// ============================================
// ACCOUNT TYPE
// Payme dashboard fields: user_id + plan_id + package_id
// We always send both plan_id and package_id, using "0" for the unused one
// Example: { user_id: "100001", plan_id: "starter", package_id: "0" }
// Example: { user_id: "100001", plan_id: "0", package_id: "10hr" }
// ============================================

export interface PaymeAccount {
  user_id: string;      // User's accountId (numeric)
  plan_id: string;      // Plan name (starter, pro, business) or "0" if not applicable
  package_id: string;   // Package name (1hr, 5hr, 10hr) or "0" if not applicable
}

// ============================================
// TRANSACTION STATES
// ============================================

export enum PaymeTransactionState {
  // Positive states
  CREATED = 1,           // Transaction created, awaiting payment
  COMPLETED = 2,         // Transaction completed successfully

  // Negative states (cancelled)
  CANCELLED = -1,        // Cancelled before PerformTransaction
  CANCELLED_AFTER_COMPLETE = -2,  // Cancelled after PerformTransaction (refund)
}

// ============================================
// CANCEL REASONS
// ============================================

export enum PaymeCancelReason {
  RECEIVER_NOT_FOUND = 1,
  DEBIT_ERROR = 2,
  TRANSACTION_ERROR = 3,
  TRANSACTION_TIMEOUT = 4,
  REFUND = 5,
  UNKNOWN = 10,
}

// ============================================
// METHOD PARAMETERS
// ============================================

// CheckPerformTransaction - Validate if transaction can be performed
export interface CheckPerformTransactionParams {
  amount: number;        // Amount in tiyin (1 UZS = 100 tiyin)
  account: PaymeAccount;
}

// CreateTransaction - Create a new transaction
export interface CreateTransactionParams {
  id: string;            // Payme transaction ID
  time: number;          // Payme transaction creation time (ms)
  amount: number;        // Amount in tiyin
  account: PaymeAccount;
}

// PerformTransaction - Complete the transaction
export interface PerformTransactionParams {
  id: string;            // Payme transaction ID
}

// CancelTransaction - Cancel the transaction
export interface CancelTransactionParams {
  id: string;            // Payme transaction ID
  reason: PaymeCancelReason;
}

// CheckTransaction - Get transaction status
export interface CheckTransactionParams {
  id: string;            // Payme transaction ID
}

// GetStatement - Get transactions for a period
export interface GetStatementParams {
  from: number;          // Start time (ms)
  to: number;            // End time (ms)
}

// ============================================
// METHOD RESPONSES
// ============================================

// CheckPerformTransaction response
export interface CheckPerformTransactionResult {
  allow: boolean;
  additional?: {
    user_id: number;
    balance?: number;
  };
}

// CreateTransaction response
export interface CreateTransactionResult {
  create_time: number;   // Creation time in merchant system (ms)
  transaction: string;   // Merchant's transaction ID (our payment ID)
  state: PaymeTransactionState;
}

// PerformTransaction response
export interface PerformTransactionResult {
  transaction: string;   // Merchant's transaction ID
  perform_time: number;  // Perform time in merchant system (ms)
  state: PaymeTransactionState;
}

// CancelTransaction response
export interface CancelTransactionResult {
  transaction: string;   // Merchant's transaction ID
  cancel_time: number;   // Cancel time in merchant system (ms)
  state: PaymeTransactionState;
}

// CheckTransaction response
export interface CheckTransactionResult {
  create_time: number;
  perform_time: number;
  cancel_time: number;
  transaction: string;
  state: PaymeTransactionState;
  reason: PaymeCancelReason | null;
}

// GetStatement response - Transaction item
export interface StatementTransaction {
  id: string;            // Payme transaction ID
  time: number;          // Payme creation time
  amount: number;        // Amount in tiyin
  account: PaymeAccount;
  create_time: number;
  perform_time: number;
  cancel_time: number;
  transaction: string;   // Merchant transaction ID
  state: PaymeTransactionState;
  reason: PaymeCancelReason | null;
}

export interface GetStatementResult {
  transactions: StatementTransaction[];
}

// ============================================
// INTERNAL TYPES (for our system)
// ============================================

export interface ParsedOrderId {
  type: 'plan' | 'package';
  name: string;
}

export interface PaymeTransactionRecord {
  id: string;
  paymentId: string;
  paymeId: string;
  time: number;
  amount: number;
  state: PaymeTransactionState;
  reason: PaymeCancelReason | null;
  createTime: number | null;
  performTime: number | null;
  cancelTime: number | null;
  createdAt: Date;
  updatedAt: Date;
}
