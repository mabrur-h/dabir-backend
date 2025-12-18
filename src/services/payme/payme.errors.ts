import { PaymeError, PaymeErrorResponse } from './payme.types.js';

// ============================================
// PAYME ERROR CODES
// Based on: https://developer.help.paycom.uz/metody-merchant-api/oshibki-errors
// ============================================

export const PaymeErrorCodes = {
  // JSON-RPC standard errors
  INVALID_JSON: -32700,           // JSON parse error
  INVALID_REQUEST: -32600,        // Invalid request (missing fields)
  METHOD_NOT_FOUND: -32601,       // Unknown method
  INTERNAL_ERROR: -32400,         // Internal/system error
  INSUFFICIENT_PRIVILEGE: -32504, // Authorization error

  // Merchant-specific errors
  INVALID_AMOUNT: -31001,         // Amount mismatch
  TRANSACTION_NOT_FOUND: -31003,  // Transaction not found
  UNABLE_TO_CANCEL: -31007,       // Cannot cancel (goods delivered)
  UNABLE_TO_PERFORM: -31008,      // Cannot perform operation

  // Account errors (-31050 to -31099)
  USER_NOT_FOUND: -31050,         // User not found
  ORDER_NOT_FOUND: -31051,        // Order/payment not found
  INVALID_ORDER_TYPE: -31052,     // Invalid order type
  PLAN_NOT_FOUND: -31053,         // Plan not found
  PACKAGE_NOT_FOUND: -31054,      // Package not found
  ORDER_ALREADY_PAID: -31055,     // Order already paid
  ORDER_CANCELLED: -31056,        // Order cancelled
  ORDER_IN_PROGRESS: -31057,      // Order already has a pending transaction
} as const;

// ============================================
// ERROR MESSAGES (Localized)
// ============================================

type ErrorMessages = {
  [key: number]: {
    ru: string;
    uz: string;
    en: string;
  };
};

export const PaymeErrorMessages: ErrorMessages = {
  [PaymeErrorCodes.INVALID_JSON]: {
    ru: 'Ошибка парсинга JSON',
    uz: 'JSON tahlil qilishda xatolik',
    en: 'JSON parsing error',
  },
  [PaymeErrorCodes.INVALID_REQUEST]: {
    ru: 'Неверный запрос',
    uz: 'Noto\'g\'ri so\'rov',
    en: 'Invalid request',
  },
  [PaymeErrorCodes.METHOD_NOT_FOUND]: {
    ru: 'Метод не найден',
    uz: 'Metod topilmadi',
    en: 'Method not found',
  },
  [PaymeErrorCodes.INTERNAL_ERROR]: {
    ru: 'Внутренняя ошибка сервера',
    uz: 'Server ichki xatosi',
    en: 'Internal server error',
  },
  [PaymeErrorCodes.INSUFFICIENT_PRIVILEGE]: {
    ru: 'Недостаточно прав',
    uz: 'Ruxsat etilmagan',
    en: 'Insufficient privilege',
  },
  [PaymeErrorCodes.INVALID_AMOUNT]: {
    ru: 'Неверная сумма',
    uz: 'Noto\'g\'ri summa',
    en: 'Invalid amount',
  },
  [PaymeErrorCodes.TRANSACTION_NOT_FOUND]: {
    ru: 'Транзакция не найдена',
    uz: 'Tranzaksiya topilmadi',
    en: 'Transaction not found',
  },
  [PaymeErrorCodes.UNABLE_TO_CANCEL]: {
    ru: 'Невозможно отменить транзакцию',
    uz: 'Tranzaksiyani bekor qilib bo\'lmaydi',
    en: 'Unable to cancel transaction',
  },
  [PaymeErrorCodes.UNABLE_TO_PERFORM]: {
    ru: 'Невозможно выполнить операцию',
    uz: 'Operatsiyani bajarib bo\'lmaydi',
    en: 'Unable to perform operation',
  },
  [PaymeErrorCodes.USER_NOT_FOUND]: {
    ru: 'Пользователь не найден',
    uz: 'Foydalanuvchi topilmadi',
    en: 'User not found',
  },
  [PaymeErrorCodes.ORDER_NOT_FOUND]: {
    ru: 'Заказ не найден',
    uz: 'Buyurtma topilmadi',
    en: 'Order not found',
  },
  [PaymeErrorCodes.INVALID_ORDER_TYPE]: {
    ru: 'Неверный тип заказа',
    uz: 'Noto\'g\'ri buyurtma turi',
    en: 'Invalid order type',
  },
  [PaymeErrorCodes.PLAN_NOT_FOUND]: {
    ru: 'Тариф не найден',
    uz: 'Tarif topilmadi',
    en: 'Plan not found',
  },
  [PaymeErrorCodes.PACKAGE_NOT_FOUND]: {
    ru: 'Пакет не найден',
    uz: 'Paket topilmadi',
    en: 'Package not found',
  },
  [PaymeErrorCodes.ORDER_ALREADY_PAID]: {
    ru: 'Заказ уже оплачен',
    uz: 'Buyurtma allaqachon to\'langan',
    en: 'Order already paid',
  },
  [PaymeErrorCodes.ORDER_CANCELLED]: {
    ru: 'Заказ отменен',
    uz: 'Buyurtma bekor qilingan',
    en: 'Order cancelled',
  },
  [PaymeErrorCodes.ORDER_IN_PROGRESS]: {
    ru: 'Заказ уже обрабатывается другой транзакцией',
    uz: 'Buyurtma boshqa tranzaksiya tomonidan qayta ishlanmoqda',
    en: 'Order is already being processed by another transaction',
  },
};

// ============================================
// ERROR HELPER FUNCTIONS
// ============================================

export function createPaymeError(
  code: number,
  data?: string,
  customMessage?: { ru: string; uz: string; en: string }
): PaymeError {
  const message = customMessage || PaymeErrorMessages[code] || {
    ru: 'Неизвестная ошибка',
    uz: 'Noma\'lum xatolik',
    en: 'Unknown error',
  };

  return {
    code,
    message,
    data,
  };
}

export function createPaymeErrorResponse(
  id: number,
  code: number,
  data?: string,
  customMessage?: { ru: string; uz: string; en: string }
): PaymeErrorResponse {
  return {
    error: createPaymeError(code, data, customMessage),
    id,
  };
}

export function createPaymeSuccessResponse<T>(id: number, result: T) {
  return {
    result,
    id,
  };
}

// ============================================
// PAYME IP WHITELIST
// Requests should only come from these IPs
// ============================================

export const PAYME_IP_WHITELIST = [
  // Official Payme IPs (185.234.113.1 - 185.234.113.15)
  // Source: https://developer.help.paycom.uz/protokol-merchant-api/skhema-vzaimodeystviya
  '185.234.113.1',
  '185.234.113.2',
  '185.234.113.3',
  '185.234.113.4',
  '185.234.113.5',
  '185.234.113.6',
  '185.234.113.7',
  '185.234.113.8',
  '185.234.113.9',
  '185.234.113.10',
  '185.234.113.11',
  '185.234.113.12',
  '185.234.113.13',
  '185.234.113.14',
  '185.234.113.15',
];

// Also allow these for testing
export const PAYME_TEST_IPS = [
  '127.0.0.1',
  '::1',
  'localhost',
];

// Transaction timeout (12 hours in milliseconds)
export const PAYME_TRANSACTION_TIMEOUT_MS = 43200000;
