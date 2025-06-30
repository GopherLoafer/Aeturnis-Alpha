/**
 * Error handling utilities for type-safe error management
 */

/**
 * Type guard to check if a value is an Error object
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Get error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as any).message);
  }

  return 'An unknown error occurred';
}

/**
 * Convert unknown error to Error object
 */
export function toError(error: unknown): Error {
  if (isError(error)) {
    return error;
  }

  return new Error(getErrorMessage(error));
}

/**
 * Create error with stack trace preservation
 */
export function createError(message: string, originalError?: unknown): Error {
  const error = new Error(message);

  if (originalError && isError(originalError)) {
    error.stack = originalError.stack;
    error.cause = originalError;
  }

  return error;
}

/**
 * Safely get error stack trace
 */
export function getErrorStack(error: unknown): string | undefined {
  if (isError(error)) {
    return error.stack;
  }
  return undefined;
}

/**
 * Safely handle delay parameter with type checking
 */
export function parseDelay(delay: unknown): number {
  if (typeof delay === 'number' && !isNaN(delay) && delay >= 0) {
    return delay;
  }
  return 1000; // Default 1 second delay
}

/**
 * Type-safe JSON parsing with error handling
 */
export function safeJsonParse<T = unknown>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
      } catch (error) {
    return null;
  }
}

/**
 * Type-safe property access for objects
 */
export function hasProperty<T extends object, K extends PropertyKey>(
  obj: T,
  key: K
): obj is T & Record<K, unknown> {
  return key in obj;
}