/**
 * Error Handling Utilities
 * Type-safe error handling for catch blocks and unknown errors
 */

/**
 * Type guard to check if an error is an Error instance
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Type guard to check if an error has a message property
 */
export function hasMessage(error: unknown): error is { message: string } {
  return typeof error === 'object' && error !== null && 'message' in error;
}

/**
 * Safely extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return getErrorMessage(error);
  }
  
  if (hasMessage(error)) {
    return String(getErrorMessage(error));
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  return 'Unknown error occurred';
}

/**
 * Safely extract error stack from unknown error
 */
export function getErrorStack(error: unknown): string | undefined {
  if (isError(error)) {
    return error.stack;
  }
  return undefined;
}

/**
 * Convert unknown error to Error instance
 */
export function toError(error: unknown): Error {
  if (isError(error)) {
    return error;
  }
  
  const message = getErrorMessage(error);
  return new Error(message);
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
  } catch {
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