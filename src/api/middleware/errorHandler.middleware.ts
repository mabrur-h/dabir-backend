import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, ValidationError } from '../../utils/errors.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('error-handler');

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // Log error
  if (err instanceof AppError && err.isOperational) {
    logger.warn({ err, code: err.code }, err.message);
  } else {
    logger.error({ err }, 'Unhandled error');
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const errors: Record<string, string[]> = {};
    err.errors.forEach((e) => {
      const path = e.path.join('.');
      if (!errors[path]) {
        errors[path] = [];
      }
      errors[path].push(e.message);
    });

    res.status(422).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: errors,
      },
    });
    return;
  }

  // Handle custom AppError
  if (err instanceof AppError) {
    const response: {
      success: boolean;
      error: {
        code: string;
        message: string;
        details?: Record<string, string[]>;
      };
    } = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    };

    if (err instanceof ValidationError) {
      response.error.details = err.errors;
    }

    res.status(err.statusCode).json(response);
    return;
  }

  // Handle unknown errors
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
};
