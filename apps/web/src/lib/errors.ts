type AppErrorCode =
  | 'offline'
  | 'permission-denied'
  | 'quota-exceeded'
  | 'not-found'
  | 'unauthenticated'
  | 'not-implemented'
  | 'unknown';

interface AppErrorOptions {
  code?: AppErrorCode;
  status?: number;
  cause?: unknown;
  retryable?: boolean;
}

/**
 * Single error type for the whole app. `message` must always be user-readable
 * Thai; technical detail belongs in `cause` and the central logger.
 */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  override readonly cause?: unknown;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = 'AppError';
    this.code = options.code ?? 'unknown';
    this.status = options.status ?? 500;
    this.retryable = options.retryable ?? (this.code === 'offline' || this.status >= 500);
    this.cause = options.cause;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/** Backwards-compatible alias used across the existing data layer. */
export class ApiError extends AppError {
  constructor(message: string, status: number, options: Omit<AppErrorOptions, 'status'> = {}) {
    super(message, { ...options, status });
    this.name = 'ApiError';
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function toAppError(error: unknown, fallbackMessage = 'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง'): AppError {
  if (error instanceof AppError) return error;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return new AppError('ออฟไลน์อยู่ ข้อมูลจะถูกบันทึกในเครื่องและซิงก์เมื่อกลับมาออนไลน์', {
      code: 'offline',
      status: 0,
      cause: error,
      retryable: true,
    });
  }
  const rawMessage = error instanceof Error ? error.message : '';
  const isPermission = /permission|insufficient/i.test(rawMessage);
  const isQuota = /quota|resource-exhausted/i.test(rawMessage);
  return new AppError(fallbackMessage, {
    code: isPermission ? 'permission-denied' : isQuota ? 'quota-exceeded' : 'unknown',
    status: isPermission ? 403 : isQuota ? 429 : 500,
    cause: error,
    retryable: !isPermission,
  });
}

export function errorMessage(error: unknown): string {
  return toAppError(error).message;
}
